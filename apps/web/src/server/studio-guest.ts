import "server-only";
import { createHash } from "node:crypto";
import { createStudioProject } from "@studio/persistence";
import { currentUser } from "./runtime";
import { openStudioCatalogueDatabase, studioContractClient } from "./studio-catalogue";

export interface GuestSongRow { readonly account_id: string; readonly studio_id: string; readonly project_id: string; readonly brief: string; readonly title: string; readonly lyricist_id: string; readonly composer_id: string; readonly reviewer_id: string; readonly deadline_at_ms: number; readonly session_id: string | null; readonly work_id: string | null; }
interface OutputRow { readonly role: string; readonly agent_id: string; readonly model: string; readonly provider_mode: string; readonly output_hash: string; readonly output_json: string; readonly created_at_ms: number; }

export async function guestAccountId(): Promise<string> {
  const user = await currentUser();
  if (!user || user.networkId !== "testnet") throw new Error("ERR_UNAUTHORIZED");
  return user.accountId;
}

export function guestSong(accountId: string, projectId?: string): GuestSongRow | undefined {
  const database = openStudioCatalogueDatabase();
  try { return projectId ? database.prepare("SELECT * FROM studio_guest_songs WHERE account_id = ? AND project_id = ?").get(accountId, projectId) as unknown as GuestSongRow | undefined : database.prepare("SELECT * FROM studio_guest_songs WHERE account_id = ? ORDER BY created_at_ms DESC, project_id DESC LIMIT 1").get(accountId) as unknown as GuestSongRow | undefined; }
  finally { database.close(); }
}

export function listGuestSongs(accountId: string) {
  const database = openStudioCatalogueDatabase();
  try {
    const rows = database.prepare(`SELECT g.project_id, g.title, g.created_at_ms, g.work_id,
      COALESCE(j.state, 'reserved') AS status,
      EXISTS(SELECT 1 FROM studio_publications p WHERE p.work_id = g.work_id AND p.unpublished_at_ms IS NULL) AS published
      FROM studio_guest_songs g LEFT JOIN jobs j ON j.id = g.session_id
      WHERE g.account_id = ? ORDER BY g.created_at_ms DESC, g.project_id DESC`).all(accountId) as { project_id: string; title: string; created_at_ms: number; work_id: string | null; status: string; published: number }[];
    return rows.map((row) => ({ projectId: row.project_id, title: row.title, createdAtMs: row.created_at_ms, status: row.status, hasRecording: row.work_id !== null, published: Boolean(row.published) }));
  } finally { database.close(); }
}

export async function reserveGuestSong(accountId: string, projectId: string, title: string, brief: string): Promise<GuestSongRow> {
  if (!/^project-guest-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(projectId)) throw new Error("ERR_GUEST_PROJECT_ID");
  const contractId = studioContractClient().contractId;
  const database = openStudioCatalogueDatabase();
  try {
    database.exec("BEGIN IMMEDIATE");
    try {
      const existing = database.prepare("SELECT * FROM studio_guest_songs WHERE project_id = ?").get(projectId) as unknown as GuestSongRow | undefined;
      if (existing) {
        if (existing.account_id !== accountId || existing.title !== title || existing.brief !== brief) throw new Error("ERR_GUEST_PROJECT_MISMATCH");
        database.exec("COMMIT"); return existing;
      }
      const studio = database.prepare("SELECT id FROM studios WHERE admin_account_id = ? LIMIT 1").get(contractId) as { id: string } | undefined;
      if (!studio) throw new Error("ERR_GUEST_STUDIO_UNAVAILABLE");
      const agents = database.prepare("SELECT id, role FROM studio_agents WHERE studio_id = ? AND role IN ('lyricist','composer','reviewer') AND active = 1 AND revoked_at_ms IS NULL AND (expires_at_ms IS NULL OR expires_at_ms > ?) ORDER BY id").all(studio.id, Date.now()) as { id: string; role: string }[];
      const byRole = (role: string) => agents.find((agent) => agent.role === role)?.id;
      const lyricistId = byRole("lyricist"), composerId = byRole("composer"), reviewerId = byRole("reviewer");
      if (!lyricistId || !composerId || !reviewerId || new Set([lyricistId, composerId, reviewerId]).size !== 3) throw new Error("ERR_GUEST_AGENT_TEAM_UNAVAILABLE");
      const deadlineAtMs = Date.now() + 600_000;
      createStudioProject(database, { id: projectId, studioId: studio.id, title });
      database.prepare("INSERT INTO studio_guest_songs(account_id,studio_id,project_id,brief,title,lyricist_id,composer_id,reviewer_id,deadline_at_ms,created_at_ms) VALUES (?,?,?,?,?,?,?,?,?,?)").run(accountId, studio.id, projectId, brief, title, lyricistId, composerId, reviewerId, deadlineAtMs, Date.now());
      const created = database.prepare("SELECT * FROM studio_guest_songs WHERE project_id = ?").get(projectId) as unknown as GuestSongRow;
      database.exec("COMMIT");
      return created;
    } catch (error) { database.exec("ROLLBACK"); throw error; }
  } finally { database.close(); }
}

export function guestSnapshot(accountId: string, projectId?: string) {
  const database = openStudioCatalogueDatabase();
  try {
    const row = projectId ? database.prepare("SELECT * FROM studio_guest_songs WHERE account_id = ? AND project_id = ?").get(accountId, projectId) as unknown as GuestSongRow | undefined : database.prepare("SELECT * FROM studio_guest_songs WHERE account_id = ? ORDER BY created_at_ms DESC, project_id DESC LIMIT 1").get(accountId) as unknown as GuestSongRow | undefined;
    if (!row) return null;
    const job = row.session_id ? database.prepare("SELECT state, error_code FROM jobs WHERE id = ?").get(row.session_id) as { state: string; error_code: string | null } | undefined : undefined;
    const uncertain = job?.state === "failed" && Boolean(database.prepare("SELECT 1 FROM studio_external_operations WHERE operation_type = 'near_ai_creative' AND logical_key LIKE ? AND status IN ('requested','submitted','unknown') LIMIT 1").get(`creative:${row.project_id}:%`));
    const outputRows = database.prepare("SELECT o.role,o.agent_id,o.model,o.provider_mode,o.output_hash,o.output_json,o.created_at_ms FROM studio_model_outputs o JOIN studio_external_operations e ON e.id=o.operation_id WHERE o.project_id = ? AND e.status = 'finalized' ORDER BY o.created_at_ms, o.operation_id LIMIT 12").all(row.project_id) as unknown as OutputRow[];
    const steps = outputRows.flatMap((output) => {
      if (output.provider_mode !== "live" || createHash("sha256").update(output.output_json).digest("hex") !== output.output_hash) return [];
      try {
        const parsed = JSON.parse(output.output_json) as { content?: unknown };
        return typeof parsed.content === "string" ? [{ role: output.role, agentId: output.agent_id, model: output.model, content: parsed.content.slice(0, 4000), outputHash: output.output_hash, createdAtMs: output.created_at_ms }] : [];
      } catch { return []; }
    });
    const work = row.work_id ? database.prepare("SELECT v.version, v.state, v.asset_hash, a.duration_ms, p.chain_tx_hash FROM studio_work_versions v JOIN studio_assets a ON a.hash = v.asset_hash LEFT JOIN studio_publications p ON p.work_id = v.work_id AND p.work_version = v.version AND p.unpublished_at_ms IS NULL WHERE v.work_id = ? ORDER BY v.version DESC LIMIT 1").get(row.work_id) as { version: number; state: string; asset_hash: string; duration_ms: number | null; chain_tx_hash: string | null } | undefined : undefined;
    return { projectId: row.project_id, title: row.title, brief: row.brief, sessionId: row.session_id, status: job?.state ?? "reserved", error: uncertain ? "ERR_CREATIVE_OUTCOME_UNKNOWN" : job?.error_code ?? null, steps, song: work ? { workId: row.work_id, version: work.version, state: work.state, published: Boolean(work.chain_tx_hash), durationMs: work.duration_ms, assetHash: work.asset_hash } : null };
  } finally { database.close(); }
}
