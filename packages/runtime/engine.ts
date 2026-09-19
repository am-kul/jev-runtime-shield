import { performance } from "node:perf_hooks";
import { SQLiteActivityStore } from "../activity-store";
import { actors, seedHistory } from "../activity-store/seed";
import { buildContext } from "../context";
import { evaluate } from "../detection/provider";
import { ReplayDecisionProvider } from "../detection/replay-provider";
import { JevDecisionProvider } from "../detection/jev-provider";
import {
  decidePolicy,
  enforcePolicy,
  initialProductState,
  requestGate,
  defaultThresholds,
  type Thresholds,
} from "../policy";
import {
  eventSchema,
  type ActivityEvent,
  type ProductState,
  type RuntimeState,
} from "../shared/types";
import { getScenario, scenarios, type Scenario } from "./scenarios";

export interface EngineConfig {
  mode: "replay" | "jev";
  key?: string;
  model?: string;
  timeoutMs?: number;
  thresholds?: Thresholds;
}

/** One local process, one active demo. All mutations are serialized. */
export class RuntimeEngine {
  state!: RuntimeState;
  private products = new Map<string, ProductState>();
  private listeners = new Set<(state: RuntimeState) => void>();
  private scenario: Scenario = getScenario("demo-story");
  private cursor = 0;
  private origin = Date.now();
  private timer?: ReturnType<typeof setInterval>;
  private generation = 0;
  private controller = new AbortController();
  private queue: Promise<unknown> = Promise.resolve();
  private ticking = false;
  constructor(
    readonly store: SQLiteActivityStore,
    readonly config: EngineConfig,
  ) {}
  private serial<T>(work: () => Promise<T>): Promise<T> {
    const next = this.queue.then(work, work);
    this.queue = next.catch(() => undefined);
    return next;
  }
  async init() {
    await this.reset();
    return this;
  }
  snapshot(): RuntimeState {
    return structuredClone(this.state);
  }
  subscribe(fn: (state: RuntimeState) => void) {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
  private emit() {
    const snapshot = this.snapshot();
    for (const listener of this.listeners) listener(snapshot);
  }
  private stop() {
    this.generation++;
    this.controller.abort();
    this.controller = new AbortController();
    clearInterval(this.timer);
  }
  private async clearState() {
    this.store.clear();
    seedHistory(this.store);
    this.products = new Map(actors.map((a) => [a.id, initialProductState()]));
    this.cursor = 0;
    this.state = {
      mode: this.config.mode,
      running: false,
      phase: "ready",
      elapsedMs: 0,
      durationMs: 25000,
      scenarioId: "demo-story",
      scenarioName: "Recon to exfiltration",
      actorId: "alex@acme.com",
      actorName: "Alex Morgan",
      events: [],
      history: await this.store.getHistoricalSummary("alex@acme.com"),
      context: null,
      decisionContext: null,
      decisions: null,
      policy: null,
      product: this.products.get("alex@acme.com")!,
      audit: [],
      error: null,
      metrics: {
        eventsProcessed: 0,
        requestsPerSecond: Array.from({ length: 30 }, () => 0),
        decisions: 0,
        contextMs: null,
        decisionMs: null,
        runtimeMs: 0,
      },
      scenarios: scenarios.map(({ id, name, description }) => ({ id, name, description })),
    };
    this.persistProduct();
  }
  reset() {
    this.stop();
    return this.serial(async () => {
      await this.clearState();
      this.emit();
      return this.snapshot();
    });
  }
  start(id = "demo-story", automatic = true) {
    const scenario = getScenario(id); // Validate before disrupting an active run.
    this.stop();
    const generation = this.generation;
    return this.serial(async () => {
      await this.clearState();
      if (generation !== this.generation) return this.snapshot();
      this.scenario = scenario;
      this.origin = Date.now();
      Object.assign(this.state, {
        scenarioId: id,
        scenarioName: scenario.name,
        durationMs: scenario.durationMs,
        running: true,
      });
      this.emit();
      if (automatic)
        this.timer = setInterval(() => {
          if (this.ticking || generation !== this.generation) return;
          this.ticking = true;
          void this.advance(Date.now() - this.origin, generation).finally(() => {
            this.ticking = false;
          });
        }, 100);
      return this.snapshot();
    });
  }
  advance(elapsedMs: number, generation = this.generation) {
    return this.serial(async () => {
      if (!this.state.running || generation !== this.generation) return this.snapshot();
      try {
        while (
          this.cursor < this.scenario.steps.length &&
          this.scenario.steps[this.cursor].afterMs <= elapsedMs
        ) {
          const step = this.scenario.steps[this.cursor++];
          const now = this.origin + step.afterMs;
          if (step.phase) this.state.phase = step.phase;
          if (step.focus) {
            this.state.actorId = step.focus;
            this.state.actorName = actors.find((a) => a.id === step.focus)?.name ?? step.focus;
            this.state.product = this.products.get(step.focus)!;
            this.state.decisions = null;
            this.state.policy = null;
            this.state.context = null;
            this.state.decisionContext = null;
            this.state.history = await this.store.getHistoricalSummary(step.focus, now);
          }
          for (let i = 0; i < step.repeat; i++)
            for (const template of step.events) {
              await this.ingest(
                eventSchema.parse({ ...template, id: crypto.randomUUID(), at: now }),
              );
            }
          if (step.events.some((e) => e.actorId === this.state.actorId)) {
            const started = performance.now();
            this.state.context = await buildContext(this.store, this.state.actorId, now);
            this.state.metrics.contextMs = performance.now() - started;
          }
          if (step.evaluate) {
            await this.classify(step.fixture!, step.evaluate, now, generation);
            if (generation !== this.generation) return this.snapshot();
          }
        }
        this.state.elapsedMs = Math.min(elapsedMs, this.state.durationMs);
        this.state.metrics.runtimeMs = Math.max(0, Date.now() - this.origin);
        if (elapsedMs >= this.state.durationMs) {
          this.state.running = false;
          this.state.phase = "complete";
          clearInterval(this.timer);
        }
      } catch (error) {
        if (generation !== this.generation) return this.snapshot();
        this.state.error =
          error instanceof Error ? error.message : "Decision failed. Request held.";
        this.state.running = false;
        clearInterval(this.timer);
      }
      this.emit();
      return this.snapshot();
    });
  }
  private async ingest(event: ActivityEvent) {
    const product = this.products.get(event.actorId) ?? initialProductState();
    const gate = requestGate(product, event.sourceId, event.authenticated);
    if (!gate.allowed) event.status = gate.status;
    if (event.category === "exports" && event.status < 400 && gate.allowed) {
      product.export = { status: "pending", requested: event.records, released: 0 };
    }
    await this.store.record(event);
    this.products.set(event.actorId, product);
    if (event.actorId === this.state.actorId) this.state.product = product;
    this.state.events = [event, ...this.state.events].slice(0, 16);
    this.state.metrics.eventsProcessed += event.count;
    const bucket = Math.max(0, Math.min(29, Math.floor((event.at - this.origin) / 1000)));
    this.state.metrics.requestsPerSecond[bucket] += event.count;
    this.persistProduct();
  }
  private provider(fixture: string) {
    return this.config.mode === "replay"
      ? new ReplayDecisionProvider(fixture)
      : new JevDecisionProvider({
          key: this.config.key ?? "",
          model: this.config.model,
          timeoutMs: this.config.timeoutMs,
          signal: this.controller.signal,
        });
  }
  private async classify(fixture: string, stage: "actor" | "all", now: number, generation: number) {
    const begin = performance.now();
    const context = await buildContext(this.store, this.state.actorId, now);
    const contextMs = performance.now() - begin;
    const start = performance.now();
    const provider = this.provider(fixture);
    const decisions =
      stage === "actor"
        ? { actor: await provider.classifyActor(context) }
        : await evaluate(provider, context);
    if (generation !== this.generation) return;
    this.state.context = context;
    this.state.decisionContext = context;
    this.state.history = context.history;
    this.state.decisions = decisions;
    Object.assign(this.state.metrics, {
      contextMs,
      decisionMs: performance.now() - start,
      decisions: this.state.metrics.decisions + 1,
    });
    if ("intent" in decisions) {
      const policy = decidePolicy(decisions, context, this.config.thresholds ?? defaultThresholds);
      this.state.policy = policy;
      const product = enforcePolicy(this.products.get(context.actorId)!, policy, context);
      // Distributed telemetry: local synthetic rules cover each observed source.
      if (policy.actions.includes("SIMULATED_EDGE_MITIGATION")) {
        const events = await this.store.getRecentActivity(context.actorId, now);
        product.deniedSources = [
          ...new Set([...product.deniedSources, ...events.map((e) => e.sourceId)]),
        ];
      }
      this.products.set(context.actorId, product);
      this.state.product = product;
      for (const action of policy.actions) {
        const scope = [
          "BLOCK_SOURCE",
          "DROP_REQUESTS",
          "RATE_LIMIT",
          "TEMPORARY_DENY_RULE",
        ].includes(action)
          ? context.sourceId
          : context.actorId;
        this.state.audit.push({ at: now, actorId: context.actorId, action, scope });
        this.store.db
          .prepare("INSERT INTO policy_audit(at, actor_id, action, scope) VALUES (?, ?, ?, ?)")
          .run(now, context.actorId, action, scope);
      }
      this.persistProduct();
    }
  }
  private persistProduct() {
    this.store.db
      .prepare("INSERT OR REPLACE INTO product_state VALUES (1, ?)")
      .run(JSON.stringify(Object.fromEntries(this.products)));
  }
  /** Real local request gate, used by the synthetic product API and integration tests. */
  checkAccess(actorId: string, sourceId = "session-source", authenticated = true) {
    const product = this.products.get(actorId);
    return product
      ? requestGate(product, sourceId, authenticated)
      : { allowed: false, status: 404, reason: "Unknown synthetic actor" };
  }
  requestExport(records: number, verify = false) {
    return this.serial(async () => {
      if (this.state.running)
        return { status: 409, reason: "A scenario is running. Wait for completion or reset." };
      const actorId = "alex@acme.com";
      const product = this.products.get(actorId)!;
      if (
        verify &&
        (this.state.scenarioId !== "unusual-benign" || product.export.status !== "challenge")
      )
        return { status: 409, reason: "No approved export awaiting demo verification" };
      if (verify) product.challengeRequired = false;
      const gate = this.checkAccess(actorId);
      if (!gate.allowed) return { status: gate.status, reason: gate.reason };
      this.state.actorId = actorId;
      this.state.actorName = "Alex Morgan";
      await this.ingest(
        eventSchema.parse({
          id: crypto.randomUUID(),
          at: Date.now(),
          actorId,
          actorName: "Alex Morgan",
          category: "exports",
          path: "/api/exports",
          method: "POST",
          status: 202,
          records,
          authenticated: true,
          sourceId: "session-source",
          sessionId: "alex-session",
          mfaVerified: verify,
          approvedExport: verify,
        }),
      );
      try {
        await this.classify(
          verify ? "unusual-benign" : "data-exfiltration",
          "all",
          Date.now(),
          this.generation,
        );
      } catch (error) {
        this.state.error =
          error instanceof Error ? error.message : "Decision failed. Request held.";
        this.emit();
        return { status: 503, reason: this.state.error };
      }
      this.emit();
      const exp = this.state.product.export;
      return {
        status: exp.status === "completed" ? 200 : exp.status === "challenge" ? 401 : 403,
        export: exp,
        reason: this.state.policy?.reason,
      };
    });
  }
  dispose() {
    this.stop();
    this.listeners.clear();
    this.store.close();
  }
}
