import { z } from "zod";
import { eventSchema } from "../shared/types";
import demo from "../../scenarios/demo-story.json";
import human from "../../scenarios/normal-human.json";
import bot from "../../scenarios/benign-bot.json";
import probe from "../../scenarios/vulnerability-probing.json";
import exfil from "../../scenarios/data-exfiltration.json";
import brute from "../../scenarios/brute-force.json";
import stuffing from "../../scenarios/credential-stuffing.json";
import ports from "../../scenarios/port-scan.json";
import dos from "../../scenarios/dos.json";
import ddos from "../../scenarios/ddos.json";
import unusual from "../../scenarios/unusual-benign.json";

const eventTemplate = eventSchema.omit({ id: true, at: true, historical: true });
export const scenarioSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string(),
    durationMs: z.number().int().min(1000).max(30000),
    steps: z
      .array(
        z.object({
          afterMs: z.number().int().nonnegative(),
          phase: z
            .enum([
              "normal",
              "benign-bot",
              "recon",
              "actor",
              "intent",
              "access",
              "exfiltration",
              "containment",
              "complete",
            ])
            .optional(),
          events: z.array(eventTemplate).default([]),
          repeat: z.number().int().min(1).max(100).default(1),
          focus: z.string().optional(),
          fixture: z.string().optional(),
          evaluate: z.enum(["actor", "all"]).optional(),
        }),
      )
      .min(1),
  })
  .superRefine((s, ctx) => {
    let previous = -1;
    for (const step of s.steps) {
      if (step.afterMs < previous || step.afterMs > s.durationMs)
        ctx.addIssue({
          code: "custom",
          message: "Steps must be ordered and within scenario duration",
        });
      if (step.evaluate && !step.fixture)
        ctx.addIssue({ code: "custom", message: "Evaluation requires an explicit replay fixture" });
      previous = step.afterMs;
    }
  });
export type Scenario = z.infer<typeof scenarioSchema>;
export const scenarios: Scenario[] = [
  demo,
  human,
  bot,
  probe,
  exfil,
  brute,
  stuffing,
  ports,
  dos,
  ddos,
  unusual,
].map((s) => scenarioSchema.parse(s));
export function getScenario(id: string) {
  const scenario = scenarios.find((s) => s.id === id);
  if (!scenario) throw new Error("Unknown scenario");
  return scenario;
}
