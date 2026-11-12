import { createHash } from "node:crypto";

export interface MusicComposeRequest {
  readonly prompt: string;
  readonly durationMs: number;
  readonly model: "stable-audio-3";
  readonly operationId: string;
}

export interface MusicStartResult {
  readonly generationId: string;
  readonly operationId: string;
  readonly provider: "stability-ai";
  readonly model: MusicComposeRequest["model"];
  readonly promptHash: string;
}

export type MusicPollResult =
  | { readonly status: "processing" }
  | { readonly status: "complete"; readonly bytes: Uint8Array; readonly contentType: string; readonly outputFormat: "mp3"; readonly finishReason: string | null; readonly seed: string | null };

export interface MusicProvider {
  start(request: MusicComposeRequest): Promise<MusicStartResult>;
  poll(generationId: string): Promise<MusicPollResult>;
}

export class MusicProviderHttpError extends Error {
  readonly status: number;
  constructor(status: number) { super(`ERR_MUSIC_HTTP_${status}`); this.status = status; }
  get definitiveRejection(): boolean { return [400, 401, 402, 403, 404, 422].includes(this.status); }
}

const generationIdPattern = /^[a-f0-9]{64}$/;

async function readBoundedAudio(response: Response): Promise<Uint8Array> {
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > 50_000_000) throw new Error("ERR_MUSIC_TOO_LARGE");
  if (!response.body) throw new Error("ERR_MUSIC_EMPTY_BODY");
  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > 50_000_000) throw new Error("ERR_MUSIC_TOO_LARGE");
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  if (bytes.byteLength < 128) throw new Error("ERR_MUSIC_SIZE");
  return bytes;
}

export function createStabilityMusicProvider(config: { readonly apiKey: string; readonly baseUrl?: string; readonly fetchImpl?: typeof fetch; readonly timeoutMs?: number }): MusicProvider {
  if (!config.apiKey.trim()) throw new Error("ERR_MUSIC_API_KEY");
  const fetchImpl = config.fetchImpl ?? fetch;
  const baseUrl = (config.baseUrl ?? "https://api.stability.ai").replace(/\/$/, "");
  const headers = { authorization: `Bearer ${config.apiKey}`, accept: "audio/*" };
  return {
    start: async (request) => {
      if (!request.prompt.trim() || request.prompt.length > 4000 || !Number.isSafeInteger(request.durationMs) || request.durationMs < 1000 || request.durationMs > 380_000 || !generationIdPattern.test(request.operationId)) throw new Error("ERR_MUSIC_REQUEST");
      if (request.model !== "stable-audio-3") throw new Error("ERR_MUSIC_MODEL");
      const body = new FormData();
      body.set("prompt", request.prompt);
      body.set("model", request.model);
      body.set("duration", String(request.durationMs / 1000));
      body.set("output_format", "mp3");
      const response = await fetchImpl(`${baseUrl}/v2beta/audio/stable-audio/text-to-audio`, { method: "POST", headers, body, signal: AbortSignal.timeout(config.timeoutMs ?? 120_000) });
      if (response.status !== 202) throw new MusicProviderHttpError(response.status);
      const payload = await response.json() as { id?: unknown };
      if (typeof payload.id !== "string" || !generationIdPattern.test(payload.id)) throw new Error("ERR_MUSIC_GENERATION_ID");
      return { generationId: payload.id, operationId: request.operationId, provider: "stability-ai", model: request.model, promptHash: createHash("sha256").update(request.prompt, "utf8").digest("hex") };
    },
    poll: async (generationId) => {
      if (!generationIdPattern.test(generationId)) throw new Error("ERR_MUSIC_GENERATION_ID");
      const response = await fetchImpl(`${baseUrl}/v2beta/audio/results/${generationId}`, { method: "GET", headers, signal: AbortSignal.timeout(config.timeoutMs ?? 120_000) });
      if (response.status === 202) return { status: "processing" };
      if (response.status !== 200) throw new MusicProviderHttpError(response.status);
      const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? "";
      if (contentType !== "audio/mpeg" && contentType !== "audio/mp3" && contentType !== "application/octet-stream") throw new Error("ERR_MUSIC_CONTENT_TYPE");
      const finishReason = response.headers.get("finish-reason");
      if (finishReason && finishReason.toUpperCase() !== "SUCCESS") throw new Error("ERR_MUSIC_FINISH_REASON");
      return { status: "complete", bytes: await readBoundedAudio(response), contentType, outputFormat: "mp3", finishReason, seed: response.headers.get("seed") };
    }
  };
}
