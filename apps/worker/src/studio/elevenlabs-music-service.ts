import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { addStudioAsset, StudioMediaStore } from "@royaltydesk/persistence";
import { ElevenLabsMusicHttpError, musicPlanHash, validateMusicPlan, type ElevenLabsMusicProvider, type ElevenLabsSongRequest } from "./elevenlabs-music-provider.ts";
import { validateMusicMp3 } from "./media-validation.ts";

export interface GenerateSongRequest {
  readonly projectId: string;
  readonly workId: string;
  readonly workVersion: number;
  readonly revision: number;
  readonly agentId: string;
  readonly plan: ElevenLabsSongRequest;
  readonly licenseRef: string;
}

export interface GeneratedSong {
  readonly operationId: string;
  readonly assetHash: string;
  readonly durationMs: number;
  readonly providerRequestId: string | null;
  readonly planHash: string;
}

const digest = (input: string) => createHash("sha256").update(input, "utf8").digest("hex");

export async function generateElevenLabsSong(database: DatabaseSync, media: StudioMediaStore, provider: ElevenLabsMusicProvider, request: GenerateSongRequest): Promise<GeneratedSong> {
  if (!Number.isSafeInteger(request.workVersion) || request.workVersion < 1 || !Number.isSafeInteger(request.revision) || request.revision < 0 || request.revision > 2) throw new Error("ERR_MUSIC_VERSION");
  if (!request.licenseRef.trim() || request.licenseRef.length > 512) throw new Error("ERR_MUSIC_LICENSE_REF");
  const durationMs = validateMusicPlan(request.plan);
  const planHash = musicPlanHash(request.plan);
  const inputHash = digest(JSON.stringify({ planHash, agentId: request.agentId, licenseRef: request.licenseRef }));
  const slotPrefix = `music:${request.projectId}:${request.workId}:${request.workVersion}:${request.revision}:`;
  const logicalKey = `${slotPrefix}${inputHash}`;
  const operationId = digest(logicalKey);
  const prior = database.prepare("SELECT o.status, o.provider_request_id, g.asset_hash, g.duration_ms, g.input_hash FROM studio_external_operations o LEFT JOIN studio_audio_generations g ON g.operation_id = o.id WHERE o.logical_key = ? AND o.operation_type = 'elevenlabs_music'").get(logicalKey) as { status: string; provider_request_id: string | null; asset_hash: string | null; duration_ms: number | null; input_hash: string | null } | undefined;
  if (prior?.status === "finalized" && prior.asset_hash && prior.duration_ms && prior.input_hash === inputHash) {
    media.get(prior.asset_hash);
    return { operationId, assetHash: prior.asset_hash, durationMs: prior.duration_ms, providerRequestId: prior.provider_request_id, planHash };
  }
  if (prior && prior.status !== "failed") throw new Error("ERR_MUSIC_OUTCOME_UNKNOWN");
  const prefix = `music:${request.projectId}:`;
  database.exec("BEGIN IMMEDIATE");
  try {
    const agent = database.prepare("SELECT w.studio_id, a.active, a.allowed_tools_json, a.revoked_at_ms, a.expires_at_ms FROM studio_works w JOIN studio_agents a ON a.studio_id = w.studio_id WHERE w.id = ? AND w.project_id = ? AND w.kind = 'song' AND a.id = ?").get(request.workId, request.projectId, request.agentId) as { studio_id: string; active: number; allowed_tools_json: string; revoked_at_ms: number | null; expires_at_ms: number | null } | undefined;
    if (!agent || !agent.active || agent.revoked_at_ms !== null || agent.expires_at_ms !== null && agent.expires_at_ms <= Date.now()) throw new Error("ERR_MUSIC_AGENT_SCOPE");
    if (!(JSON.parse(agent.allowed_tools_json) as unknown[]).includes("music_generation")) throw new Error("ERR_MUSIC_TOOL_FORBIDDEN");
    const policy = database.prepare("SELECT max_generation_calls, max_music_request_duration_ms, max_music_total_duration_ms, paused FROM studio_policies WHERE studio_id = ? ORDER BY version DESC LIMIT 1").get(agent.studio_id) as { max_generation_calls: number; max_music_request_duration_ms: number; max_music_total_duration_ms: number; paused: number } | undefined;
    if (!policy || policy.paused) throw new Error("ERR_MUSIC_POLICY");
    if (durationMs > policy.max_music_request_duration_ms) throw new Error("ERR_MUSIC_REQUEST_DURATION_BUDGET");
    if (!prior && database.prepare("SELECT 1 FROM studio_external_operations WHERE substr(logical_key, 1, ?) = ? LIMIT 1").get(slotPrefix.length, slotPrefix)) throw new Error("ERR_MUSIC_INPUT_CHANGED");
    const reserved = database.prepare("SELECT COUNT(*) AS calls, COALESCE(SUM(requested_duration_ms), 0) AS duration_ms FROM studio_external_operations WHERE operation_type IN ('stability_music','elevenlabs_music') AND status != 'failed' AND substr(logical_key, 1, ?) = ?").get(prefix.length, prefix) as { calls: number; duration_ms: number };
    if (reserved.calls >= policy.max_generation_calls) throw new Error("ERR_MUSIC_BUDGET");
    if (reserved.duration_ms + durationMs > policy.max_music_total_duration_ms) throw new Error("ERR_MUSIC_DURATION_BUDGET");
    if (prior) {
      const claimed = database.prepare("UPDATE studio_external_operations SET status = 'requested', requested_duration_ms = ?, updated_at_ms = ? WHERE id = ? AND status = 'failed'").run(durationMs, Date.now(), operationId);
      if (claimed.changes !== 1) throw new Error("ERR_MUSIC_ALREADY_RETRYING");
    } else {
      database.prepare("INSERT INTO studio_external_operations(id, logical_key, operation_type, status, requested_duration_ms, created_at_ms, updated_at_ms) VALUES (?, ?, 'elevenlabs_music', 'requested', ?, ?, ?)").run(operationId, logicalKey, durationMs, Date.now(), Date.now());
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
  try {
    const output = await provider.compose(request.plan);
    if (output.planHash !== planHash) throw new Error("ERR_MUSIC_PROVENANCE");
    const inspected = await validateMusicMp3(output.bytes, durationMs);
    const stored = media.put(output.bytes);
    database.exec("BEGIN IMMEDIATE");
    try {
      addStudioAsset(database, { hash: stored.hash, provider: "elevenlabs", model: request.plan.model, licenseRef: request.licenseRef, storageKey: `${stored.hash}.bin`, mimeType: inspected.mimeType, sizeBytes: stored.sizeBytes, durationMs: inspected.durationMs });
      database.prepare("INSERT INTO studio_audio_generations(operation_id, project_id, agent_id, work_id, work_version, revision, input_hash, prompt_hash, asset_hash, provider, model, provider_request_id, cost_units, license_ref, duration_ms, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'elevenlabs', ?, ?, NULL, ?, ?, ?)").run(operationId, request.projectId, request.agentId, request.workId, request.workVersion, request.revision, inputHash, planHash, stored.hash, request.plan.model, output.requestId, request.licenseRef, inspected.durationMs, Date.now());
      const finalized = database.prepare("UPDATE studio_external_operations SET status = 'finalized', result_hash = ?, provider_request_id = ?, updated_at_ms = ? WHERE id = ? AND status = 'requested'").run(stored.hash, output.requestId, Date.now(), operationId);
      if (finalized.changes !== 1) throw new Error("ERR_MUSIC_FINALIZE_RACE");
      database.exec("COMMIT");
    } catch (error) {
      database.exec("ROLLBACK");
      throw error;
    }
    return { operationId, assetHash: stored.hash, durationMs: inspected.durationMs, providerRequestId: output.requestId, planHash };
  } catch (error) {
    const status = error instanceof ElevenLabsMusicHttpError && error.definitiveRejection ? "failed" : "unknown";
    database.prepare("UPDATE studio_external_operations SET status = ?, updated_at_ms = ? WHERE id = ? AND status = 'requested'").run(status, Date.now(), operationId);
    throw error;
  }
}
