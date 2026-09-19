import { defineConfig, devices } from "@playwright/test";

const recordLive = process.env.RECORD_LIVE === "1";
const recording = process.env.RECORD_DEMO === "1";

export default defineConfig({
  testDir: "./tests/ui",
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1100 },
  },
  webServer: {
    command: "npm run dev -- --port 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: false,
    timeout: 120000,
    env: {
      DECISION_MODE: recordLive ? "jev" : "replay",
      NEXT_DIST_DIR: ".next-test",
      DATABASE_PATH: `${process.cwd()}/data/ui-test.db`,
      ...(recordLive && process.env.TYPESAFE_API_KEY
        ? { TYPESAFE_API_KEY: process.env.TYPESAFE_API_KEY }
        : {}),
      ...(recording
        ? {
            BLOCK_THRESHOLD: process.env.RECORD_BLOCK_THRESHOLD ?? "0.75",
            JEV_TIMEOUT_MS: process.env.RECORD_JEV_TIMEOUT_MS ?? "15000",
          }
        : {}),
    },
  },
});
