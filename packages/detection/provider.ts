import type {
  ActorDecision,
  DecisionContext,
  Decisions,
  IntentDecision,
  ThreatDecision,
} from "../shared/types";

export interface SecurityDecisionProvider {
  classifyActor(context: DecisionContext): Promise<ActorDecision>;
  classifyIntent(context: DecisionContext): Promise<IntentDecision>;
  classifyThreat(context: DecisionContext): Promise<ThreatDecision>;
}

export async function evaluate(
  provider: SecurityDecisionProvider,
  context: DecisionContext,
): Promise<Decisions> {
  const [actor, intent] = await Promise.all([
    provider.classifyActor(context),
    provider.classifyIntent(context),
  ]);
  const threat = intent.label === "MALICIOUS" ? await provider.classifyThreat(context) : null;
  return { actor, intent, threat };
}
