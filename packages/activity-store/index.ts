import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { categories, type ActivityEvent, type ActivitySummary } from "../shared/types";

export interface ActivityStore {
  record(event: ActivityEvent): Promise<void>;
  getRecentActivity(actorId: string, now?: number): Promise<ActivityEvent[]>;
  getHistoricalSummary(actorId: string, now?: number): Promise<ActivitySummary>;
}

export class SQLiteActivityStore implements ActivityStore {
  readonly db: DatabaseSync;
  constructor(file = ":memory:") {
    if (file !== ":memory:") mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(`PRAGMA journal_mode=WAL;
      CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, at INTEGER NOT NULL, historical INTEGER NOT NULL, category TEXT NOT NULL, path TEXT NOT NULL, request_count INTEGER NOT NULL, payload TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS activity_actor_time ON activity(actor_id, historical, at);
      CREATE TABLE IF NOT EXISTS policy_audit (id INTEGER PRIMARY KEY, at INTEGER, actor_id TEXT, action TEXT, scope TEXT);
      CREATE TABLE IF NOT EXISTS product_state (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);`);
  }
  async record(event: ActivityEvent) {
    this.insert(event);
  }
  private insert(event: ActivityEvent) {
    this.db
      .prepare("INSERT INTO activity VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .run(
        event.id,
        event.actorId,
        event.at,
        +event.historical,
        event.category,
        event.path,
        event.count,
        JSON.stringify(event),
      );
  }
  recordMany(events: ActivityEvent[]) {
    this.db.exec("BEGIN");
    try {
      for (const event of events) this.insert(event);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  async getRecentActivity(actorId: string, now = Date.now()) {
    const rows = this.db
      .prepare(
        "SELECT payload FROM activity WHERE actor_id=? AND historical=0 AND at BETWEEN ? AND ? ORDER BY at, rowid",
      )
      .all(actorId, now - 60000, now);
    return rows.map((row) => JSON.parse(row.payload as string) as ActivityEvent);
  }
  async getHistoricalSummary(actorId: string, now = Date.now()): Promise<ActivitySummary> {
    const since = now - 30 * 86400000;
    const rows = this.db
      .prepare(
        "SELECT category, SUM(request_count) AS n FROM activity WHERE actor_id=? AND historical=1 AND at BETWEEN ? AND ? GROUP BY category",
      )
      .all(actorId, since, now);
    const counts = Object.fromEntries(categories.map((c) => [c, 0])) as ActivitySummary["counts"];
    for (const row of rows) counts[row.category as (typeof categories)[number]] = Number(row.n);
    const buckets = this.db
      .prepare(
        "SELECT SUM(request_count) AS n FROM activity WHERE actor_id=? AND historical=1 AND at BETWEEN ? AND ? GROUP BY CAST(at / 60000 AS INTEGER) ORDER BY n",
      )
      .all(actorId, since, now);
    const commonRoutes = this.db
      .prepare(
        "SELECT path, SUM(request_count) AS count FROM activity WHERE actor_id=? AND historical=1 AND at BETWEEN ? AND ? GROUP BY path ORDER BY count DESC LIMIT 5",
      )
      .all(actorId, since, now) as { path: string; count: number }[];
    const bounds = this.db
      .prepare(
        "SELECT MIN(at) AS firstAt, MAX(at) AS lastAt FROM activity WHERE actor_id=? AND historical=1 AND at BETWEEN ? AND ?",
      )
      .get(actorId, since, now)!;
    return {
      days: 30,
      totalEvents: Object.values(counts).reduce((a, b) => a + b, 0),
      counts,
      requestsPerMinute: buckets.length ? Number(buckets[Math.floor(buckets.length / 2)].n) : 0,
      commonRoutes,
      firstAt: bounds.firstAt as number | null,
      lastAt: bounds.lastAt as number | null,
    };
  }
  clear() {
    this.db.exec("DELETE FROM activity; DELETE FROM policy_audit; DELETE FROM product_state;");
  }
  close() {
    this.db.close();
  }
}
