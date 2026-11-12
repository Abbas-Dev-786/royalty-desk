import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { addStudioAsset, StudioMediaStore } from "@royaltydesk/persistence";
import { MusicProviderHttpError, type MusicComposeRequest, type MusicProvider } from "./music-provider.ts";
import { validateMusicMp3 } from "./media-validation.ts";

export interface DraftMusicRequest {
  readonly projectId: string;
  readonly workId: string;
  readonly workVersion: number;
  readonly revision: number;
  readonly agentId: string;
  readonly prompt: string;
  readonly durationMs: number;
  readonly model: MusicComposeRequest["model"];
  readonly licenseRef: string;
}

export interface DraftMusicResult {
  readonly operationId: string;
  readonly assetHash: string;
  readonly durationMs: number;
  readonly providerRequestId: string | null;
}

function digest(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }

export async function generateDraftMusic(database: DatabaseSync, media: StudioMediaStore, provider: MusicProvider, request: DraftMusicRequest, options: { readonly pollIntervalMs?: number; readonly maxPolls?: number } = {}): Promise<DraftMusicResult> {
  if (!Number.isSafeInteger(request.workVersion) || request.workVersion < 1 || !Number.isSafeInteger(request.revision) || request.revision < 0 || request.revision > 2) throw new Error("ERR_MUSIC_VERSION");
  if (!request.prompt.trim() || request.prompt.length > 4000 || !Number.isSafeInteger(request.durationMs) || request.durationMs < 1000 || request.durationMs > 380_000) throw new Error("ERR_MUSIC_REQUEST");
  if (!request.licenseRef.trim() || request.licenseRef.length > 512) throw new Error("ERR_MUSIC_LICENSE_REF");
  const scope = database.prepare("SELECT w.studio_id, a.active, a.allowed_tools_json, a.expires_at_ms, a.revoked_at_ms FROM studio_works w JOIN studio_projects p ON p.id = w.project_id JOIN studio_agents a ON a.studio_id = w.studio_id WHERE w.id = ? AND w.project_id = ? AND w.kind = 'song' AND a.id = ?").get(request.workId, request.projectId, request.agentId) as { studio_id: string; active: number; allowed_tools_json: string; expires_at_ms: number | null; revoked_at_ms: number | null } | undefined;
  if (!scope || !scope.active || scope.revoked_at_ms !== null || (scope.expires_at_ms !== null && scope.expires_at_ms <= Date.now())) throw new Error("ERR_MUSIC_AGENT_SCOPE");
  if (!(JSON.parse(scope.allowed_tools_json) as unknown[]).includes("music_generation")) throw new Error("ERR_MUSIC_TOOL_FORBIDDEN");
  const policy = database.prepare("SELECT max_generation_calls, max_music_request_duration_ms, max_music_total_duration_ms, paused FROM studio_policies WHERE studio_id = ? ORDER BY version DESC LIMIT 1").get(scope.studio_id) as { max_generation_calls: number; max_music_request_duration_ms: number; max_music_total_duration_ms: number; paused: number } | undefined;
  if (!policy || policy.paused) throw new Error("ERR_MUSIC_POLICY");
  if (request.durationMs > policy.max_music_request_duration_ms) throw new Error("ERR_MUSIC_REQUEST_DURATION_BUDGET");
  const promptHash = digest(request.prompt);
  const inputHash = digest(JSON.stringify({ prompt: request.prompt, durationMs: request.durationMs, model: request.model, licenseRef: request.licenseRef, agentId: request.agentId }));
  const logicalKey = `music:${request.projectId}:${request.workId}:${request.workVersion}:${request.revision}:${inputHash}`;
  const operationId = digest(logicalKey);
  const previous = database.prepare("SELECT o.status, o.provider_request_id, g.input_hash, g.asset_hash, g.duration_ms FROM studio_external_operations o LEFT JOIN studio_audio_generations g ON g.operation_id = o.id WHERE o.logical_key = ?").get(logicalKey) as { status: string; input_hash: string | null; asset_hash: string | null; duration_ms: number | null; provider_request_id: string | null } | undefined;
  const slotPrefix = `music:${request.projectId}:${request.workId}:${request.workVersion}:${request.revision}:`;
  if (!previous && database.prepare("SELECT 1 FROM studio_external_operations WHERE operation_type = 'stability_music' AND substr(logical_key, 1, ?) = ? LIMIT 1").get(slotPrefix.length, slotPrefix)) throw new Error("ERR_MUSIC_INPUT_CHANGED");
  if (previous) {
    if (previous.status === "finalized" && previous.asset_hash && previous.duration_ms) {
      if (previous.input_hash !== inputHash) throw new Error("ERR_MUSIC_INPUT_CHANGED");
      media.get(previous.asset_hash);
      return { operationId, assetHash: previous.asset_hash, durationMs: previous.duration_ms, providerRequestId: previous.provider_request_id };
    }
    if (previous.status !== "failed" && !(previous.status === "submitted" && previous.provider_request_id)) throw new Error("ERR_MUSIC_OUTCOME_UNKNOWN");
  }
  let generationId = previous?.status === "submitted" ? previous.provider_request_id : null;
  if (!generationId) {
    const prefix = `music:${request.projectId}:`;
    database.exec("BEGIN IMMEDIATE");
    try {
      const currentPolicy = database.prepare("SELECT max_generation_calls, max_music_request_duration_ms, max_music_total_duration_ms, paused FROM studio_policies WHERE studio_id = ? ORDER BY version DESC LIMIT 1").get(scope.studio_id) as typeof policy;
      if (!currentPolicy || currentPolicy.paused) throw new Error("ERR_MUSIC_POLICY");
      if (request.durationMs > currentPolicy.max_music_request_duration_ms) throw new Error("ERR_MUSIC_REQUEST_DURATION_BUDGET");
      const count = database.prepare("SELECT COUNT(*) AS n FROM studio_external_operations WHERE operation_type = 'stability_music' AND status != 'failed' AND substr(logical_key, 1, ?) = ?").get(prefix.length, prefix) as { n: number };
      if (count.n >= currentPolicy.max_generation_calls) throw new Error("ERR_MUSIC_BUDGET");
      const duration = database.prepare("SELECT COALESCE(SUM(requested_duration_ms), 0) AS total_ms FROM studio_external_operations WHERE operation_type = 'stability_music' AND status != 'failed' AND substr(logical_key, 1, ?) = ?").get(prefix.length, prefix) as { total_ms: number };
      if (duration.total_ms + request.durationMs > currentPolicy.max_music_total_duration_ms) throw new Error("ERR_MUSIC_DURATION_BUDGET");
      if (previous) {
        const claimed = database.prepare("UPDATE studio_external_operations SET status = 'requested', requested_duration_ms = ?, updated_at_ms = ? WHERE id = ? AND status = 'failed'").run(request.durationMs, Date.now(), operationId);
        if (claimed.changes !== 1) throw new Error("ERR_MUSIC_ALREADY_RETRYING");
      } else database.prepare("INSERT INTO studio_external_operations(id, logical_key, operation_type, status, requested_duration_ms, created_at_ms, updated_at_ms) VALUES (?, ?, 'stability_music', 'requested', ?, ?, ?)").run(operationId, logicalKey, request.durationMs, Date.now(), Date.now());
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    try {
      const started = await provider.start({ prompt: request.prompt, durationMs: request.durationMs, model: request.model, operationId });
      if (started.operationId !== operationId || started.promptHash !== promptHash || started.provider !== "stability-ai" || started.model !== request.model || !/^[a-f0-9]{64}$/.test(started.generationId)) throw new Error("ERR_MUSIC_PROVENANCE");
      const submitted = database.prepare("UPDATE studio_external_operations SET status = 'submitted', provider_request_id = ?, updated_at_ms = ? WHERE id = ? AND status = 'requested'").run(started.generationId, Date.now(), operationId);
      if (submitted.changes !== 1) throw new Error("ERR_MUSIC_SUBMIT_RECORD");
      generationId = started.generationId;
    } catch (error) {
      const status = error instanceof MusicProviderHttpError && error.definitiveRejection ? "failed" : "unknown";
      database.prepare("UPDATE studio_external_operations SET status = ?, updated_at_ms = ? WHERE id = ? AND status = 'requested'").run(status, Date.now(), operationId);
      throw error;
    }
  }
  const maxPolls = options.maxPolls ?? 120;
  const pollIntervalMs = options.pollIntervalMs ?? 5000;
  if (!Number.isSafeInteger(maxPolls) || maxPolls < 1 || maxPolls > 120 || !Number.isSafeInteger(pollIntervalMs) || pollIntervalMs < 0 || pollIntervalMs > 30_000) throw new Error("ERR_MUSIC_POLL_LIMIT");
  for (let attempt = 0; attempt < maxPolls; attempt += 1) {
    const result = await provider.poll(generationId);
    if (result.status === "processing") {
      if (attempt + 1 < maxPolls) await new Promise((resolveWait) => setTimeout(resolveWait, pollIntervalMs));
      continue;
    }
    const inspected = await validateMusicMp3(result.bytes, request.durationMs);
    const stored = media.put(result.bytes);
    database.exec("BEGIN IMMEDIATE");
    try {
      addStudioAsset(database, { hash: stored.hash, provider: "stability-ai", model: request.model, licenseRef: request.licenseRef, storageKey: `${stored.hash}.bin`, mimeType: inspected.mimeType, sizeBytes: stored.sizeBytes, durationMs: inspected.durationMs });
      database.prepare("INSERT INTO studio_audio_generations(operation_id, project_id, agent_id, work_id, work_version, revision, input_hash, prompt_hash, asset_hash, provider, model, provider_request_id, cost_units, license_ref, duration_ms, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(operationId, request.projectId, request.agentId, request.workId, request.workVersion, request.revision, inputHash, promptHash, stored.hash, "stability-ai", request.model, generationId, null, request.licenseRef, inspected.durationMs, Date.now());
      database.prepare("UPDATE studio_external_operations SET status = 'finalized', result_hash = ?, updated_at_ms = ? WHERE id = ? AND status = 'submitted'").run(stored.hash, Date.now(), operationId);
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    return { operationId, assetHash: stored.hash, durationMs: inspected.durationMs, providerRequestId: generationId };
  }
  throw new Error("ERR_MUSIC_STILL_PROCESSING");
}
