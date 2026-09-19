import type {
  DecisionContext,
  Decisions,
  PolicyAction,
  PolicyResult,
  ProductState,
} from "../shared/types";

export interface Thresholds {
  observe: number;
  challenge: number;
  block: number;
}
export const defaultThresholds: Thresholds = { observe: 0.25, challenge: 0.5, block: 0.75 };
export function validateThresholds(t: Thresholds): Thresholds {
  if (
    ![t.observe, t.challenge, t.block].every(Number.isFinite) ||
    t.observe < 0 ||
    t.block > 1 ||
    t.observe >= t.challenge ||
    t.challenge >= t.block
  )
    throw new Error("Thresholds must satisfy 0 <= observe < challenge < block <= 1");
  return t;
}
export function decidePolicy(
  decisions: Decisions,
  context: DecisionContext,
  thresholds = defaultThresholds,
): PolicyResult {
  const t = validateThresholds(thresholds);
  const p = decisions.intent.maliciousProbability;
  const result = (
    outcome: PolicyResult["outcome"],
    actions: PolicyAction[],
    threshold: number,
    reason: string,
  ): PolicyResult => ({ outcome, actions, probability: p, threshold, reason });
  if (p >= t.block) {
    const threat = decisions.threat?.label;
    let actions: PolicyAction[];
    switch (threat) {
      case "DATA_EXFILTRATION":
        actions = context.authenticated
          ? ["BLOCK_REQUEST", "REVOKE_SESSION", "INVALIDATE_CREDENTIALS", "DEACTIVATE_ACCOUNT"]
          : ["BLOCK_REQUEST", "BLOCK_SOURCE"];
        break;
      case "VULNERABILITY_PROBING":
      case "PORT_SCANNING":
        actions = ["BLOCK_SOURCE", "DROP_REQUESTS", "TEMPORARY_DENY_RULE"];
        break;
      case "BRUTE_FORCE":
      case "CREDENTIAL_STUFFING":
        actions = ["RATE_LIMIT", "BLOCK_SOURCE", "STEP_UP_AUTH"];
        break;
      case "DOS":
        actions = ["RATE_LIMIT", "DROP_REQUESTS"];
        break;
      case "DDOS":
        actions = ["SIMULATED_EDGE_MITIGATION", "RATE_LIMIT", "DROP_REQUESTS", "STEP_UP_AUTH"];
        break;
      default:
        actions = ["BLOCK_REQUEST", "BLOCK_SOURCE"];
    }
    return result(
      "CONTAIN",
      actions,
      t.block,
      "Malicious probability meets containment threshold.",
    );
  }
  if (p >= t.challenge)
    return result(
      "CHALLENGE",
      ["STEP_UP_AUTH"],
      t.challenge,
      "Step-up authentication required before the action can complete.",
    );
  // Independent product rule: a first large export requires verification even if benign.
  if (
    context.features.first_time_export &&
    context.features.records_requested >= 10000 &&
    !context.features.mfa_verified
  )
    return result(
      "CHALLENGE",
      ["STEP_UP_AUTH"],
      t.challenge,
      "First large export requires step-up authentication; anomaly alone does not justify containment.",
    );
  if (p >= t.observe)
    return result(
      "OBSERVE",
      ["OBSERVE"],
      t.observe,
      "Retain the session and collect more evidence.",
    );
  return result("ALLOW", ["ALLOW"], t.observe, "Activity is below the observation threshold.");
}
export function initialProductState(): ProductState {
  return {
    accountActive: true,
    sessionValid: true,
    credentialsValid: true,
    blockedSources: [],
    rateLimitedSources: [],
    deniedSources: [],
    challengeRequired: false,
    edgeMitigation: false,
    export: { status: "idle", requested: 0, released: 0 },
  };
}
export function enforcePolicy(
  state: ProductState,
  policy: PolicyResult,
  context: DecisionContext,
): ProductState {
  const next = structuredClone(state);
  const add = (list: string[]) => {
    if (!list.includes(context.sourceId)) list.push(context.sourceId);
  };
  for (const action of policy.actions) {
    switch (action) {
      case "BLOCK_REQUEST":
        if (next.export.status === "pending") next.export.status = "blocked";
        break;
      case "REVOKE_SESSION":
        next.sessionValid = false;
        break;
      case "INVALIDATE_CREDENTIALS":
        next.credentialsValid = false;
        break;
      case "DEACTIVATE_ACCOUNT":
        next.accountActive = false;
        break;
      case "BLOCK_SOURCE":
        add(next.blockedSources);
        break;
      case "DROP_REQUESTS":
      case "TEMPORARY_DENY_RULE":
        add(next.deniedSources);
        break;
      case "RATE_LIMIT":
        add(next.rateLimitedSources);
        break;
      case "STEP_UP_AUTH":
        next.challengeRequired = true;
        if (next.export.status === "pending") next.export.status = "challenge";
        break;
      case "SIMULATED_EDGE_MITIGATION":
        next.edgeMitigation = true;
        break;
    }
  }
  if (
    next.export.status === "pending" &&
    (policy.outcome === "ALLOW" || policy.outcome === "OBSERVE")
  ) {
    next.export.status = "completed";
    next.export.released = next.export.requested;
  }
  return next;
}
export function requestGate(
  state: ProductState,
  sourceId: string,
  authenticated: boolean,
): { allowed: boolean; status: number; reason: string } {
  if (!state.accountActive || (authenticated && (!state.sessionValid || !state.credentialsValid)))
    return { allowed: false, status: 403, reason: "Account or session is disabled" };
  if (state.blockedSources.includes(sourceId) || state.deniedSources.includes(sourceId))
    return { allowed: false, status: 403, reason: "Source deny rule" };
  if (state.rateLimitedSources.includes(sourceId))
    return { allowed: false, status: 429, reason: "Source rate limited" };
  if (authenticated && state.challengeRequired)
    return { allowed: false, status: 401, reason: "Step-up authentication required" };
  return { allowed: true, status: 200, reason: "Allowed" };
}
