import { afterEach, describe, expect, it, vi } from "vitest";
import { RuntimeEngine } from "../packages/runtime/engine";
import { SQLiteActivityStore } from "../packages/activity-store";
import { scenarios, scenarioSchema, getScenario } from "../packages/runtime/scenarios";
import { localMutation } from "../packages/runtime/http";

const engines: RuntimeEngine[] = [];
async function engine(mode: "replay" | "jev" = "replay") {
  const e = await new RuntimeEngine(new SQLiteActivityStore(), { mode }).init();
  engines.push(e);
  return e;
}
afterEach(() => {
  engines.splice(0).forEach((e) => e.dispose());
  vi.restoreAllMocks();
});
describe("scenario execution and enforcement", () => {
  it("validates all data-driven scenarios and rejects malformed timelines", () => {
    expect(scenarios).toHaveLength(11);
    expect(() => getScenario("missing")).toThrow();
    expect(() =>
      scenarioSchema.parse({
        id: "bad",
        name: "Bad",
        description: "",
        durationMs: 1000,
        steps: [{ afterMs: 2000 }],
      }),
    ).toThrow();
    expect(() =>
      scenarioSchema.parse({
        id: "bad",
        name: "Bad",
        description: "",
        durationMs: 1000,
        steps: [{ afterMs: 0, evaluate: "all" }],
      }),
    ).toThrow();
  });
  it("runs the entire story, holds the export, enforces containment, and keeps legitimate users active", async () => {
    const e = await engine();
    await e.start("demo-story", false);
    await e.advance(0);
    expect(e.state.decisions?.actor?.label).toBe("HUMAN");
    expect(e.state.policy?.outcome).toBe("ALLOW");
    await e.advance(3000);
    expect(e.state.decisions?.actor?.label).toBe("BOT");
    expect(e.state.policy?.outcome).toBe("ALLOW");
    await e.advance(9000);
    expect(e.state.context!.features.requests_last_10_seconds).toBe(78);
    expect(e.state.decisions?.intent).toBeUndefined();
    await e.advance(11000);
    expect(e.state.policy?.outcome).toBe("CONTAIN");
    expect(e.checkAccess("alex@acme.com", "probe-source", false).allowed).toBe(false);
    expect(e.checkAccess("alex@acme.com", "session-source").allowed).toBe(true);
    await e.advance(16000);
    expect(e.state.product.export).toEqual({ status: "pending", requested: 48219, released: 0 });
    expect(e.state.context!.features.first_time_admin_access).toBe(true);
    expect(e.state.history.counts.admin).toBe(0);
    await e.advance(19000);
    expect(e.state.decisions?.threat?.label).toBe("DATA_EXFILTRATION");
    expect(e.state.product.accountActive).toBe(false);
    expect(e.state.product.export.released).toBe(0);
    await e.advance(25000);
    expect(e.state.running).toBe(false);
    expect(e.state.phase).toBe("complete");
    expect(e.state.elapsedMs).toBe(25000);
    expect(
      e.state.events.some((event) => event.actorId !== "alex@acme.com" && event.status === 200),
    ).toBe(true);
    expect(e.checkAccess("sarah@acme.com").allowed).toBe(true);
    expect((await e.requestExport(48219)).status).toBe(403);
    expect(
      Number(
        e.store.db
          .prepare("SELECT COUNT(*) AS n FROM policy_audit WHERE action='REVOKE_SESSION'")
          .get()!.n,
      ),
    ).toBe(1);
    const persisted = JSON.parse(
      e.store.db.prepare("SELECT payload FROM product_state").get()!.payload as string,
    );
    expect(persisted["alex@acme.com"].accountActive).toBe(false);
  });
  it.each(scenarios.filter((s) => s.id !== "demo-story").map((s) => [s.id]))(
    "completes %s with fixture-backed decisions",
    async (id) => {
      const e = await engine();
      const s = getScenario(id);
      await e.start(id, false);
      await e.advance(s.durationMs);
      expect(e.state.error).toBeNull();
      expect(e.state.running).toBe(false);
      expect(e.state.decisions?.actor).toBeDefined();
      expect(e.state.policy).toBeDefined();
      if (id === "unusual-benign") {
        expect(e.state.policy?.outcome).toBe("CHALLENGE");
        expect(e.state.product.accountActive).toBe(true);
        expect((await e.requestExport(48219, true)).status).toBe(200);
      }
      if (id === "ddos") {
        expect(e.state.product.edgeMitigation).toBe(true);
        expect(e.state.product.deniedSources).toHaveLength(24);
      }
    },
  );
  it("reset discards live state, restores accounts, and deterministically reseeds history", async () => {
    const e = await engine();
    await e.start("data-exfiltration", false);
    await e.advance(8000);
    await e.reset();
    expect(e.state.phase).toBe("ready");
    expect(e.state.events).toEqual([]);
    expect(e.state.history.totalEvents).toBe(1728);
    expect(e.state.audit).toEqual([]);
    expect(e.checkAccess("alex@acme.com").allowed).toBe(true);
    expect(await e.store.getRecentActivity("alex@acme.com")).toEqual([]);
  });
  it("missing live credentials surface an error instead of a fabricated result", async () => {
    const e = await engine("jev");
    await e.start("demo-story", false);
    await e.advance(0);
    expect(e.state.mode).toBe("jev");
    expect(e.state.error).toContain("TYPESAFE_API_KEY");
    expect(e.state.decisions).toBeNull();
    expect(e.state.running).toBe(false);
  });
  it("rejects remote origins and hosts for mutable local endpoints", () => {
    expect(
      localMutation(
        new Request("http://127.0.0.1:3000/api/runtime", {
          headers: { host: "127.0.0.1:3000", origin: "https://attacker.example" },
        }),
      )?.status,
    ).toBe(403);
    expect(
      localMutation(
        new Request("http://127.0.0.1:3000/api/runtime", { headers: { host: "evil.example" } }),
      )?.status,
    ).toBe(403);
    expect(
      localMutation(
        new Request("http://127.0.0.1:3000/api/runtime", {
          headers: { host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" },
        }),
      ),
    ).toBeNull();
  });
});
