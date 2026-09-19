import { spawnSync } from "node:child_process";
import path from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv({ path: [path.resolve(".env.local"), path.resolve(".env")], quiet: true });
const requestedMode = process.env.RECORD_LIVE;
const live =
  requestedMode === "1" ||
  (requestedMode === undefined &&
    process.env.DECISION_MODE === "jev" &&
    Boolean(process.env.TYPESAFE_API_KEY));
const result = spawnSync(
  process.execPath,
  ["node_modules/@playwright/test/cli.js", "test", "tests/ui/recording.spec.ts"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      RECORD_DEMO: "1",
      RECORD_LIVE: live ? "1" : "0",
      RECORD_BLOCK_THRESHOLD: process.env.RECORD_BLOCK_THRESHOLD ?? "0.75",
      RECORD_JEV_TIMEOUT_MS: process.env.RECORD_JEV_TIMEOUT_MS ?? "15000",
    },
  },
);
process.exitCode = result.status ?? 1;
