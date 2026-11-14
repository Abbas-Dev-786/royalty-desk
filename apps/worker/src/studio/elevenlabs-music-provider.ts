import { createHash } from "node:crypto";

export interface MusicPlanChunk {
  readonly text: string;
  readonly durationMs: number;
  readonly positiveStyles: readonly string[];
  readonly negativeStyles: readonly string[];
  readonly contextAdherence: "high" | "medium" | "low";
}

export interface ElevenLabsSongRequest {
  readonly model: "music_v2_5";
  readonly chunks: readonly MusicPlanChunk[];
}

export interface ElevenLabsSongResult {
  readonly bytes: Uint8Array;
  readonly contentType: string;
  readonly requestId: string | null;
  readonly planHash: string;
}

export interface ElevenLabsMusicProvider {
  compose(request: ElevenLabsSongRequest): Promise<ElevenLabsSongResult>;
}

export class ElevenLabsMusicHttpError extends Error {
  readonly status: number;
  readonly validationFields: readonly string[];
  readonly providerStatus: string | null;
  constructor(status: number, validationFields: readonly string[] = [], providerStatus: string | null = null) {
    super(providerStatus === "bad_composition_plan" ? "ERR_ELEVENLABS_BAD_COMPOSITION_PLAN" : `ERR_ELEVENLABS_HTTP_${status}`);
    this.status = status;
    this.validationFields = validationFields;
    this.providerStatus = providerStatus;
  }
  get definitiveRejection(): boolean { return [400, 401, 402, 403, 404, 422].includes(this.status); }
}

function musicErrorStatus(body: unknown): string | null {
  if (!body || typeof body !== "object" || !("detail" in body) || !body.detail || typeof body.detail !== "object" || !("status" in body.detail)) return null;
  return typeof body.detail.status === "string" && /^[a-z_]{1,80}$/.test(body.detail.status) ? body.detail.status : null;
}

function validationFields(body: unknown): string[] {
  if (!body || typeof body !== "object" || !("detail" in body) || !Array.isArray(body.detail)) return [];
  return body.detail.slice(0, 5).flatMap((issue: unknown) => {
    if (!issue || typeof issue !== "object" || !("loc" in issue) || !Array.isArray(issue.loc)) return [];
    const path = issue.loc.filter((part: unknown) => typeof part === "number" || typeof part === "string" && /^[a-z_]+$/i.test(part)).join(".");
    return path ? [path.slice(0, 120)] : [];
  });
}

export function validateMusicPlan(request: ElevenLabsSongRequest): number {
  if (request.model !== "music_v2_5" || request.chunks.length < 1 || request.chunks.length > 30) throw new Error("ERR_ELEVENLABS_PLAN");
  let durationMs = 0;
  for (const chunk of request.chunks) {
    if (!chunk.text.trim() || chunk.text.length > 4000 || !Number.isSafeInteger(chunk.durationMs) || chunk.durationMs < 3000 || chunk.durationMs > 120_000) throw new Error("ERR_ELEVENLABS_CHUNK");
    const lines = chunk.text.split(/\r?\n/);
    if (lines.length > 30 || lines.some((line) => line.length > 200)) throw new Error("ERR_ELEVENLABS_LYRICS_FORMAT");
    if (chunk.positiveStyles.length < 1 || chunk.positiveStyles.length > 50 || chunk.negativeStyles.length > 50 || chunk.contextAdherence !== "high" && chunk.contextAdherence !== "medium" && chunk.contextAdherence !== "low") throw new Error("ERR_ELEVENLABS_STYLES");
    if ([...chunk.positiveStyles, ...chunk.negativeStyles].some((style) => !style.trim() || style.length > 160)) throw new Error("ERR_ELEVENLABS_STYLES");
    durationMs += chunk.durationMs;
  }
  if (durationMs < 3000 || durationMs > 600_000) throw new Error("ERR_ELEVENLABS_DURATION");
  return durationMs;
}

export function musicPlanHash(request: ElevenLabsSongRequest): string {
  return createHash("sha256").update(JSON.stringify(request)).digest("hex");
}

export function createElevenLabsMusicProvider(config: { readonly apiKey: string; readonly fetchImpl?: typeof fetch; readonly baseUrl?: string; readonly timeoutMs?: number }): ElevenLabsMusicProvider {
  if (!config.apiKey.trim()) throw new Error("ERR_ELEVENLABS_API_KEY");
  const fetchImpl = config.fetchImpl ?? fetch;
  const baseUrl = (config.baseUrl ?? "https://api.elevenlabs.io").replace(/\/$/, "");
  return {
    compose: async (request) => {
      validateMusicPlan(request);
      const body = {
        model_id: request.model,
        composition_plan: {
          chunks: request.chunks.map((chunk) => ({
            text: chunk.text,
            duration_ms: chunk.durationMs,
            positive_styles: chunk.positiveStyles,
            negative_styles: chunk.negativeStyles,
            context_adherence: chunk.contextAdherence
          }))
        },
        sign_with_c2pa: true
      };
      const response = await fetchImpl(`${baseUrl}/v1/music`, {
        method: "POST",
        headers: { "xi-api-key": config.apiKey, "content-type": "application/json", accept: "audio/mpeg" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(config.timeoutMs ?? 180_000)
      });
      if (!response.ok) {
        let fields: string[] = [];
        let providerStatus: string | null = null;
        try {
          const body = JSON.parse(await response.text()) as unknown;
          fields = validationFields(body);
          providerStatus = musicErrorStatus(body);
        }
        catch { /* Keep provider response bodies out of logs. */ }
        if (fields.length || providerStatus) console.warn("ElevenLabs rejected music plan", { status: response.status, providerStatus, fields });
        throw new ElevenLabsMusicHttpError(response.status, fields, providerStatus);
      }
      const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
      if (!(["audio/mpeg", "audio/mp3", "application/octet-stream"] as readonly string[]).includes(contentType)) throw new Error("ERR_ELEVENLABS_CONTENT_TYPE");
      if (!response.body) throw new Error("ERR_ELEVENLABS_EMPTY_BODY");
      const chunks: Uint8Array[] = [];
      let total = 0;
      for await (const chunk of response.body) {
        total += chunk.byteLength;
        if (total > 50_000_000) throw new Error("ERR_ELEVENLABS_TOO_LARGE");
        chunks.push(chunk);
      }
      const bytes = new Uint8Array(total);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      return { bytes, contentType, requestId: response.headers.get("request-id") ?? response.headers.get("x-request-id"), planHash: musicPlanHash(request) };
    }
  };
}
