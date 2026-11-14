import { guestAccountId, guestSnapshot, guestSong } from "@/server/studio-guest";
import { openStudioCatalogueDatabase, studioContractClient } from "@/server/studio-catalogue";
import { requireOrigin } from "@/server/runtime";

export const maxDuration = 300;
const headers = { "cache-control": "private, no-store" };

async function finalizeGuestSong(accountId: string, projectId: string, workId: string, reviewerId: string): Promise<Response> {
  const token = process.env.STUDIO_WORKER_TOKEN;
  if (!token || token.length < 32) return Response.json({ error: "ERR_WORKER_NOT_CONFIGURED", demo: guestSnapshot(accountId, projectId) }, { status: 503, headers });
  const workerUrl = process.env.STUDIO_WORKER_URL ?? "http://127.0.0.1:3101";
  const upstream = await fetch(`${workerUrl}/studio/releases/${encodeURIComponent(workId)}/finalize`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ version: 1, reviewerId }), cache: "no-store" });
  const result = await upstream.json() as { published?: boolean; error?: string };
  return Response.json({ demo: guestSnapshot(accountId, projectId), ...(upstream.ok ? { published: result.published === true } : { error: result.error ?? "ERR_GUEST_FINALIZE" }) }, { status: upstream.ok ? 200 : 409, headers });
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const accountId = await guestAccountId();
    const rawBody = await request.text();
    const body = rawBody ? JSON.parse(rawBody) as { projectId?: unknown; action?: unknown } : {};
    if (body.projectId !== undefined && typeof body.projectId !== "string") return Response.json({ error: "ERR_GUEST_PROJECT_ID" }, { status: 400, headers });
    if (body.action !== undefined && body.action !== "publish") return Response.json({ error: "ERR_GUEST_SONG_ACTION" }, { status: 400, headers });
    const row = guestSong(accountId, body.projectId);
    if (!row) return Response.json({ error: "ERR_GUEST_NOT_STARTED" }, { status: 404, headers });
    if (row.work_id) {
      const state = guestSnapshot(accountId, row.project_id);
      if (body.action !== "publish" || state?.song?.published) return Response.json({ demo: state }, { headers });
      return finalizeGuestSong(accountId, row.project_id, row.work_id, row.reviewer_id);
    }
    if (body.action === "publish") return Response.json({ error: "ERR_GUEST_RECORDING_MISSING" }, { status: 409, headers });
    if ((await studioContractClient().policy()).paused) return Response.json({ error: "ERR_STUDIO_PAUSED" }, { status: 409, headers });
    const database = openStudioCatalogueDatabase();
    let ready = false;
    try { ready = Boolean(row.session_id && database.prepare("SELECT 1 FROM jobs WHERE id = ? AND state = 'awaiting_human' AND json_extract(result_json, '$.status') = 'awaiting_acceptance'").get(row.session_id)); }
    finally { database.close(); }
    if (!ready) return Response.json({ error: "ERR_GUEST_AGENTS_NOT_READY", demo: guestSnapshot(accountId, row.project_id) }, { status: 409, headers });
    const token = process.env.STUDIO_WORKER_TOKEN;
    if (!token || token.length < 32) return Response.json({ error: "ERR_WORKER_NOT_CONFIGURED" }, { status: 503, headers });
    const workerUrl = process.env.STUDIO_WORKER_URL ?? "http://127.0.0.1:3101";
    const upstream = await fetch(`${workerUrl}/studio/songs/generate`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ projectId: row.project_id, brief: row.brief, title: row.title, lyricistId: row.lyricist_id, composerId: row.composer_id, reviewerId: row.reviewer_id }), cache: "no-store" });
    const result = await upstream.json() as { workId?: string; error?: string };
    if (!upstream.ok || !result.workId) return Response.json({ error: result.error ?? "ERR_GUEST_AUDIO", demo: guestSnapshot(accountId, row.project_id) }, { status: 409, headers });
    const updated = openStudioCatalogueDatabase();
    try {
      const stored = updated.prepare("UPDATE studio_guest_songs SET work_id = ? WHERE account_id = ? AND project_id = ? AND (work_id IS NULL OR work_id = ?)").run(result.workId, accountId, row.project_id, result.workId);
      if (stored.changes !== 1) throw new Error("ERR_GUEST_WORK_MISMATCH");
      updated.prepare("UPDATE jobs SET error_code = NULL WHERE id = ?").run(row.session_id);
    } finally { updated.close(); }
    return Response.json({ demo: guestSnapshot(accountId, row.project_id) }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERR_GUEST_AUDIO";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : 409, headers });
  }
}
