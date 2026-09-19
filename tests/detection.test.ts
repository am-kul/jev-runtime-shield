import { describe, expect, it, vi } from "vitest";
import { SQLiteActivityStore } from "../packages/activity-store";
import { buildContext } from "../packages/context";
import { evaluate } from "../packages/detection/provider";
import { JevDecisionProvider, JEV_ENDPOINT } from "../packages/detection/jev-provider";
import { ReplayDecisionProvider } from "../packages/detection/replay-provider";
import fixtures from "../fixtures/jev/decisions.json";

async function context() {
  const s = new SQLiteActivityStore();
  try {
    return await buildContext(s, "alex");
  } finally {
    s.close();
  }
}
const response = (answer: unknown, status = 200) =>
  new Response(JSON.stringify({ model: "jev-1.13.0", answers: { decision: answer } }), { status });
describe("decision providers", () => {
  it("is explicit about fixture provenance and rejects unknown keys", () => {
    expect(fixtures.provenance.captured_from_live_jev).toBe(false);
    expect(() => new ReplayDecisionProvider("invented")).toThrow();
  });
  it("never asks for a threat on benign intent", async () => {
    const provider = new ReplayDecisionProvider("benign-bot");
    const spy = vi.spyOn(provider, "classifyThreat");
    expect((await evaluate(provider, await context())).threat).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });
  it("maps official Choice and Noul responses and sends only the documented HTTP contract", async () => {
    const request = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      if (body.questions.decision.type === "noul") return response({ type: "noul", noul: 0.93 });
      if (body.questions.decision.criteria.HUMAN)
        return response({
          type: "choice",
          choice: "BOT",
          confidence: 0.78,
          probabilities: { HUMAN: 0.06, BOT: 0.94 },
        });
      const labels = Object.keys(body.questions.decision.criteria);
      return response({
        type: "choice",
        choice: "DATA_EXFILTRATION",
        confidence: 0.81,
        probabilities: Object.fromEntries(
          labels.map((l) => [l, l === "DATA_EXFILTRATION" ? 0.92 : 0.01]),
        ),
      });
    });
    const d = await evaluate(
      new JevDecisionProvider({ key: "test-key", fetch: request }),
      await context(),
    );
    expect(d.actor).toMatchObject({ label: "BOT", probability: 0.94, confidence: 0.78 });
    expect(d.intent.maliciousProbability).toBe(0.93);
    expect(d.threat?.probability).toBe(0.92);
    expect(request).toHaveBeenCalledTimes(3);
    const [url, init] = request.mock.calls[0];
    expect(url).toBe(JEV_ENDPOINT);
    expect(init?.headers).toMatchObject({ Authorization: "Bearer test-key" });
    expect(Object.keys(JSON.parse(init!.body as string)).sort()).toEqual([
      "model",
      "questions",
      "state",
    ]);
  });
  it("rejects invalid/missing probability distributions", async () => {
    const provider = new JevDecisionProvider({
      key: "test",
      fetch: vi.fn(async () =>
        response({ type: "choice", choice: "BOT", confidence: 0.9, probabilities: { BOT: 1 } }),
      ),
    });
    await expect(provider.classifyActor(await context())).rejects.toThrow("invalid probability");
  });
  it("does not fall back to replay on missing credentials or a provider error", async () => {
    expect(() => new JevDecisionProvider({ key: "" })).toThrow("TYPESAFE_API_KEY");
    const provider = new JevDecisionProvider({
      key: "test",
      fetch: vi.fn(async () => response({}, 401)),
    });
    await expect(provider.classifyIntent(await context())).rejects.toThrow("HTTP 401");
  });
  it("retries overload once, then returns the real answer", async () => {
    let attempts = 0;
    const provider = new JevDecisionProvider({
      key: "test",
      fetch: vi.fn(async () =>
        ++attempts === 1 ? response({}, 529) : response({ type: "noul", noul: 0.17 }),
      ),
    });
    expect((await provider.classifyIntent(await context())).maliciousProbability).toBe(0.17);
    expect(attempts).toBe(2);
  });
});
