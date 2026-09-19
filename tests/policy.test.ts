import { describe, expect, it } from "vitest";
import { buildContext } from "../packages/context";
import { SQLiteActivityStore } from "../packages/activity-store";
import {
  decidePolicy,
  enforcePolicy,
  initialProductState,
  requestGate,
  validateThresholds,
} from "../packages/policy";
import { ReplayDecisionProvider } from "../packages/detection/replay-provider";
import { evaluate } from "../packages/detection/provider";
import type { Decisions, ThreatType } from "../packages/shared/types";

async function context() {
  const store = new SQLiteActivityStore();
  try {
    return await buildContext(store, "alex");
  } finally {
    store.close();
  }
}
const decisions = (p: number, threat: ThreatType = "OTHER"): Decisions => ({
  actor: {
    label: "BOT",
    probability: 0.99,
    confidence: 0.98,
    probabilities: { BOT: 0.99, HUMAN: 0.01 },
  },
  intent: { label: p >= 0.5 ? "MALICIOUS" : "BENIGN", maliciousProbability: p },
  threat: p >= 0.5 ? { label: threat, probability: 0.95, confidence: 0.9 } : null,
});
describe("deterministic policy", () => {
  it.each([
    [0.2499, "ALLOW"],
    [0.25, "OBSERVE"],
    [0.4999, "OBSERVE"],
    [0.5, "CHALLENGE"],
    [0.7499, "CHALLENGE"],
    [0.75, "CONTAIN"],
    [1, "CONTAIN"],
  ])("handles exact threshold %s", async (p, outcome) => {
    expect(decidePolicy(decisions(p as number), await context()).outcome).toBe(outcome);
  });
  it.each([
    ["VULNERABILITY_PROBING", ["BLOCK_SOURCE", "DROP_REQUESTS", "TEMPORARY_DENY_RULE"]],
    ["PORT_SCANNING", ["BLOCK_SOURCE", "DROP_REQUESTS", "TEMPORARY_DENY_RULE"]],
    ["BRUTE_FORCE", ["RATE_LIMIT", "BLOCK_SOURCE", "STEP_UP_AUTH"]],
    ["CREDENTIAL_STUFFING", ["RATE_LIMIT", "BLOCK_SOURCE", "STEP_UP_AUTH"]],
    ["DOS", ["RATE_LIMIT", "DROP_REQUESTS"]],
    ["DDOS", ["SIMULATED_EDGE_MITIGATION", "RATE_LIMIT", "DROP_REQUESTS", "STEP_UP_AUTH"]],
  ])("maps %s to targeted actions", async (threat, actions) => {
    expect(decidePolicy(decisions(0.98, threat as ThreatType), await context()).actions).toEqual(
      actions,
    );
  });
  it("contains authenticated exfiltration and makes future requests fail", async () => {
    const c = await context();
    c.authenticated = true;
    const p = decidePolicy(decisions(0.99, "DATA_EXFILTRATION"), c);
    expect(p.actions).toEqual([
      "BLOCK_REQUEST",
      "REVOKE_SESSION",
      "INVALIDATE_CREDENTIALS",
      "DEACTIVATE_ACCOUNT",
    ]);
    const state = initialProductState();
    state.export = { status: "pending", requested: 48219, released: 0 };
    const result = enforcePolicy(state, p, c);
    expect(result).toMatchObject({
      accountActive: false,
      sessionValid: false,
      credentialsValid: false,
      export: { status: "blocked", released: 0 },
    });
    expect(requestGate(result, "new-source", true).allowed).toBe(false);
    expect(state.accountActive).toBe(true);
  });
  it("does not deactivate an account for an anonymous export attempt", async () => {
    expect(decidePolicy(decisions(0.99, "DATA_EXFILTRATION"), await context()).actions).toEqual([
      "BLOCK_REQUEST",
      "BLOCK_SOURCE",
    ]);
  });
  it("allows benign automation and challenges unusual benign exports without disabling the account", async () => {
    const c = await context();
    const benign = await evaluate(new ReplayDecisionProvider("benign-bot"), c);
    expect(decidePolicy(benign, c).outcome).toBe("ALLOW");
    const unusual = await evaluate(new ReplayDecisionProvider("unusual-benign"), c);
    c.features.first_time_export = true;
    c.features.records_requested = 48219;
    expect(unusual.intent.label).toBe("BENIGN");
    const policy = decidePolicy(unusual, c);
    expect(policy.outcome).toBe("CHALLENGE");
    expect(enforcePolicy(initialProductState(), policy, c).accountActive).toBe(true);
    c.features.mfa_verified = true;
    expect(decidePolicy(unusual, c).outcome).toBe("ALLOW");
  });
  it("rejects misordered and non-finite thresholds", () => {
    expect(() => validateThresholds({ observe: 0.9, challenge: 0.5, block: 0.75 })).toThrow();
    expect(() => validateThresholds({ observe: NaN, challenge: 0.75, block: 0.9 })).toThrow();
  });
});
