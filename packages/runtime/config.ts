import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { config as loadEnv } from "dotenv";
import { validateThresholds } from "../policy";
import type { EngineConfig } from "./engine";

export function repositoryRoot() {
  let directory = process.cwd();
  for (let i = 0; i < 6; i++) {
    const file = path.join(directory, "package.json");
    if (existsSync(file) && JSON.parse(readFileSync(file, "utf8")).name === "jev-runtime-shield")
      return directory;
    directory = path.dirname(directory);
  }
  throw new Error("Run the application from the repository directory.");
}
export function configuration(): { file: string; engine: EngineConfig } {
  const root = repositoryRoot();
  loadEnv({ path: [path.join(root, ".env.local"), path.join(root, ".env")], quiet: true });
  const mode = process.env.DECISION_MODE ?? "replay";
  if (mode !== "replay" && mode !== "jev") throw new Error("DECISION_MODE must be replay or jev");
  const timeoutMs = Number(process.env.JEV_TIMEOUT_MS ?? 5000);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 30000)
    throw new Error("JEV_TIMEOUT_MS must be between 100 and 30000");
  return {
    file: process.env.DATABASE_PATH ?? path.join(root, "data/runtime-shield.db"),
    engine: {
      mode,
      key: process.env.TYPESAFE_API_KEY,
      model: process.env.JEV_MODEL ?? "jev-latest",
      timeoutMs,
      thresholds: validateThresholds({
        observe: Number(process.env.OBSERVE_THRESHOLD ?? 0.25),
        challenge: Number(process.env.CHALLENGE_THRESHOLD ?? 0.5),
        block: Number(process.env.BLOCK_THRESHOLD ?? 0.75),
      }),
    },
  };
}
