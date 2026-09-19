import { z } from "zod";
import fixtures from "../../fixtures/jev/decisions.json";
import { threatTypes, type DecisionContext } from "../shared/types";
import type { SecurityDecisionProvider } from "./provider";

const probability = z.number().min(0).max(1);
const fixtureSchema = z.object({
  actor: z.object({
    label: z.enum(["HUMAN", "BOT"]),
    probability,
    confidence: probability,
    probabilities: z.object({ HUMAN: probability, BOT: probability }),
  }),
  intent: z.object({ label: z.enum(["BENIGN", "MALICIOUS"]), maliciousProbability: probability }),
  threat: z.object({ label: z.enum(threatTypes), probability, confidence: probability }).nullable(),
});
export class ReplayDecisionProvider implements SecurityDecisionProvider {
  private fixture;
  constructor(key: string) {
    const raw = (fixtures.decisions as Record<string, unknown>)[key];
    if (!raw) throw new Error(`No replay fixture for ${key}`);
    this.fixture = fixtureSchema.parse(raw);
  }
  // Explicit scenario fixtures, never a heuristic masquerading as inference.
  async classifyActor(_context: DecisionContext) {
    void _context;
    return structuredClone(this.fixture.actor);
  }
  async classifyIntent(_context: DecisionContext) {
    void _context;
    return structuredClone(this.fixture.intent);
  }
  async classifyThreat(_context: DecisionContext) {
    void _context;
    if (!this.fixture.threat) throw new Error("Threat classification requested for benign fixture");
    return structuredClone(this.fixture.threat);
  }
}
