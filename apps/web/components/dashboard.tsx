"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  ArrowUpRight,
  Check,
  Code2,
  KeyRound,
  Play,
  Radio,
  RotateCcw,
  Shield,
  ShieldCheck,
  ShieldOff,
  Sparkles,
} from "lucide-react";
import type { ActivityEvent, RuntimeState } from "@/packages/shared/types";

const readable = (v: string) => v.toLowerCase().replaceAll("_", " ");
const number = (v: number) => v.toLocaleString("en-US");
const pct = (v: number) => Math.round(v * 100);

export function Dashboard({
  hero = false,
  initialState = null,
}: {
  hero?: boolean;
  initialState?: RuntimeState | null;
}) {
  const router = useRouter();
  const [state, setState] = useState<RuntimeState | null>(initialState);
  const [connected, setConnected] = useState(hero);
  const [busy, setBusy] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const [scenario, setScenario] = useState("data-exfiltration");

  useEffect(() => {
    if (hero) return;
    const stream = new EventSource("/api/stream");
    stream.onmessage = (event) => {
      setState(JSON.parse(event.data));
      setConnected(true);
    };
    stream.onerror = () => setConnected(false);
    return () => stream.close();
  }, [hero]);

  async function command(action: "start" | "reset", scenario = "data-exfiltration") {
    if (hero) {
      router.push("/");
      return;
    }
    setBusy(true);
    setClientError(null);
    try {
      const response = await fetch("/api/runtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, scenario }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? "Could not update the demo");
      setState(payload);
    } catch (error) {
      setClientError(error instanceof Error ? error.message : "Could not connect");
    } finally {
      setBusy(false);
    }
  }
  async function verifyExport() {
    setBusy(true);
    try {
      const response = await fetch("/api/product/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records: state?.product.export.requested, verify: true }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.reason ?? "Could not verify export");
    } catch (error) {
      setClientError(error instanceof Error ? error.message : "Could not verify");
    } finally {
      setBusy(false);
    }
  }

  const phase = state?.phase ?? "ready";
  const running = state?.running ?? false;
  const contained = state?.product.export.status === "blocked";
  const malicious = (state?.decisions?.intent?.maliciousProbability ?? 0) >= 0.5;
  const progress = state ? state.elapsedMs / state.durationMs : 0;
  const policy = state?.policy ?? null;
  const source = process.env.NEXT_PUBLIC_GITHUB_URL;

  const [headline, subline] =
    !state || phase === "ready"
      ? [
          "Your application. Protected in motion.",
          "Run the story to see a decision become an action.",
        ]
      : policy?.outcome === "CONTAIN"
        ? ["The decision becomes the defense.", policy.reason]
        : policy?.outcome === "CHALLENGE"
          ? ["Step-up verification required.", policy.reason]
          : policy
            ? ["Behavior evaluated. Access continues.", policy.reason]
            : running
              ? [
                  "Evaluating this session in real time.",
                  "Comparing current activity with 30 days of history.",
                ]
              : ["Real-time security decisions.", "Inside the application loop."];

  const receiptItems = [
    state?.product.export.requested
      ? `${number(state.product.export.requested)} records held`
      : "Export terminated",
    "Session revoked",
    "Credentials invalidated",
    "Account deactivated",
  ];

  return (
    <div className={`application ${contained ? "is-contained" : ""} ${hero ? "hero-view" : ""}`}>
      <div className="workspace">
        <header className="topbar">
          <div className="wordmark">
            jev
            <span className="wordmark-divider" /> <span>Runtime Shield</span>
          </div>
          <div className="topbar-right">
            <span className={`connection ${connected ? "" : "offline"}`}>
              <i />
              {connected ? "SYSTEM ONLINE" : "CONNECTING"}
            </span>
            <span className="mode-badge">
              <span className="tiny-dot" /> MODE: {state?.mode === "jev" ? "LIVE JEV" : "REPLAY"}
            </span>
            <Link className="text-button" href="/showcase">
              JSON trace <ArrowRight size={13} />
            </Link>
          </div>
        </header>

        <main>
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> APPLICATION SECURITY, IN REAL TIME
              </div>
              <h1>
                Intelligence in the loop<span>.</span>
              </h1>
              <p>Real-time behavioral threat detection powered by Jev.</p>
            </div>
            <div className="demo-controls">
              <select
                className="scenario-select"
                aria-label="Scenario"
                value={scenario}
                disabled={busy || running || !connected}
                onChange={(e) => setScenario(e.target.value)}
              >
                {(state?.scenarios ?? [{ id: scenario, name: "Data exfiltration" }]).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                className="icon-button reset-button"
                aria-label="Reset demo"
                title="Reset demo"
                onClick={() => command("reset")}
                disabled={busy || !state}
              >
                <RotateCcw size={17} />
              </button>
              <button
                className="run-button"
                onClick={() => command("start", scenario)}
                disabled={busy || running || !connected}
              >
                <Play size={15} fill="currentColor" />
                {busy ? "PREPARING…" : running ? "RUNNING" : "RUN DEMO"}
                {running && (
                  <span className="run-count">
                    {Math.ceil((state!.durationMs - state!.elapsedMs) / 1000)}s
                  </span>
                )}
              </button>
            </div>
          </section>

          {(clientError || state?.error) && (
            <div className="error-banner" role="alert">
              <ShieldOff size={17} />
              <span>{clientError || state?.error}</span>
              <button onClick={() => command("reset")}>Reset</button>
            </div>
          )}

          <section className="story-column">
            <section className="panel decision-panel">
              <div className="panel-heading">
                <h2>
                  <Sparkles size={16} className="purple-text" /> Jev decision
                </h2>
                <span className="intelligence-tag">
                  {state?.mode === "jev" ? "LIVE" : "REPLAY"} · {state?.actorName ?? "Alex Morgan"}
                </span>
              </div>
              <div className="decision-description">Typed decisions. No generated prose.</div>
              <Probability
                index="01"
                label="ACTOR"
                value={state?.decisions?.actor?.label ?? "Awaiting activity"}
                probability={state?.decisions?.actor?.probability}
                tone="purple"
                secondary={
                  state?.decisions?.actor
                    ? `${state.decisions.actor.label === "BOT" ? "HUMAN" : "BOT"}  ${pct(1 - state.decisions.actor.probability)}%`
                    : "HUMAN / BOT"
                }
              />
              <Probability
                index="02"
                label="INTENT"
                value={state?.decisions?.intent?.label ?? "Awaiting decision"}
                probability={
                  state?.decisions?.intent
                    ? malicious
                      ? state.decisions.intent.maliciousProbability
                      : 1 - state.decisions.intent.maliciousProbability
                    : undefined
                }
                tone={malicious ? "red" : "green"}
                secondary={
                  state?.decisions?.intent
                    ? `P(malicious) = ${state.decisions.intent.maliciousProbability.toFixed(2)}`
                    : "BENIGN / MALICIOUS"
                }
              />
              <div className="threat-block">
                <div className="decision-label">
                  <span>03</span> THREAT CLASSIFICATION
                </div>
                <div className={`threat-value ${state?.decisions?.threat ? "red-text" : "muted"}`}>
                  <span>
                    {state?.decisions?.threat
                      ? readable(state.decisions.threat.label)
                      : state?.decisions?.intent?.label === "BENIGN"
                        ? "No threat detected"
                        : "Awaiting intent"}
                  </span>
                  {state?.decisions?.threat && (
                    <strong>
                      {pct(state.decisions.threat.probability)}
                      <small>%</small>
                    </strong>
                  )}
                </div>
              </div>
              <div
                className={`policy-card ${
                  policy?.outcome === "CONTAIN"
                    ? "policy-danger"
                    : policy?.outcome === "CHALLENGE"
                      ? "policy-challenge"
                      : ""
                }`}
              >
                <div className="policy-card-label">
                  <ShieldCheck size={12} /> POLICY ENGINE ACTION
                </div>
                <strong>
                  {policy?.outcome === "CONTAIN"
                    ? "Block + revoke"
                    : policy?.outcome === "CHALLENGE"
                      ? "Step-up authentication"
                      : policy?.outcome === "ALLOW"
                        ? "Allow activity"
                        : policy?.outcome === "OBSERVE"
                          ? "Observe activity"
                          : "Ready to enforce"}
                  <ShieldCheck size={19} />
                </strong>
                <small>
                  {policy
                    ? policy.outcome === "CONTAIN"
                      ? `p = ${policy.probability.toFixed(2)}  ≥  ${policy.threshold.toFixed(2)} block threshold`
                      : policy.outcome === "CHALLENGE"
                        ? "Verify identity before releasing records"
                        : "Deterministic application policy"
                    : "Decisions inform. Application code enforces."}
                </small>
              </div>
              <Link className="context-button" href="/showcase">
                <Code2 size={14} /> VIEW RAW JEV JSON <ArrowUpRight size={14} />
              </Link>
            </section>

            <section className="panel activity-panel">
              <div className="panel-heading">
                <h2>
                  <Radio size={15} /> Live activity
                </h2>
                <span className="count-pill">{state?.actorName ?? "—"}</span>
              </div>
              <div className="feed-heading">
                <span>EVENT STREAM</span>
                <span>{state ? number(state.metrics.eventsProcessed) : "0"} events</span>
              </div>
              <div className="event-feed" aria-label="Recent activity events">
                <AnimatePresence initial={false}>
                  {state?.events.slice(0, 5).map((event) => (
                    <EventRow event={event} key={event.id} />
                  ))}
                </AnimatePresence>
                {!state?.events.length && (
                  <div className="feed-empty">
                    <Activity size={22} />
                    <span>Listening for activity</span>
                    <small>Your demo starts with a single request.</small>
                  </div>
                )}
              </div>
              <div className="feed-footer">
                <span className="live-dot" />
                {contained ? "Legitimate traffic continues" : "Events stored locally in SQLite"}
              </div>
            </section>
          </section>

          <section className={`story-bar ${phase === "complete" ? "story-complete" : ""}`}>
            <div className="story-status">
              <span className="story-icon">
                <Play size={15} />
              </span>
              <div>
                <AnimatePresence mode="wait">
                  <motion.strong
                    key={headline}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                  >
                    {headline}
                  </motion.strong>
                </AnimatePresence>
                <span>{subline}</span>
              </div>
            </div>
            <div className="story-timer">
              <span>
                {String(Math.floor((state?.elapsedMs ?? 0) / 1000)).padStart(2, "0")}
                <small> / {String((state?.durationMs ?? 8000) / 1000).padStart(2, "0")}s</small>
              </span>
              <div>
                <motion.i
                  animate={{ width: `${progress * 100}%` }}
                  transition={{ duration: 0.15 }}
                />
              </div>
            </div>
          </section>

          {contained && (
            <motion.div
              className="containment-receipt"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
            >
              {receiptItems.map((label, i) => (
                <motion.span
                  key={label}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.18 }}
                >
                  <Check size={13} />
                  {label}
                </motion.span>
              ))}
            </motion.div>
          )}
          {state?.product.export.status === "challenge" && !running && (
            <div className="challenge-receipt">
              <KeyRound size={15} />
              <span>
                {state.scenarioId === "unusual-benign"
                  ? "Unusual does not mean malicious. Verify this approved export while keeping the account active."
                  : "Policy held the export for step-up authentication. No records were released and the account remains active."}
              </span>
              {state.scenarioId === "unusual-benign" && (
                <button disabled={busy} onClick={verifyExport}>
                  Simulate step-up verification <ArrowRight size={14} />
                </button>
              )}
            </div>
          )}

          <footer className="page-footer">
            <span>
              <Shield size={12} /> LOCAL REFERENCE APPLICATION <span> / </span> NO EXTERNAL ATTACK
              TRAFFIC
            </span>
            <span>
              {source ? (
                <a href={source} target="_blank" rel="noreferrer">
                  {source.replace(/^https?:\/\//, "")}
                </a>
              ) : (
                "jev-runtime-shield / open source"
              )}
            </span>
          </footer>
        </main>
      </div>
    </div>
  );
}

function EventRow({ event }: { event: ActivityEvent }) {
  return (
    <motion.div
      className="event-row"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <span className={`event-dot ${event.status >= 400 ? "warning" : ""}`} />
      <div>
        <span>
          <strong>{event.actorName.split(" ")[0]}</strong>
          <time>{new Date(event.at).toLocaleTimeString("en-GB", { hour12: false })}</time>
        </span>
        <code>
          {event.method} {event.path}
        </code>
      </div>
      <small className={event.status >= 400 ? "amber-text" : "muted"}>
        {event.count > 1 ? `×${number(event.count)}` : event.status}
      </small>
    </motion.div>
  );
}

function Probability({
  index,
  label,
  value,
  probability,
  tone,
  secondary,
}: {
  index: string;
  label: string;
  value: string;
  probability?: number;
  tone: string;
  secondary: string;
}) {
  return (
    <div className={`probability probability-${tone}`}>
      <div className="decision-label">
        <span>{index}</span>
        {label}
        <span className="prob-label">PROBABILITY</span>
      </div>
      <div className="probability-value">
        <strong className={probability === undefined ? "awaiting" : ""}>{value}</strong>
        <span>
          {probability === undefined ? "—" : pct(probability)}
          {probability !== undefined && <small>%</small>}
        </span>
      </div>
      <div className="probability-track">
        <motion.div
          animate={{ width: `${(probability ?? 0) * 100}%` }}
          transition={{ type: "spring" as const, stiffness: 160, damping: 23 }}
        />
      </div>
      <div className="probability-secondary">{secondary}</div>
    </div>
  );
}
