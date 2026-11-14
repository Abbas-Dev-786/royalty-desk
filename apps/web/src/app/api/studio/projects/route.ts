import { randomUUID } from "node:crypto";
import { createStudioProject } from "@studio/persistence";
import { requireOrigin } from "@/server/runtime";
import { requireStudioAdmin } from "@/server/studio-admin";
import { openStudioCatalogueDatabase } from "@/server/studio-catalogue";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const { studioId } = await requireStudioAdmin();
    const body = await request.json() as { title?: unknown; id?: unknown };
    if (typeof body.title !== "string" || body.title.trim().length < 3 || body.title.length > 120 || body.id !== undefined && (typeof body.id !== "string" || !/^project-album-[0-9a-f-]{36}$/.test(body.id))) return Response.json({ error: "ERR_PROJECT_TITLE" }, { status: 400 });
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
