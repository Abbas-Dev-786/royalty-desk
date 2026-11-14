import { randomUUID } from "node:crypto";
import { createStudioProject } from "@studio/persistence";
import { requireOrigin } from "@/server/runtime";
import { requireStudioAdmin } from "@/server/studio-admin";
import { guestAccountId } from "@/server/studio-guest";
import { openStudioCatalogueDatabase, studioContractClient } from "@/server/studio-catalogue";

const albumProjectId = /^project-album-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const agentId = /^[a-z0-9][a-z0-9._-]{0,63}$/;

async function createUserAlbumProject(body: { title: string; id: string; concept?: unknown; lyricistId?: unknown; composerId?: unknown; reviewerId?: unknown }): Promise<Response> {
  const accountId = await guestAccountId();
  if (typeof body.concept !== "string" || body.concept.trim().length < 20 || body.concept.length > 1600 || typeof body.lyricistId !== "string" || !agentId.test(body.lyricistId) || typeof body.composerId !== "string" || !agentId.test(body.composerId) || typeof body.reviewerId !== "string" || !agentId.test(body.reviewerId) || new Set([body.lyricistId, body.composerId, body.reviewerId]).size !== 3) return Response.json({ error: "ERR_ALBUM_INPUT" }, { status: 400 });
  const concept = body.concept.trim();
  const ids = [body.lyricistId, body.composerId, body.reviewerId] as [string, string, string];
  const database = openStudioCatalogueDatabase();
  try {
    database.exec("BEGIN IMMEDIATE");
    try {
      const existing = database.prepare(`SELECT p.studio_id, p.title, a.account_id, a.concept, a.lyricist_id, a.composer_id, a.reviewer_id
        FROM studio_projects p LEFT JOIN studio_user_album_projects a ON a.project_id = p.id WHERE p.id = ?`).get(body.id) as { studio_id: string; title: string; account_id: string | null; concept: string | null; lyricist_id: string | null; composer_id: string | null; reviewer_id: string | null } | undefined;
      const studio = database.prepare("SELECT id FROM studios WHERE admin_account_id = ? LIMIT 1").get(studioContractClient().contractId) as { id: string } | undefined;
      if (!studio) throw new Error("ERR_GUEST_STUDIO_UNAVAILABLE");
      if (existing) {
        if (existing.studio_id !== studio.id || existing.title !== body.title || existing.account_id !== accountId || existing.concept !== concept || existing.lyricist_id !== ids[0] || existing.composer_id !== ids[1] || existing.reviewer_id !== ids[2]) throw new Error("ERR_PROJECT_ID_CONFLICT");
      } else {
        for (const [id, role] of [[ids[0], "lyricist"], [ids[1], "composer"], [ids[2], "reviewer"]] as const) {
          if (!database.prepare("SELECT 1 FROM studio_agents WHERE id = ? AND studio_id = ? AND role = ? AND active = 1 AND revoked_at_ms IS NULL AND (expires_at_ms IS NULL OR expires_at_ms > ?)").get(id, studio.id, role, Date.now())) throw new Error(`ERR_AGENT_SCOPE:${role}`);
        }
        createStudioProject(database, { id: body.id, studioId: studio.id, title: body.title });
        database.prepare("INSERT INTO studio_user_album_projects(project_id, account_id, concept, lyricist_id, composer_id, reviewer_id, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?)").run(body.id, accountId, concept, ids[0], ids[1], ids[2], Date.now());
      }
      database.exec("COMMIT");
      return Response.json({ id: body.id, title: body.title, status: "draft" }, { status: existing ? 200 : 201, headers: { "cache-control": "no-store" } });
    } catch (error) { database.exec("ROLLBACK"); throw error; }
  } finally { database.close(); }
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const body = await request.json() as { title?: unknown; id?: unknown; concept?: unknown; lyricistId?: unknown; composerId?: unknown; reviewerId?: unknown };
    if (typeof body.title !== "string" || body.title.trim().length < 3 || body.title.length > 120 || body.id !== undefined && (typeof body.id !== "string" || !/^project-album-[0-9a-f-]{36}$/.test(body.id))) return Response.json({ error: "ERR_PROJECT_TITLE" }, { status: 400 });
    if (typeof body.id === "string" && albumProjectId.test(body.id)) return await createUserAlbumProject({ ...body, title: body.title.trim(), id: body.id });
    const { studioId } = await requireStudioAdmin();
    const id = typeof body.id === "string" ? body.id : `project-${randomUUID()}`;
    const database = openStudioCatalogueDatabase();
    try {
      const existing = database.prepare("SELECT studio_id, title FROM studio_projects WHERE id = ?").get(id) as { studio_id: string; title: string } | undefined;
      if (existing && (existing.studio_id !== studioId || existing.title !== body.title.trim())) return Response.json({ error: "ERR_PROJECT_ID_CONFLICT" }, { status: 409 });
      if (!existing) createStudioProject(database, { id, studioId, title: body.title.trim() });
    }
    finally { database.close(); }
    return Response.json({ id, title: body.title.trim(), status: "draft" }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PROJECT_CREATE_FAILED";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 409 });
  }
}
