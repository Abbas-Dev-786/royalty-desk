import type { DatabaseSync } from "node:sqlite";
import type { AlbumTrack, RevenueEvent, StudioAgent, StudioPolicy, WorkVersion } from "@studio/domain";
import { assertWorkTransition, requireAccountId, requireStudioId, validateAlbumTracks, validateRevenueEvent, validateStudioAgent, validateStudioPolicy, validateWorkVersion } from "@studio/domain";

export function createStudio(database: DatabaseSync, id: string, adminAccountId: string, nowMs = Date.now()): void {
  database.prepare("INSERT INTO studios(id, admin_account_id, created_at_ms) VALUES (?, ?, ?)").run(requireStudioId(id), requireAccountId(adminAccountId), nowMs);
}

export function addStudioAgent(database: DatabaseSync, agent: StudioAgent, nowMs = Date.now()): void {
  validateStudioAgent(agent);
  database.prepare("INSERT INTO studio_agents(id, studio_id, account_id, controller_account_id, role, active, allowed_tools_json, max_calls, expires_at_ms, key_reference, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(agent.id, agent.studioId, agent.accountId, agent.controllerAccountId, agent.role, agent.active ? 1 : 0, JSON.stringify(agent.allowedTools ?? ["lyrics", "composition", "review", "revision", "split_proposal", "split_response"]), agent.maxCalls ?? 10, agent.expiresAtMs ?? null, agent.keyReference ?? null, nowMs);
}

export function addStudioPolicy(database: DatabaseSync, policy: StudioPolicy, effectiveAtMs = Date.now()): void {
  validateStudioPolicy(policy);
  const previous = database.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM studio_policies WHERE studio_id = ?").get(policy.studioId) as { version: number };
  if (policy.version !== previous.version + 1) throw new Error("Stale or skipped policy version");
  database.prepare("INSERT INTO studio_policies(studio_id, version, mode, max_generation_calls, max_music_request_duration_ms, max_music_total_duration_ms, max_payout_yocto, paused, effective_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(policy.studioId, policy.version, policy.mode, policy.maxGenerationCalls, policy.maxMusicRequestDurationMs ?? 30_000, policy.maxMusicTotalDurationMs ?? 120_000, policy.maxPayoutYocto, policy.paused ? 1 : 0, effectiveAtMs);
}

export function createStudioProject(database: DatabaseSync, input: { readonly id: string; readonly studioId: string; readonly title: string }, nowMs = Date.now()): void {
  requireStudioId(input.id);
  requireStudioId(input.studioId);
  if (!input.title.trim() || input.title.length > 160) throw new Error("Invalid project title");
  database.prepare("INSERT INTO studio_projects(id, studio_id, title, status, created_at_ms) VALUES (?, ?, ?, 'draft', ?)").run(input.id, input.studioId, input.title, nowMs);
}

export function listStudioProjects(database: DatabaseSync, studioId: string, limit = 20, offset = 0): readonly { readonly id: string; readonly title: string; readonly status: string }[] {
  requireStudioId(studioId);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000) throw new Error("Invalid pagination");
  return database.prepare("SELECT id, title, status FROM studio_projects WHERE studio_id = ? ORDER BY id LIMIT ? OFFSET ?").all(studioId, limit, offset).map((row) => ({ id: String(row.id), title: String(row.title), status: String(row.status) }));
}

export function createStudioWork(database: DatabaseSync, input: { readonly id: string; readonly studioId: string; readonly projectId: string; readonly kind: "song" | "album" }): void {
  requireStudioId(input.id);
  requireStudioId(input.studioId);
  requireStudioId(input.projectId);
  const project = database.prepare("SELECT 1 FROM studio_projects WHERE id = ? AND studio_id = ?").get(input.projectId, input.studioId);
  if (!project) throw new Error("Project belongs to another studio");
  database.prepare("INSERT INTO studio_works(id, studio_id, project_id, kind, current_version) VALUES (?, ?, ?, ?, 1)").run(input.id, input.studioId, input.projectId, input.kind);
}

export function addWorkVersion(database: DatabaseSync, work: WorkVersion, nowMs = Date.now()): void {
  validateWorkVersion(work);
  const row = database.prepare("SELECT studio_id, kind, current_version FROM studio_works WHERE id = ?").get(work.workId) as { studio_id: string; kind: string; current_version: number } | undefined;
  if (!row || row.studio_id !== work.studioId || row.kind !== work.kind) throw new Error("Work belongs to another studio or kind");
  for (const share of work.split) {
    if (!database.prepare("SELECT 1 FROM studio_agents WHERE id = ? AND studio_id = ? AND active = 1").get(share.agentId, work.studioId)) throw new Error("Split references missing or inactive studio agent");
  }
  const existing = database.prepare("SELECT 1 FROM studio_work_versions WHERE work_id = ?").get(work.workId);
  const expected = existing ? row.current_version + 1 : 1;
  if (work.version !== expected) throw new Error("Stale work version");
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("INSERT INTO studio_work_versions(work_id, version, state, title, asset_hash, metadata_hash, price_yocto, split_json, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(work.workId, work.version, work.state, work.title, work.assetHash, work.metadataHash, work.priceYocto, JSON.stringify(work.split), nowMs);
    if (work.version > 1) {
      const result = database.prepare("UPDATE studio_works SET current_version = ? WHERE id = ? AND current_version = ?").run(work.version, work.workId, work.version - 1);
      if (result.changes !== 1) throw new Error("Concurrent work version change");
    }
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function transitionStudioWorkState(database: DatabaseSync, workId: string, version: number, from: WorkVersion["state"], to: WorkVersion["state"]): void {
  requireStudioId(workId);
  if (!Number.isSafeInteger(version) || version < 1) throw new Error("Invalid work version");
  assertWorkTransition(from, to);
  const changed = database.prepare("UPDATE studio_work_versions SET state = ? WHERE work_id = ? AND version = ? AND state = ?").run(to, workId, version, from);
  if (changed.changes !== 1) throw new Error("ERR_WORK_STATE_STALE");
}

export function addAlbumTracks(database: DatabaseSync, albumId: string, albumVersion: number, tracks: readonly AlbumTrack[]): void {
  validateAlbumTracks(tracks);
  const album = database.prepare("SELECT w.studio_id, w.project_id FROM studio_works w JOIN studio_work_versions v ON v.work_id = w.id WHERE w.id = ? AND v.version = ? AND w.kind = 'album'").get(albumId, albumVersion) as { studio_id: string; project_id: string } | undefined;
  if (!album) throw new Error("Album version does not exist");
  for (const track of tracks) {
    const song = database.prepare("SELECT w.studio_id, w.project_id FROM studio_works w JOIN studio_work_versions v ON v.work_id = w.id WHERE w.id = ? AND v.version = ? AND w.kind = 'song'").get(track.songId, track.songVersion) as { studio_id: string; project_id: string } | undefined;
    if (!song || song.studio_id !== album.studio_id || song.project_id !== album.project_id) throw new Error("Album track references another project");
  }
  database.exec("BEGIN IMMEDIATE");
  try {
    const insert = database.prepare("INSERT INTO studio_album_tracks(album_id, album_version, track_number, song_id, song_version, basis_points) VALUES (?, ?, ?, ?, ?, ?)");
    tracks.forEach((track, index) => insert.run(albumId, albumVersion, index + 1, track.songId, track.songVersion, track.basisPoints));
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function createRevenueEvent(database: DatabaseSync, event: RevenueEvent, nowMs = Date.now()): void {
  validateRevenueEvent(event);
  const work = database.prepare("SELECT 1 FROM studio_work_versions WHERE work_id = ? AND version = ?").get(event.workId, event.workVersion);
  if (!work) throw new Error("Revenue references missing work version");
  database.prepare("INSERT INTO studio_revenue_events(id, work_id, work_version, kind, buyer_account_id, gross_yocto, fee_yocto, refundable_yocto, state, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(event.id, event.workId, event.workVersion, event.kind, event.buyerAccountId, event.grossYocto, event.feeYocto, event.refundableYocto, event.state, nowMs);
}
