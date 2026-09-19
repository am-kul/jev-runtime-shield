import { z } from "zod";

export const threatTypes = [
  "VULNERABILITY_PROBING",
  "PORT_SCANNING",
  "BRUTE_FORCE",
  "CREDENTIAL_STUFFING",
  "DATA_EXFILTRATION",
  "DOS",
  "DDOS",
  "SUSPICIOUS_ENUMERATION",
  "OTHER",
] as const;
export type ThreatType = (typeof threatTypes)[number];
export const categories = [
  "dashboard",
  "reports",
  "search",
  "customers",
  "admin",
  "api_keys",
  "exports",
  "auth",
  "network",
] as const;
export const eventSchema = z.object({
  id: z.string(),
  actorId: z.string(),
  actorName: z.string(),
  at: z.number(),
  historical: z.boolean().default(false),
  kind: z.enum(["http", "network", "aggregate"]).default("http"),
  category: z.enum(categories),
  path: z.string().max(120),
  method: z.enum(["GET", "POST", "SYNC", "TCP"]).default("GET"),
  status: z.number().int().min(100).max(599),
  sourceId: z.string().default("local-browser"),
  authenticated: z.boolean().default(false),
  sessionId: z.string().default("anonymous"),
  records: z.number().int().nonnegative().default(0),
  count: z.number().int().positive().max(1000000).default(1),
  port: z.number().int().min(1).max(65535).optional(),
  destination: z.string().optional(),
  accountTarget: z.string().optional(),
  mfaVerified: z.boolean().default(false),
  approvedExport: z.boolean().default(false),
});
export type ActivityEvent = z.infer<typeof eventSchema>;
export interface ActivitySummary {
  days: number;
  totalEvents: number;
  counts: Record<(typeof categories)[number], number>;
  requestsPerMinute: number;
  commonRoutes: { path: string; count: number }[];
  firstAt: number | null;
  lastAt: number | null;
}
export interface DecisionContext {
  actorId: string;
  authenticated: boolean;
  sourceId: string;
  sessionId: string;
  windowSeconds: number;
  features: {
    requests_last_10_seconds: number;
    requests_last_60_seconds: number;
    unique_routes: number;
    unique_destinations: number;
    unique_ports: number;
    unique_sources: number;
    failed_request_ratio: number;
    forbidden_ratio: number;
    not_found_ratio: number;
    auth_failures: number;
    successful_logins: number;
    accounts_targeted: number;
    bulk_reads: number;
    records_requested: number;
    first_time_admin_access: boolean;
    first_time_export: boolean;
    first_time_api_key: boolean;
    historical_requests_per_minute: number;
    admin_events_last_30_days: number;
    exports_last_30_days: number;
    request_timing_regularity: number;
    endpoint_traversal_pattern: string;
    mfa_verified: boolean;
    approved_export: boolean;
  };
  history: ActivitySummary;
  recentEvents: ActivityEvent[];
}
export interface ActorDecision {
  label: "HUMAN" | "BOT";
  probability: number;
  confidence: number;
  probabilities: Record<"HUMAN" | "BOT", number>;
}
export interface IntentDecision {
  label: "BENIGN" | "MALICIOUS";
  maliciousProbability: number;
}
export interface ThreatDecision {
  label: ThreatType;
  probability: number;
  confidence: number;
}
export interface Decisions {
  actor: ActorDecision;
  intent: IntentDecision;
  threat: ThreatDecision | null;
}
export type PolicyAction =
  | "ALLOW"
  | "OBSERVE"
  | "STEP_UP_AUTH"
  | "BLOCK_REQUEST"
  | "REVOKE_SESSION"
  | "INVALIDATE_CREDENTIALS"
  | "DEACTIVATE_ACCOUNT"
  | "BLOCK_SOURCE"
  | "DROP_REQUESTS"
  | "TEMPORARY_DENY_RULE"
  | "RATE_LIMIT"
  | "SIMULATED_EDGE_MITIGATION";
export interface PolicyResult {
  outcome: "ALLOW" | "OBSERVE" | "CHALLENGE" | "CONTAIN";
  actions: PolicyAction[];
  probability: number;
  threshold: number;
  reason: string;
}
export type Phase =
  | "ready"
  | "normal"
  | "benign-bot"
  | "recon"
  | "actor"
  | "intent"
  | "access"
  | "exfiltration"
  | "containment"
  | "complete";
export interface ProductState {
  accountActive: boolean;
  sessionValid: boolean;
  credentialsValid: boolean;
  blockedSources: string[];
  rateLimitedSources: string[];
  deniedSources: string[];
  challengeRequired: boolean;
  edgeMitigation: boolean;
  export: {
    status: "idle" | "pending" | "blocked" | "completed" | "challenge";
    requested: number;
    released: number;
  };
}
export interface AuditEntry {
  at: number;
  actorId: string;
  action: PolicyAction;
  scope: string;
}
export interface RuntimeState {
  mode: "replay" | "jev";
  running: boolean;
  phase: Phase;
  elapsedMs: number;
  durationMs: number;
  scenarioId: string;
  scenarioName: string;
  actorId: string;
  actorName: string;
  events: ActivityEvent[];
  history: ActivitySummary;
  context: DecisionContext | null;
  decisionContext: DecisionContext | null;
  decisions: Partial<Decisions> | null;
  policy: PolicyResult | null;
  product: ProductState;
  audit: AuditEntry[];
  error: string | null;
  metrics: {
    eventsProcessed: number;
    requestsPerSecond: number[];
    decisions: number;
    contextMs: number | null;
    decisionMs: number | null;
    runtimeMs: number;
  };
  scenarios: { id: string; name: string; description: string }[];
}
