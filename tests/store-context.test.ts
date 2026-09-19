import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SQLiteActivityStore } from "../packages/activity-store";
import { seedHistory } from "../packages/activity-store/seed";
import { buildContext } from "../packages/context";
import { eventSchema } from "../packages/shared/types";

const stores: SQLiteActivityStore[] = [];
const store = () => {
  const s = new SQLiteActivityStore();
  stores.push(s);
  return s;
};
afterEach(() => {
  stores.splice(0).forEach((s) => s.close());
});
describe("SQLite activity and deterministic context", () => {
  it("reconstructs 30 days and computes the median active-minute rate from rows", async () => {
    const s = store();
    const now = Date.now();
    seedHistory(s, now);
    const history = await s.getHistoricalSummary("alex@acme.com", now);
    expect(history).toMatchObject({
      totalEvents: 1728,
      requestsPerMinute: 14,
      counts: {
        dashboard: 847,
        reports: 391,
        search: 284,
        customers: 206,
        admin: 0,
        api_keys: 0,
        exports: 0,
      },
    });
    expect(history.lastAt! - history.firstAt!).toBeGreaterThan(28 * 86400000);
    expect(await s.getRecentActivity("alex@acme.com", now)).toEqual([]);
  });
  it("persists events across connections and isolates actors/time windows", async () => {
    const dir = mkdtempSync(path.join(tmpdir(), "shield-store-"));
    const file = path.join(dir, "test.db");
    const now = Date.now();
    const s = new SQLiteActivityStore(file);
    await s.record(
      eventSchema.parse({
        id: "one",
        actorId: "alex",
        actorName: "Alex",
        at: now,
        category: "dashboard",
        path: "/app/dashboard",
        status: 200,
      }),
    );
    s.close();
    const reopened = new SQLiteActivityStore(file);
    try {
      expect(await reopened.getRecentActivity("alex", now)).toHaveLength(1);
      expect(await reopened.getRecentActivity("sarah", now)).toHaveLength(0);
      expect(await reopened.getRecentActivity("alex", now + 61000)).toHaveLength(0);
    } finally {
      reopened.close();
      rmSync(dir, { recursive: true });
    }
  });
  it("counts aggregated requests, bounded examples, first-time attempts and traversal", async () => {
    const s = store();
    const now = Date.now();
    seedHistory(s, now);
    for (let i = 0; i < 12; i++)
      await s.record(
        eventSchema.parse({
          id: `test-${i}`,
          actorId: "alex@acme.com",
          actorName: "Alex",
          at: now - 1000 * i,
          category: i === 0 ? "exports" : "customers",
          path: i === 0 ? "/api/exports" : `/api/customers/${1000 + i}`,
          status: i < 4 ? 403 : 200,
          authenticated: true,
          records: i === 0 ? 48219 : 1,
          count: i === 0 ? 3 : 1,
        }),
      );
    const c = await buildContext(s, "alex@acme.com", now);
    expect(c.features).toMatchObject({
      requests_last_10_seconds: 13,
      requests_last_60_seconds: 14,
      unique_routes: 12,
      records_requested: 48230,
      first_time_export: false,
      first_time_admin_access: false,
      endpoint_traversal_pattern: "sequential customer IDs",
    });
    expect(c.features.failed_request_ratio).toBeCloseTo(6 / 14);
    expect(c.recentEvents).toHaveLength(8);
    expect(c.history.counts.exports).toBe(0);
  });
  it("excludes expired history and future activity", async () => {
    const s = store();
    const now = Date.now();
    for (const [id, at, historical] of [
      ["old", now - 31 * 86400000, true],
      ["future", now + 100, false],
    ] as const)
      await s.record(
        eventSchema.parse({
          id,
          at,
          historical,
          actorId: "alex",
          actorName: "Alex",
          category: "admin",
          path: "/admin",
          status: 403,
        }),
      );
    expect((await s.getHistoricalSummary("alex", now)).totalEvents).toBe(0);
    expect(await s.getRecentActivity("alex", now)).toEqual([]);
  });
});
