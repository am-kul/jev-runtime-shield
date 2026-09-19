"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Activity, ArrowLeft, ArrowRight, Play, Radio, RotateCcw } from "lucide-react";
import type { ActivityEvent, RuntimeState } from "@/packages/shared/types";

const json = (value: unknown) => JSON.stringify(value, null, 2);
const number = (v: number) => v.toLocaleString("en-US");
const ms = (v: number | null | undefined) =>
  v === null || v === undefined ? null : v < 1 ? "<1" : Math.round(v).toString();

function highlightJson(value: unknown) {
  const escaped = json(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(
    /("(\\u[a-fA-F0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g,
    (match) => {
      const cls = /^"/.test(match)
        ? /:$/.test(match)
          ? "json-key"
          : "json-string"
        : /true|false/.test(match)
          ? "json-boolean"
          : /null/.test(match)
            ? "json-null"
            : "json-number";
      return `<span class="${cls}">${match}</span>`;
    },
  );
}

export function Showcase() {
  const [state, setState] = useState<RuntimeState | null>(null);
  const [connected, setConnected] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);

  useEffect(() => {
    const stream = new EventSource("/api/stream");
    stream.onmessage = (event) => {
      setState(JSON.parse(event.data));
      setConnected(true);
    };
    stream.onerror = () => setConnected(false);
    return () => stream.close();
  }, []);

  async function command(action: "start" | "reset") {
    setBusy(true);
    setClientError(null);
    try {
      const response = await fetch("/api/runtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, scenario: "data-exfiltration" }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not update the decision flow");
      setState(payload);
    } catch (error) {
      setClientError(error instanceof Error ? error.message : "Could not connect");
    } finally {
      setBusy(false);
    }
  }

  const context = state?.decisionContext ?? state?.context;
  const decisions = state?.decisions;
  const policy = state?.policy;
  const running = state?.running ?? false;
  const complete = state?.phase === "complete";
  const blocked = state?.product.export.status === "blocked";
  const input = context
    ? {
        actorId: context.actorId,
        authenticated: context.authenticated,
        sourceId: context.sourceId,
        windowSeconds: context.windowSeconds,
        features: {
          requests_last_60_seconds: context.features.requests_last_60_seconds,
          unique_routes: context.features.unique_routes,
          records_requested: context.features.records_requested,
          first_time_export: context.features.first_time_export,
          accounts_targeted: context.features.accounts_targeted,
        },
        history: {
          totalEvents: context.history.totalEvents,
          requestsPerMinute: context.history.requestsPerMinute,
        },
        recentEvents: `${context.recentEvents.length} events (key fields shown; full payload is larger)`,
      }
    : { status: "waiting_for_activity" };
  const output = decisions ?? {
    status: context ? "calling_jev" : "waiting_for_state",
  };
  const codeDecision = policy
    ? {
        policy,
        appliedActions: state?.audit.map(({ action, scope }) => ({ action, scope })) ?? [],
        result: {
          exportStatus: state?.product.export.status,
          recordsRequested: state?.product.export.requested,
          recordsReleased: state?.product.export.released,
          sessionValid: state?.product.sessionValid,
          credentialsValid: state?.product.credentialsValid,
          accountActive: state?.product.accountActive,
        },
      }
    : { status: "waiting_for_jev" };

  return (
    <main className={`json-showcase ${blocked ? "is-blocked" : ""}`}>
      <header className="json-showcase-header">
        <div className="json-showcase-brand">
          <Link className="json-back" href="/" aria-label="Back to application">
            <ArrowLeft size={16} />
          </Link>
          <strong>jev</strong>
          <span />
          <p>Live decision trace</p>
        </div>
        <div className="json-showcase-controls">
          <span className={`json-mode ${state?.mode === "jev" ? "live" : "replay"}`}>
            <i /> {state?.mode === "jev" ? "LIVE JEV" : "AUTHORED REPLAY"}
          </span>
          <button
            className="json-reset"
            aria-label="Reset decision flow"
            onClick={() => command("reset")}
            disabled={busy || !state}
          >
            <RotateCcw size={17} />
          </button>
          <button
            className="json-run"
            aria-label="Run Jev decision flow"
            onClick={() => command("start")}
            disabled={busy || running || !connected}
          >
            <Play size={15} fill="currentColor" />
            {busy ? "PREPARING" : running ? "RUNNING" : "RUN LIVE TRACE"}
          </button>
        </div>
      </header>

      <section className="json-showcase-title">
        <div>
          <span>ONE DECISION, END TO END</span>
          <h1>Raw input → Jev output → code action.</h1>
        </div>
        <p>
          The exact state Jev evaluates, the typed response it returns, and the deterministic code
          decision that follows.
        </p>
      </section>

      {(clientError || state?.error) && (
        <div className="json-error" role="alert">
          {clientError || state?.error}
        </div>
      )}

      <section className="json-activity-strip" aria-label="Recent activity feeding the request">
        <div className="json-activity-strip-heading">
          <Radio size={14} />
          <span>LIVE ACTIVITY</span>
          <span className="json-activity-strip-actor">{state?.actorName ?? "—"}</span>
          <span className="json-activity-strip-count">
            {state ? number(state.metrics.eventsProcessed) : "0"} events
          </span>
        </div>
        <div className="json-activity-strip-row">
          <AnimatePresence initial={false}>
            {state?.events
              .slice(0, 8)
              .reverse()
              .map((event) => (
                <EventChip event={event} key={event.id} />
              ))}
          </AnimatePresence>
          {!state?.events.length && (
            <span className="json-activity-strip-empty">
              <Activity size={14} /> Listening for activity — the trace starts with a single request
            </span>
          )}
        </div>
      </section>

      <section className="json-scene">
        <div className="json-flow" aria-label="Jev JSON decision flow">
          <JsonPanel
            step="01"
            eyebrow="INPUT"
            title="State JSON sent to Jev (key fields)"
            status={context ? "SENT" : "BUILDING"}
            tone="input"
            value={input}
            testId="jev-input-json"
          />
          <ArrowRight className="json-flow-arrow" size={22} />
          <JsonPanel
            step="02"
            eyebrow="JEV"
            title="Typed output JSON"
            status={decisions ? "JEV DECIDES" : context ? "CALLING JEV" : "WAITING"}
            timing={decisions ? ms(state?.metrics.decisionMs) : null}
            tone="jev"
            value={output}
            testId="jev-output-json"
          />
          <ArrowRight className="json-flow-arrow" size={22} />
          <JsonPanel
            step="03"
            eyebrow="APPLICATION CODE"
            title="Policy decision JSON"
            status={policy ? "CODE ENFORCES" : "WAITING"}
            tone="code"
            value={codeDecision}
            testId="code-decision-json"
          />
        </div>
      </section>

      <footer
        className="json-showcase-footer"
        data-testid={complete ? "showcase-complete" : undefined}
      >
        <div>
          <span className="json-footer-label">RESULT</span>
          <strong>{blocked ? "REQUEST BLOCKED" : policy ? policy.outcome : "EVALUATING"}</strong>
        </div>
        <div className="json-footer-path">
          <span>JSON STATE</span>
          <ArrowRight size={13} />
          <span>JEV</span>
          <ArrowRight size={13} />
          <span>CODE</span>
        </div>
        <div className="json-records">
          <span>JEV DECISION TIME</span>
          <strong>
            {ms(state?.metrics.decisionMs) ?? "—"}
            {state?.metrics.decisionMs != null && <small>ms</small>}
          </strong>
        </div>
      </footer>
    </main>
  );
}

function EventChip({ event }: { event: ActivityEvent }) {
  return (
    <motion.div
      className={`json-activity-chip ${event.status >= 400 ? "warning" : ""}`}
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <span className="json-activity-chip-dot" />
      <code>
        {event.method} {event.path}
      </code>
      <small>{event.count > 1 ? `×${number(event.count)}` : event.status}</small>
    </motion.div>
  );
}

function JsonPanel({
  step,
  eyebrow,
  title,
  status,
  timing,
  tone,
  value,
  testId,
}: {
  step: string;
  eyebrow: string;
  title: string;
  status: string;
  timing?: string | null;
  tone: "input" | "jev" | "code";
  value: unknown;
  testId: string;
}) {
  return (
    <article className={`json-panel json-panel-${tone}`}>
      <div className="json-panel-heading">
        <div>
          <span className="json-panel-step">{step}</span>
          <span className="json-panel-eyebrow">{eyebrow}</span>
          <h2>{title}</h2>
        </div>
        <div className="json-panel-status-group">
          <span className="json-panel-status">{status}</span>
          {timing && <span className="json-panel-timing">{timing}ms</span>}
        </div>
      </div>
      <pre data-testid={testId} dangerouslySetInnerHTML={{ __html: highlightJson(value) }} />
    </article>
  );
}
