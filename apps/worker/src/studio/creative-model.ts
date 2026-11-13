import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { z } from "zod";
import { createNearAiAgentModel } from "../agents/model.ts";
import { NearAiCompletionError } from "../agents/model.ts";
import type { AgentModel } from "../agents/types.ts";

const outputSchema = z.object({ content: z.string().min(1).max(12_000) }).strict();
export type CreativeRole = "lyrics" | "composition" | "review" | "revision" | "split_proposal" | "split_response";

export interface CreativeModelStep {
  readonly projectId: string;
  readonly agentId: string;
  readonly role: CreativeRole;
  readonly revision: number;
  readonly brief: string;
  readonly context: string;
  readonly maxCalls: number;
  readonly maxOutputTokens: number;
  readonly deadlineAtMs?: number;
}

export function createCreativeNearAiModel(config: { readonly baseUrl: string; readonly apiKey: string; readonly model: string; readonly timeoutMs?: number }): AgentModel {
  return createNearAiAgentModel(config);
}

function digest(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }

export async function runCreativeModelStep(database: DatabaseSync, model: AgentModel, step: CreativeModelStep): Promise<string> {
  if (!Number.isSafeInteger(step.revision) || step.revision < 0 || step.revision > 2 || !Number.isSafeInteger(step.maxCalls) || step.maxCalls < 1 || step.maxCalls > 10) throw new Error("ERR_CREATIVE_BUDGET");
  if (!Number.isSafeInteger(step.maxOutputTokens) || step.maxOutputTokens < 1 || step.maxOutputTokens > 4000) throw new Error("ERR_CREATIVE_TOKEN_LIMIT");
  if (!step.brief.trim() || step.brief.length > 4000 || step.context.length > 16_000) throw new Error("ERR_CREATIVE_INPUT");
  if (step.deadlineAtMs !== undefined && Date.now() >= step.deadlineAtMs) throw new Error("ERR_CREATIVE_DEADLINE");
  const agent = database.prepare("SELECT a.allowed_tools_json, a.max_calls, a.expires_at_ms, a.revoked_at_ms FROM studio_agents a JOIN studio_projects p ON p.studio_id = a.studio_id WHERE a.id = ? AND p.id = ? AND a.active = 1").get(step.agentId, step.projectId) as { allowed_tools_json: string; max_calls: number; expires_at_ms: number | null; revoked_at_ms: number | null } | undefined;
  if (!agent) throw new Error("ERR_CREATIVE_AGENT_SCOPE");
  if (agent.revoked_at_ms !== null || (agent.expires_at_ms !== null && Date.now() >= agent.expires_at_ms)) throw new Error("ERR_CREATIVE_AGENT_REVOKED");
  if (!(JSON.parse(agent.allowed_tools_json) as unknown[]).includes(step.role)) throw new Error("ERR_CREATIVE_TOOL_FORBIDDEN");
  const system = `You are the ${step.role} agent in an original music studio. Return JSON only: {"content":"..."}. Do not refer to named artists, existing song or album titles, or copyrighted lyrics.`;
  const user = `Brief: ${step.brief}\nContext: ${step.context}`;
  const inputHash = digest(`${system}\n${user}`);
  const briefHash = digest(step.brief);
  const logicalKey = `creative:${step.projectId}:${briefHash}:${step.agentId}:${step.role}:${step.revision}`;
  const operationId = digest(logicalKey);
  const previous = database.prepare("SELECT o.status, r.output_json, r.input_hash FROM studio_external_operations o LEFT JOIN studio_model_outputs r ON r.operation_id = o.id WHERE o.logical_key = ?").get(logicalKey) as { status: string; output_json: string | null; input_hash: string | null } | undefined;
  if (previous) {
    if (previous.status === "finalized" && previous.output_json) {
      if (previous.input_hash !== inputHash) throw new Error("ERR_CREATIVE_INPUT_CHANGED");
      return outputSchema.parse(JSON.parse(previous.output_json)).content;
    }
    throw new Error("ERR_CREATIVE_OUTCOME_UNKNOWN");
  }
  const prefix = `creative:${step.projectId}:${briefHash}:${step.agentId}:`;
  const count = database.prepare("SELECT COUNT(*) AS n FROM studio_external_operations WHERE operation_type = 'near_ai_creative' AND substr(logical_key, 1, ?) = ?").get(prefix.length, prefix) as { n: number };
  if (count.n >= Math.min(step.maxCalls, agent.max_calls)) throw new Error("ERR_CREATIVE_BUDGET");
  database.prepare("INSERT INTO studio_external_operations(id, logical_key, operation_type, status, created_at_ms, updated_at_ms) VALUES (?, ?, 'near_ai_creative', 'requested', ?, ?)").run(operationId, logicalKey, Date.now(), Date.now());
  let responseId: string | null = null;
  try {
    const result = await model.complete({ system, user, inputDigest: inputHash, maxOutputTokens: step.maxOutputTokens });
    responseId = result.responseId ?? null;
    let parsed: z.infer<typeof outputSchema>;
    try { parsed = outputSchema.parse(JSON.parse(result.content) as unknown); }
    catch { throw new Error("ERR_CREATIVE_MODEL_FORMAT"); }
    if (step.role === "review" && !/^(ACCEPT|REVISE):/.test(parsed.content)) throw new Error("ERR_CREATIVE_REVIEW_FORMAT");
    const outputJson = JSON.stringify(parsed);
    database.exec("BEGIN IMMEDIATE");
    try {
      database.prepare("INSERT INTO studio_model_outputs(operation_id, project_id, agent_id, role, model, provider_mode, input_hash, output_hash, output_json, response_id, input_tokens, output_tokens, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(operationId, step.projectId, step.agentId, step.role, result.model, model.mode, inputHash, digest(outputJson), outputJson, result.responseId ?? null, result.inputTokens ?? null, result.outputTokens ?? null, Date.now());
      database.prepare("UPDATE studio_external_operations SET status = 'finalized', result_hash = ?, provider_request_id = ?, updated_at_ms = ? WHERE id = ?").run(digest(outputJson), result.responseId ?? null, Date.now(), operationId);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    return parsed.content;
  } catch (error) {
    const completed = error instanceof NearAiCompletionError || responseId !== null;
    const providerId = error instanceof NearAiCompletionError ? error.responseId : responseId;
    database.prepare("UPDATE studio_external_operations SET status = ?, provider_request_id = COALESCE(?, provider_request_id), updated_at_ms = ? WHERE id = ? AND status = 'requested'").run(completed ? "failed" : "unknown", providerId, Date.now(), operationId);
    throw error;
  }
}
