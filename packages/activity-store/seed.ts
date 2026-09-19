import { eventSchema, type ActivityEvent } from "../shared/types";
import { SQLiteActivityStore } from "./index";

export const actors = [
  { id: "sarah@acme.com", name: "Sarah Chen", initials: "SC" },
  { id: "hubspot@acme.com", name: "HubSpot", initials: "HS" },
  { id: "alex@acme.com", name: "Alex Morgan", initials: "AM" },
  { id: "maria@acme.com", name: "Maria Garcia", initials: "MG" },
  { id: "james@acme.com", name: "James Wilson", initials: "JW" },
];

/** 1,728 actual Alex events, spread over 30 days. No presentation-only counters. */
export function seedHistory(store: SQLiteActivityStore, now = Date.now()) {
  const counts = { dashboard: 847, reports: 391, search: 284, customers: 206 } as const;
  const all: ActivityEvent[] = [];
  for (const actor of actors) {
    const profile = Object.entries(counts).flatMap(([category, count]) =>
      Array.from(
        { length: actor.id.startsWith("alex") ? count : Math.ceil(count / 5) },
        () => category,
      ),
    );
    // Deterministic shuffle avoids making each historical day a single route.
    let rng = 1701;
    for (let i = profile.length - 1; i > 0; i--) {
      rng = (rng * 16807) % 2147483647;
      const j = rng % (i + 1);
      [profile[i], profile[j]] = [profile[j], profile[i]];
    }
    profile.forEach((category, i) => {
      const bucket = Math.floor(i / 14);
      const day = bucket % 30;
      const minute = Math.floor(bucket / 30) * 17;
      const at =
        Math.floor((now - (day + 0.5) * 86400000) / 60000) * 60000 +
        minute * 60000 +
        (i % 14) * 4000;
      all.push(
        eventSchema.parse({
          id: `seed-${actor.id}-${i}`,
          actorId: actor.id,
          actorName: actor.name,
          at,
          historical: true,
          category,
          path: `/app/${category}`,
          status: 200,
          authenticated: true,
        }),
      );
    });
  }
  store.recordMany(all);
  return all.length;
}
