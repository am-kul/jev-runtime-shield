import { expect, test } from "@playwright/test";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

test.skip(process.env.RECORD_DEMO !== "1", "Run npm run record to generate presentation assets.");

test("records the focused Jev decision flow", async ({ browser, request }) => {
  test.setTimeout(90000);
  const assets = path.resolve("docs/assets");
  const frames = path.join(assets, "focus-frames");
  const rawVideo = path.join(assets, "focus-video");
  await rm(frames, { recursive: true, force: true });
  await rm(rawVideo, { recursive: true, force: true });
  await mkdir(frames, { recursive: true });
  await mkdir(rawVideo, { recursive: true });

  await request.post("/api/runtime", { data: { action: "reset" } });
  const start = await request.post("/api/runtime", {
    data: { action: "start", scenario: "data-exfiltration" },
  });
  expect(start.ok()).toBe(true);
  await new Promise((resolve) => setTimeout(resolve, 450));

  const context = await browser.newContext({
    viewport: { width: 1440, height: 1100 },
    recordVideo: { dir: rawVideo, size: { width: 1440, height: 1100 } },
  });
  const page = await context.newPage();
  await page.goto("/showcase");
  await expect(page.getByText(/BUILDING|SENT/, { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(assets, "jev-focus-ready.png") });

  const video = page.video();
  const started = Date.now();
  const frameTimesMs: number[] = [];

  for (let frame = 0; frame < 160; frame++) {
    await page.screenshot({ path: path.join(frames, `${String(frame).padStart(3, "0")}.png`) });
    frameTimesMs.push(Date.now() - started);
    if ((await page.getByTestId("showcase-complete").count()) > 0) break;
    await page.waitForTimeout(250);
  }

  await expect(page.getByTestId("showcase-complete")).toBeVisible({ timeout: 45000 });
  await expect(page.getByText("JEV DECIDES", { exact: true })).toBeVisible();
  await expect(page.getByText("CODE ENFORCES", { exact: true })).toBeVisible();
  await page.screenshot({ path: path.join(assets, "jev-focus-final.png") });
  await page.waitForTimeout(1500);
  await context.close();

  if (video) await copyFile(await video.path(), path.join(assets, "jev-focus.webm"));
  await writeFile(
    path.join(assets, "jev-focus-capture.json"),
    JSON.stringify(
      {
        mode: process.env.RECORD_LIVE === "1" ? "jev" : "replay",
        blockThreshold: Number(process.env.RECORD_BLOCK_THRESHOLD ?? "0.75"),
        viewport: { width: 1440, height: 1100 },
        frameTimesMs,
      },
      null,
      2,
    ),
  );
});
