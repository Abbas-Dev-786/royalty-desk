import { guestAccountId, guestSnapshot, listGuestSongs, reserveGuestSong } from "@/server/studio-guest";
import { openStudioCatalogueDatabase, studioContractClient } from "@/server/studio-catalogue";
import { requireOrigin } from "@/server/runtime";

export const maxDuration = 300;
const headers = { "cache-control": "private, no-store" };

export async function GET(request: Request): Promise<Response> {
  try {
    const accountId = await guestAccountId();
    const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
    return Response.json({ demo: guestSnapshot(accountId, projectId), songs: listGuestSongs(accountId) }, { headers });
  }
  catch (error) { const message = error instanceof Error ? error.message : "ERR_GUEST_STATUS"; return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : 503, headers }); }
}

export async function POST(request: Request): Promise<Response> {
  let accountId: string | undefined;
  let projectId: string | undefined;
  try {
    requireOrigin(request);
    accountId = await guestAccountId();
    const body = await request.json() as { projectId?: unknown; title?: unknown; brief?: unknown };
    if (typeof body.projectId !== "string" || typeof body.title !== "string" || body.title.trim().length < 1 || body.title.length > 160 || typeof body.brief !== "string" || body.brief.trim().length < 20 || body.brief.length > 2000) return Response.json({ error: "ERR_GUEST_INPUT" }, { status: 400, headers });
    let policy;
    try { policy = await studioContractClient().policy(); }
    catch { return Response.json({ error: "ERR_STUDIO_GOVERNANCE_UNAVAILABLE" }, { status: 503, headers }); }
    if (policy.paused) return Response.json({ error: "ERR_STUDIO_PAUSED" }, { status: 409, headers });
    const token = process.env.STUDIO_WORKER_TOKEN;
    if (!token || token.length < 32) return Response.json({ error: "ERR_WORKER_NOT_CONFIGURED" }, { status: 503, headers });
    const row = await reserveGuestSong(accountId, body.projectId, body.title.trim(), body.brief.trim());
    projectId = row.project_id;
    const workerUrl = process.env.STUDIO_WORKER_URL ?? "http://127.0.0.1:3101";
    const input = { projectId: row.project_id, brief: row.brief, lyricistId: row.lyricist_id, composerId: row.composer_id, reviewerId: row.reviewer_id, maxCalls: 6, maxOutputTokens: 4000, maxRevisions: 0, deadlineAtMs: row.deadline_at_ms };
    const workerHeaders = { "content-type": "application/json", authorization: `Bearer ${token}` };
    let createdResponse: Response;
    try { createdResponse = await fetch(`${workerUrl}/studio/sessions`, { method: "POST", headers: workerHeaders, body: JSON.stringify(input), cache: "no-store" }); }
    catch { return Response.json({ error: "ERR_GUEST_WORKER_UNAVAILABLE", demo: guestSnapshot(accountId, row.project_id), songs: listGuestSongs(accountId) }, { status: 503, headers }); }
    const created = await createdResponse.json() as { sessionId?: string; error?: string };
    if (!createdResponse.ok || !created.sessionId) return Response.json({ error: created.error ?? "ERR_GUEST_SESSION", demo: guestSnapshot(accountId, row.project_id) }, { status: 502, headers });
    const database = openStudioCatalogueDatabase();
    try { database.prepare("UPDATE studio_guest_songs SET session_id = ? WHERE account_id = ? AND project_id = ? AND (session_id IS NULL OR session_id = ?)").run(created.sessionId, accountId, row.project_id, created.sessionId); }
    finally { database.close(); }
    let runResponse: Response;
    try { runResponse = await fetch(`${workerUrl}/studio/sessions/${created.sessionId}/run`, { method: "POST", headers: workerHeaders, body: JSON.stringify(input), cache: "no-store" }); }
    catch { return Response.json({ error: "ERR_GUEST_RUN_OUTCOME_UNKNOWN", demo: guestSnapshot(accountId, row.project_id), songs: listGuestSongs(accountId) }, { status: 503, headers }); }
    const run = await runResponse.json() as { status?: string; error?: string };
    return Response.json({ demo: guestSnapshot(accountId, row.project_id), songs: listGuestSongs(accountId), ...(runResponse.ok ? {} : { error: run.error ?? "ERR_GUEST_RUN" }) }, { status: runResponse.ok ? 200 : 502, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERR_GUEST_RUN";
    return Response.json({ error: message, ...(accountId && projectId ? { demo: guestSnapshot(accountId, projectId), songs: listGuestSongs(accountId) } : {}) }, { status: message === "ERR_UNAUTHORIZED" ? 401 : 409, headers });
  }
}
