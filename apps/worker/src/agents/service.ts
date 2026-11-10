import type { DatabaseSync } from "node:sqlite";
import { JobStore } from "@royaltydesk/persistence";
import { AgentOrchestrator, buildAgentPrompt, createFixtureAgentModel, createNearAiAgentModel, type AgentMode, type AgentRunResult, type PersonalAgentContext } from "./index.ts";
import type { WorkerConfig } from "../config.ts";
import { dispatchAgentAction } from "./chain-dispatch.ts";
import { DurableJobRunner } from "../jobs/runner.ts";

export interface AgentSessionRequest { readonly releaseId: string; readonly ownerAccountId: string; readonly mode: AgentMode; readonly context: PersonalAgentContext; readonly maxRounds?: number; readonly maxCalls?: number; readonly maxOutputTokens?: number; }

export class WorkerAgentService {
  readonly #orchestrator: AgentOrchestrator;
  readonly #database: DatabaseSync;
  readonly #config: WorkerConfig;
  readonly #jobs: JobStore;
  readonly #runner: DurableJobRunner;
  constructor(database: DatabaseSync, config: WorkerConfig) { this.#database = database; this.#orchestrator = new AgentOrchestrator(database); this.#config = config; this.#jobs = new JobStore(config.databasePath); this.#runner = new DurableJobRunner(this.#jobs); }
  createSession(input: AgentSessionRequest): { readonly sessionId: string } {
    if (input.context.releaseId !== input.releaseId || input.context.ownerAccountId !== input.ownerAccountId) throw new Error("ERR_AGENT_CONTEXT_SCOPE");
    const inputDigest = buildAgentPrompt(input.context).inputDigest;
    const sessionId = this.#orchestrator.createSession({ ...input, inputDigest });
    this.#jobs.enqueue({ id: sessionId, logicalKey: `agent-session:${sessionId}`, releaseId: input.releaseId, participantId: input.ownerAccountId, inputDigest });
    return { sessionId };
  }
  async run(sessionId: string, context: PersonalAgentContext, mode: AgentMode): Promise<AgentRunResult> {
    const stored = await this.#runner.run(sessionId, async ({ heartbeat }) => {
      const heartbeatTimer = setInterval(heartbeat, 10_000);
      try {
        const result = await this.#runOnce(sessionId, context, mode);
        return { resultJson: JSON.stringify(result), awaitingHuman: result.status === "awaiting_human" };
      } finally {
        clearInterval(heartbeatTimer);
      }
    });
    const row = this.#database.prepare("SELECT result_json FROM jobs WHERE id = ?").get(sessionId) as { result_json?: unknown } | undefined;
    if ((!stored && !row) || typeof row?.result_json !== "string") throw new Error("ERR_AGENT_JOB_PENDING");
    return JSON.parse(row.result_json) as AgentRunResult;
  }
  async #runOnce(sessionId: string, context: PersonalAgentContext, mode: AgentMode): Promise<AgentRunResult> {
    const model = mode === "fixture" ? createFixtureAgentModel([this.#fixtureResponse(context)]) : this.#liveModel();
    const result = await this.#orchestrator.run(sessionId, context, model);
    if (mode !== "live" || !result.action || !["recommend_approval", "raise_objection"].includes(result.action.type)) return result;
    try {
      const chainOperation = await dispatchAgentAction(this.#database, this.#config, context, result.action);
      return { ...result, chainOperation: { operationId: chainOperation.operationId, transactionHash: chainOperation.transactionHash, status: chainOperation.status } };
    } catch (error) {
      return { ...result, status: "awaiting_human", reason: error instanceof Error ? error.message : "ERR_AGENT_DISPATCH" };
    }
  }
  close(): void { this.#jobs.close(); this.#database.close(); }
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
