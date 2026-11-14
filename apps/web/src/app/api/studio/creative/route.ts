import { requireOrigin } from "@/server/runtime";
import { requireStudioProjectAccess } from "@/server/studio-album-access";
import { requireAlbumTrackAccess } from "@/lib/studio-album-access";
import { openStudioCatalogueDatabase, studioContractClient } from "@/server/studio-catalogue";

export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const body = await request.json() as { projectId?: unknown; brief?: unknown; lyricistId?: unknown; composerId?: unknown; reviewerId?: unknown; deadlineAtMs?: unknown };
    if (typeof body.projectId !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(body.projectId) || typeof body.brief !== "string" || body.brief.trim().length < 20 || body.brief.length > 2000 || typeof body.lyricistId !== "string" || typeof body.composerId !== "string" || typeof body.reviewerId !== "string" || body.lyricistId === body.composerId || typeof body.deadlineAtMs !== "number" || !Number.isSafeInteger(body.deadlineAtMs) || body.deadlineAtMs > Date.now() + 600_000) return Response.json({ error: "ERR_CREATIVE_INPUT" }, { status: 400 });
    const access = await requireStudioProjectAccess(body.projectId);
    const { studioId } = access;
    requireAlbumTrackAccess(access, body.brief.trim(), body.lyricistId, body.composerId, body.reviewerId);
    if (access.kind === "album_owner" && (await studioContractClient().policy()).paused) return Response.json({ error: "ERR_STUDIO_PAUSED" }, { status: 409 });
    const database = openStudioCatalogueDatabase();
    try {
      if (!database.prepare("SELECT 1 FROM studio_projects WHERE id = ? AND studio_id = ?").get(body.projectId, studioId)) return Response.json({ error: "ERR_PROJECT_SCOPE" }, { status: 404 });
      const agentRoles: readonly (readonly [string, string])[] = [[body.lyricistId, "lyricist"], [body.composerId, "composer"], [body.reviewerId, "reviewer"]];
      for (const [agentId, role] of agentRoles) if (!database.prepare("SELECT 1 FROM studio_agents WHERE id = ? AND studio_id = ? AND role = ? AND active = 1 AND revoked_at_ms IS NULL").get(agentId, studioId, role)) return Response.json({ error: `ERR_AGENT_SCOPE:${role}` }, { status: 409 });
    } finally { database.close(); }
    const token = process.env.STUDIO_WORKER_TOKEN;
    if (!token || token.length < 32) return Response.json({ error: "ERR_WORKER_NOT_CONFIGURED" }, { status: 503 });
    const workerUrl = process.env.STUDIO_WORKER_URL ?? "http://127.0.0.1:3101";
    const input = { projectId: body.projectId, brief: body.brief.trim(), lyricistId: body.lyricistId, composerId: body.composerId, reviewerId: body.reviewerId, maxCalls: 6, maxOutputTokens: 4000, maxRevisions: 0, deadlineAtMs: body.deadlineAtMs };
    const headers = { "content-type": "application/json", authorization: `Bearer ${token}` };
    const createdResponse = await fetch(`${workerUrl}/studio/sessions`, { method: "POST", headers, body: JSON.stringify(input), cache: "no-store" });
    const created = await createdResponse.json() as { sessionId?: string; error?: string };
    if (!createdResponse.ok || !created.sessionId) return Response.json({ error: created.error ?? "ERR_CREATIVE_SESSION" }, { status: 502 });
    const runResponse = await fetch(`${workerUrl}/studio/sessions/${created.sessionId}/run`, { method: "POST", headers, body: JSON.stringify(input), cache: "no-store" });
    const run = await runResponse.json() as { status?: string; outcome?: string; error?: string };
    return Response.json({ sessionId: created.sessionId, status: run.status ?? null, outcome: run.outcome ?? null, ...(run.error ? { error: run.error } : {}) }, { status: runResponse.ok ? 200 : 502, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CREATIVE_RUN_FAILED";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 409 });
  }
}
