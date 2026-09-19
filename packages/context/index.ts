import type { ActivityStore } from "../activity-store";
import type { DecisionContext } from "../shared/types";

export async function buildContext(
  store: ActivityStore,
  actorId: string,
  now = Date.now(),
): Promise<DecisionContext> {
  const [events, history] = await Promise.all([
    store.getRecentActivity(actorId, now),
    store.getHistoricalSummary(actorId, now),
  ]);
  const last = events.at(-1);
  const sum = (predicate: (e: (typeof events)[number]) => boolean) =>
    events.filter(predicate).reduce((n, e) => n + e.count, 0);
  const total = sum(() => true);
  const unique = (key: "path" | "destination" | "port" | "sourceId" | "accountTarget") =>
    new Set(events.map((e) => e[key]).filter((v) => v !== undefined)).size;
  const intervals = events.slice(1).map((e, i) => e.at - events[i].at);
  const mean = intervals.reduce((a, b) => a + b, 0) / (intervals.length || 1);
  const deviation = Math.sqrt(
    intervals.reduce((a, b) => a + (b - mean) ** 2, 0) / (intervals.length || 1),
  );
  const first = (category: "admin" | "exports" | "api_keys") =>
    history.counts[category] === 0 && events.some((e) => e.category === category && e.status < 400);
  return {
    actorId,
    authenticated: last?.authenticated ?? false,
    sourceId: last?.sourceId ?? "unknown",
    sessionId: last?.sessionId ?? "anonymous",
    windowSeconds: 60,
    features: {
      requests_last_10_seconds: sum((e) => e.at >= now - 10000),
      requests_last_60_seconds: total,
      unique_routes: unique("path"),
      unique_destinations: unique("destination"),
      unique_ports: unique("port"),
      unique_sources: unique("sourceId"),
      failed_request_ratio: sum((e) => e.status >= 400) / (total || 1),
      forbidden_ratio: sum((e) => e.status === 403) / (total || 1),
      not_found_ratio: sum((e) => e.status === 404) / (total || 1),
      auth_failures: sum((e) => e.category === "auth" && e.status >= 400),
      successful_logins: sum((e) => e.category === "auth" && e.status === 200),
      accounts_targeted: unique("accountTarget"),
      bulk_reads: sum((e) => e.records > 100),
      records_requested: events.reduce((n, e) => n + e.records, 0),
      first_time_admin_access: first("admin"),
      first_time_export: first("exports"),
      first_time_api_key: first("api_keys"),
      historical_requests_per_minute: history.requestsPerMinute,
      admin_events_last_30_days: history.counts.admin,
      exports_last_30_days: history.counts.exports,
      request_timing_regularity:
        intervals.length > 1 && mean > 0 ? Math.max(0, 1 - deviation / mean) : 0,
      endpoint_traversal_pattern:
        events.filter((e) => /\/customers\/\d+$/.test(e.path)).length >= 3
          ? "sequential customer IDs"
          : "mixed routes",
      mfa_verified: last?.mfaVerified ?? false,
      approved_export: last?.approvedExport ?? false,
    },
    history,
    recentEvents: events.slice(-8),
  };
}
