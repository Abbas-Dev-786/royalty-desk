import { requireOrigin } from "@/server/runtime";
import { requireStudioAdmin } from "@/server/studio-admin";
import { openStudioCatalogueDatabase } from "@/server/studio-catalogue";

export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const { studioId } = await requireStudioAdmin();
    const body = await request.json() as { projectId?: unknown; brief?: unknown; title?: unknown; lyricistId?: unknown; composerId?: unknown; reviewerId?: unknown };
    const validId = (value: unknown): value is string => typeof value === "string" && /^[a-z0-9][a-z0-9._-]{0,63}$/.test(value);
    if (!validId(body.projectId) || typeof body.brief !== "string" || body.brief.trim().length < 20 || body.brief.length > 2000 || typeof body.title !== "string" || !body.title.trim() || body.title.length > 160 || !validId(body.lyricistId) || !validId(body.composerId) || !validId(body.reviewerId) || new Set([body.lyricistId, body.composerId, body.reviewerId]).size !== 3) return Response.json({ error: "ERR_SONG_INPUT" }, { status: 400 });
    const database = openStudioCatalogueDatabase();
    try {
      if (!database.prepare("SELECT 1 FROM studio_projects WHERE id = ? AND studio_id = ?").get(body.projectId, studioId)) return Response.json({ error: "ERR_SONG_PROJECT_SCOPE" }, { status: 404 });
      for (const [id, role] of [[body.lyricistId, "lyricist"], [body.composerId, "composer"], [body.reviewerId, "reviewer"]] as const) {
        if (!database.prepare("SELECT 1 FROM studio_agents WHERE id = ? AND studio_id = ? AND role = ? AND active = 1 AND revoked_at_ms IS NULL AND (expires_at_ms IS NULL OR expires_at_ms > ?)").get(id, studioId, role, Date.now())) return Response.json({ error: `ERR_SONG_AGENT_SCOPE:${role}` }, { status: 409 });
      }
    } finally { database.close(); }
    const token = process.env.STUDIO_WORKER_TOKEN;
    if (!token || token.length < 32) return Response.json({ error: "ERR_WORKER_NOT_CONFIGURED" }, { status: 503 });
    const workerUrl = process.env.STUDIO_WORKER_URL ?? "http://127.0.0.1:3101";
    const upstream = await fetch(`${workerUrl}/studio/songs/generate`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ projectId: body.projectId, brief: body.brief.trim(), title: body.title.trim(), lyricistId: body.lyricistId, composerId: body.composerId, reviewerId: body.reviewerId }), cache: "no-store" });
    const result = await upstream.json() as { error?: string; workId?: string };
    return Response.json(result, { status: upstream.ok ? 200 : 409, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERR_SONG_GENERATION";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 409 });
  }
}
