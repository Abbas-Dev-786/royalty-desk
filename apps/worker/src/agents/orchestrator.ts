import { randomUUID } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { canonicalJson, parseAgentAction, sha256Hex, type CanonicalValue } from "@royaltydesk/domain";
import type { AgentModel, AgentRunResult, PersonalAgentContext } from "./types.ts";
import { buildAgentPrompt } from "./context.ts";
import { parseModelAction } from "./model.ts";
import { validateAgentTool } from "./policy.ts";

export interface AgentSessionInput { readonly id?: string; readonly releaseId: string; readonly ownerAccountId: string; readonly mode: "live" | "fixture"; readonly maxRounds?: number; readonly maxCalls?: number; readonly maxOutputTokens?: number; readonly inputDigest: string; }

export class AgentOrchestrator {
  readonly #database: DatabaseSync;
  constructor(database: DatabaseSync) { this.#database = database; }

  createSession(input: AgentSessionInput): string {
    const id = input.id ?? randomUUID();
    const now = Date.now();
    const maxRounds = input.maxRounds ?? 3;
    const maxCalls = input.maxCalls ?? 2;
    const maxOutputTokens = input.maxOutputTokens ?? 1_000;
    if (maxRounds < 1 || maxRounds > 3 || maxCalls < 1 || maxCalls > 2 || maxOutputTokens < 1) throw new Error("ERR_AGENT_BUDGET");
    this.#database.prepare(`INSERT INTO agent_sessions(id, release_id, owner_account_id, mode, status, round, max_rounds, input_digest, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, 'negotiating', 0, ?, ?, ?, ?)`).run(id, input.releaseId, input.ownerAccountId, input.mode, maxRounds, input.inputDigest, now, now);
    this.#database.prepare(`INSERT INTO agent_budgets(session_id, max_calls, max_output_tokens) VALUES (?, ?, ?)`).run(id, maxCalls, maxOutputTokens);
    return id;
  }

  async run(sessionId: string, context: PersonalAgentContext, model: AgentModel): Promise<AgentRunResult> {
    const session = this.#database.prepare(`SELECT release_id, owner_account_id, mode, status, round, max_rounds, input_digest FROM agent_sessions WHERE id = ?`).get(sessionId) as Record<string, unknown> | undefined;
    if (!session || session.release_id !== context.releaseId || session.owner_account_id !== context.ownerAccountId || session.mode !== model.mode) throw new Error("ERR_AGENT_SESSION");
    const budget = this.#database.prepare(`SELECT max_calls, calls_used, max_output_tokens, output_tokens_used FROM agent_budgets WHERE session_id = ?`).get(sessionId) as Record<string, unknown> | undefined;
    if (!budget || Number(budget.calls_used) >= Number(budget.max_calls) || Number(session.round) >= Number(session.max_rounds)) {
      this.#setStatus(sessionId, "awaiting_human");
      return { sessionId, status: "awaiting_human", reason: "Agent budget or negotiation-round limit reached.", model: "none", mode: model.mode };
    }
    const prompt = buildAgentPrompt(context);
    if (session.input_digest !== prompt.inputDigest) throw new Error("ERR_AGENT_INPUT_DIGEST");
    const attempt = Number(budget.calls_used) + 1;
    const runId = randomUUID();
    this.#database.prepare(`INSERT INTO agent_runs(id, session_id, attempt, provider_mode, model, input_digest, status, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, 'started', ?)`).run(runId, sessionId, attempt, model.mode, "pending", prompt.inputDigest, Date.now());
    this.#database.prepare(`UPDATE agent_budgets SET calls_used = calls_used + 1, reserved_calls = reserved_calls + 1 WHERE session_id = ? AND calls_used < max_calls`).run(sessionId);
    try {
      const result = await model.complete({ ...prompt, maxOutputTokens: Number(budget.max_output_tokens) });
      if (result.outputTokens !== undefined && (!Number.isSafeInteger(result.outputTokens) || result.outputTokens < 0 || Number(budget.output_tokens_used ?? 0) + result.outputTokens > Number(budget.max_output_tokens))) throw new Error("ERR_AGENT_OUTPUT_BUDGET");
      const action = parseModelAction(result.content);
      const proposalId = randomUUID();
      const parentProposalId = action.type === "counter_terms" ? action.parentProposalId : null;
      if (parentProposalId) {
        const parent = this.#database.prepare(`SELECT p.id, p.action_json FROM agent_proposals p JOIN agent_sessions s ON s.id = p.session_id WHERE p.id = ? AND s.release_id = ?`).get(parentProposalId, context.releaseId) as { id?: unknown; action_json?: unknown } | undefined;
        const parentAction = typeof parent?.action_json === "string" ? parseModelAction(parent.action_json) : null;
        if (parent?.id !== parentProposalId || (parentAction?.type !== "propose_terms" && parentAction?.type !== "counter_terms")) throw new Error("ERR_AGENT_PARENT_PROPOSAL");
      }
      const actionJson = canonicalJson(action as unknown as CanonicalValue);
      const outputDigest = sha256Hex(actionJson);
      const rationale = "rationale" in action ? action.rationale : action.type === "propose_terms" || action.type === "counter_terms" ? "Structured terms proposal" : "Structured agent action";
      const evidenceIds = "evidenceIds" in action ? action.evidenceIds : [];
      this.#database.prepare(`INSERT INTO agent_proposals(id, session_id, parent_id, owner_account_id, action_json, rationale, evidence_json, input_digest, status, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'validated', ?)`).run(proposalId, sessionId, parentProposalId, context.ownerAccountId, actionJson, rationale, JSON.stringify(evidenceIds), prompt.inputDigest, Date.now());
      if (result.outputTokens !== undefined) this.#database.prepare(`UPDATE agent_budgets SET output_tokens_used = output_tokens_used + ? WHERE session_id = ?`).run(result.outputTokens, sessionId);
      this.#database.prepare(`UPDATE agent_runs SET model = ?, output_digest = ?, status = 'succeeded', usage_json = ? WHERE id = ?`).run(result.model, outputDigest, JSON.stringify({ inputTokens: result.inputTokens, outputTokens: result.outputTokens, responseId: result.responseId }), runId);
      this.#database.prepare(`UPDATE agent_sessions SET status = ?, round = round + 1, updated_at_ms = ? WHERE id = ?`).run(action.type === "needs_human" ? "awaiting_human" : "reviewing", Date.now(), sessionId);
      return { sessionId, status: action.type === "needs_human" ? "awaiting_human" : "reviewing", action, proposalId, model: result.model, mode: model.mode };
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 256) : "ERR_AGENT_OUTPUT";
      this.#database.prepare(`UPDATE agent_runs SET status = 'failed', error_code = ? WHERE id = ?`).run(reason, runId);
      this.#setStatus(sessionId, "awaiting_human");
      return { sessionId, status: "awaiting_human", reason, model: model.mode, mode: model.mode };
    } finally {
      this.#database.prepare(`UPDATE agent_budgets SET reserved_calls = CASE WHEN reserved_calls > 0 THEN reserved_calls - 1 ELSE 0 END WHERE session_id = ?`).run(sessionId);
    }
  }

  policyTool(context: PersonalAgentContext, action: ReturnType<typeof parseAgentAction>, nowNanoseconds = BigInt(Date.now()) * 1_000_000n) { return validateAgentTool({ context, action, currentTimeNanoseconds: nowNanoseconds }); }
  #setStatus(sessionId: string, status: "awaiting_human" | "failed"): void { this.#database.prepare(`UPDATE agent_sessions SET status = ?, updated_at_ms = ? WHERE id = ?`).run(status, Date.now(), sessionId); }
}
