import { parseAgentAction } from "@royaltydesk/domain";
import type { AgentModel, AgentModelRequest, AgentModelResult } from "./types.ts";

interface GatewayResponse { readonly model?: unknown; readonly choices?: unknown; readonly usage?: unknown; readonly id?: unknown; }
function record(value: unknown): Readonly<Record<string, unknown>> | undefined { return typeof value === "object" && value !== null ? value as Readonly<Record<string, unknown>> : undefined; }

export function parseModelAction(content: string): ReturnType<typeof parseAgentAction> {
  const trimmed = content.trim();
  const jsonText = trimmed.startsWith("```") ? trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "") : trimmed;
  return parseAgentAction(JSON.parse(jsonText) as unknown);
}

export function createNearAiAgentModel(config: { readonly baseUrl: string; readonly apiKey: string; readonly model: string; readonly timeoutMs?: number }): AgentModel {
  return {
    mode: "live",
    complete: async (request: AgentModelRequest): Promise<AgentModelResult> => {
      const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model: config.model, temperature: 0, max_tokens: request.maxOutputTokens, response_format: { type: "json_object" }, messages: [{ role: "system", content: request.system }, { role: "user", content: request.user }] }),
        signal: AbortSignal.timeout(config.timeoutMs ?? 120_000)
      });
      if (!response.ok) throw new Error(`ERR_NEAR_AI_HTTP_${response.status}`);
      const payload = await response.json() as GatewayResponse;
      const first = Array.isArray(payload.choices) ? record(payload.choices[0]) : undefined;
      const message = record(first?.message);
      if (typeof message?.content !== "string") throw new Error("ERR_NEAR_AI_CONTENT");
      const usage = record(payload.usage);
      return { model: typeof payload.model === "string" ? payload.model : config.model, content: message.content, ...(typeof payload.id === "string" ? { responseId: payload.id } : {}), ...(typeof usage?.prompt_tokens === "number" ? { inputTokens: usage.prompt_tokens } : {}), ...(typeof usage?.completion_tokens === "number" ? { outputTokens: usage.completion_tokens } : {}) };
    }
  };
}

export function createFixtureAgentModel(responses: readonly string[], model = "fixture/royaltydesk"): AgentModel {
  let index = 0;
  return { mode: "fixture", complete: async (): Promise<AgentModelResult> => { const content = responses[index] ?? responses[responses.length - 1] ?? JSON.stringify({ type: "needs_human", rationale: "fixture exhausted" }); index += 1; return { model, content }; } };
}
