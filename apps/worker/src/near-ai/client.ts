export interface NearAiConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}

export interface StructuredProbeResult {
  readonly action: "needs_human";
  readonly rationale: string;
  readonly model: string;
  readonly usage: { readonly inputTokens?: number; readonly outputTokens?: number };
}

interface GatewayResponse {
  readonly model?: unknown;
  readonly choices?: unknown;
  readonly usage?: unknown;
}

function asRecord(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null ? value as Readonly<Record<string, unknown>> : undefined;
}

export async function runStructuredProbe(config: NearAiConfig): Promise<StructuredProbeResult> {
  const response = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${config.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      messages: [
        { role: "system", content: "Return JSON only." },
        { role: "user", content: "Return {\"action\":\"needs_human\",\"rationale\":\"compatibility probe\"}." }
      ]
    }),
    signal: AbortSignal.timeout(20_000)
  });
  if (!response.ok) throw new Error(`NEAR AI gateway returned HTTP ${response.status}`);

  const payload = await response.json() as GatewayResponse;
  if (!Array.isArray(payload.choices) || payload.choices.length === 0) throw new Error("Gateway response has no choices");
  const first = asRecord(payload.choices[0]);
  const message = asRecord(first?.message);
  if (typeof message?.content !== "string") throw new Error("Gateway response content is missing");
  const structured = JSON.parse(message.content) as unknown;
  const action = asRecord(structured);
  if (action?.action !== "needs_human" || typeof action.rationale !== "string") {
    throw new Error("Gateway response did not match the probe schema");
  }

  const usage = asRecord(payload.usage);
  return {
    action: "needs_human",
    rationale: action.rationale,
    model: typeof payload.model === "string" ? payload.model : config.model,
    usage: {
      ...(typeof usage?.prompt_tokens === "number" ? { inputTokens: usage.prompt_tokens } : {}),
      ...(typeof usage?.completion_tokens === "number" ? { outputTokens: usage.completion_tokens } : {})
    }
  };
}
