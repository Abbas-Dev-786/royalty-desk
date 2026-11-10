import type { DatabaseSync } from "node:sqlite";
import { AgentOrchestrator, createFixtureAgentModel, createNearAiAgentModel, type AgentMode, type AgentRunResult, type PersonalAgentContext } from "./index.ts";
import type { WorkerConfig } from "../config.ts";

export interface AgentSessionRequest { readonly releaseId: string; readonly ownerAccountId: string; readonly mode: AgentMode; readonly inputDigest: string; readonly maxRounds?: number; readonly maxCalls?: number; readonly maxOutputTokens?: number; }

export class WorkerAgentService {
  readonly #orchestrator: AgentOrchestrator;
  readonly #database: DatabaseSync;
  readonly #config: WorkerConfig;
  constructor(database: DatabaseSync, config: WorkerConfig) { this.#database = database; this.#orchestrator = new AgentOrchestrator(database); this.#config = config; }
  createSession(input: AgentSessionRequest): { readonly sessionId: string } { return { sessionId: this.#orchestrator.createSession(input) }; }
  async run(sessionId: string, context: PersonalAgentContext, mode: AgentMode): Promise<AgentRunResult> {
    const model = mode === "fixture" ? createFixtureAgentModel([this.#fixtureResponse(context)]) : this.#liveModel();
    return this.#orchestrator.run(sessionId, context, model);
  }
  close(): void { this.#database.close(); }
  #fixtureResponse(context: PersonalAgentContext): string {
    const objectionEvidence = context.statementRows.filter((row) => row.rowType === "deduction_claim").map((row) => row.lineId).slice(0, 8);
    if (context.validationFindings.length > 0 && context.settlementDigest && objectionEvidence.length > 0) return JSON.stringify({ type: "raise_objection", settlementDigest: context.settlementDigest, evidenceIds: objectionEvidence, rationale: "Deterministic fixture found a validation finding tied to supplied deduction evidence." });
    if (context.settlement && context.settlementDigest && context.validationFindings.length === 0) return JSON.stringify({ type: "recommend_approval", settlementDigest: context.settlementDigest, rationale: "Deterministic fixture found no validation findings in the supplied settlement context." });
    return JSON.stringify({ type: "needs_human", rationale: "Fixture requires human review because the settlement context is incomplete." });
  }
  #liveModel() {
    if (!this.#config.nearAiApiKey || !this.#config.nearAiModel) throw new Error("ERR_NEAR_AI_CONFIG");
    return createNearAiAgentModel({ baseUrl: this.#config.nearAiBaseUrl, apiKey: this.#config.nearAiApiKey, model: this.#config.nearAiModel });
  }
}
