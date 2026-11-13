export interface AgentModelRequest {
  readonly system: string;
  readonly user: string;
  readonly inputDigest: string;
  readonly maxOutputTokens: number;
}

export interface AgentModelResult {
  readonly model: string;
  readonly content: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly responseId?: string;
  readonly billingRequestId?: string;
}

export interface AgentModel {
  readonly mode: "live" | "fixture";
  readonly complete: (request: AgentModelRequest) => Promise<AgentModelResult>;
}

interface GatewayResponse {
  readonly model?: unknown;
  readonly choices?: unknown;
  readonly usage?: unknown;
  readonly id?: unknown;
}

function record(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null ? value as Readonly<Record<string, unknown>> : undefined;
}

export class NearAiCompletionError extends Error {
  readonly responseId: string | null;
  readonly billingRequestId: string | null;
  readonly finishReason: string | null;
  readonly outputTokens: number | null;

  constructor(message: string, responseId: string | null, finishReason: string | null, outputTokens: number | null, billingRequestId: string | null = null) {
    super(message);
    this.responseId = responseId;
    this.billingRequestId = billingRequestId;
    this.finishReason = finishReason;
    this.outputTokens = outputTokens;
  }
}

export function createNearAiAgentModel(config: { readonly baseUrl: string; readonly apiKey: string; readonly model: string; readonly timeoutMs?: number }): AgentModel {
  return {
    mode: "live",
    complete: async (request: AgentModelRequest): Promise<AgentModelResult> => {
      const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
        body: JSON.stringify({ model: config.model, temperature: 0, max_tokens: request.maxOutputTokens, response_format: { type: "json_object" }, ...(config.model === "z-ai/glm-5.3-flash" ? { reasoning_effort: "low", thinking: { type: "enabled" } } : {}), messages: [{ role: "system", content: request.system }, { role: "user", content: request.user }] }),
        signal: AbortSignal.timeout(config.timeoutMs ?? 120_000)
      });
      if (!response.ok) throw new Error(`ERR_NEAR_AI_HTTP_${response.status}`);
      const payload = await response.json() as GatewayResponse;
      const first = Array.isArray(payload.choices) ? record(payload.choices[0]) : undefined;
      const message = record(first?.message);
      const usage = record(payload.usage);
      const responseId = typeof payload.id === "string" ? payload.id : null;
      const billingRequestId = response.headers.get("inference-id");
      const finishReason = typeof first?.finish_reason === "string" ? first.finish_reason : null;
      const outputTokens = typeof usage?.completion_tokens === "number" ? usage.completion_tokens : null;
      if (finishReason === "length") throw new NearAiCompletionError("ERR_NEAR_AI_OUTPUT_LIMIT", responseId, finishReason, outputTokens, billingRequestId);
      if (typeof message?.content !== "string" || !message.content.trim()) throw new NearAiCompletionError("ERR_NEAR_AI_CONTENT", responseId, finishReason, outputTokens, billingRequestId);
      return { model: typeof payload.model === "string" ? payload.model : config.model, content: message.content, ...(responseId ? { responseId } : {}), ...(billingRequestId ? { billingRequestId } : {}), ...(typeof usage?.prompt_tokens === "number" ? { inputTokens: usage.prompt_tokens } : {}), ...(typeof usage?.completion_tokens === "number" ? { outputTokens: usage.completion_tokens } : {}) };
    }
  };
}
