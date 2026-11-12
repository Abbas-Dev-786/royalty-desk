import { randomUUID } from "node:crypto";
import { createStudioProject } from "@royaltydesk/persistence";
import { requireOrigin } from "@/server/runtime";
import { requireStudioAdmin } from "@/server/studio-admin";
import { openStudioCatalogueDatabase } from "@/server/studio-catalogue";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const { studioId } = await requireStudioAdmin();
    const body = await request.json() as { title?: unknown };
    if (typeof body.title !== "string" || body.title.trim().length < 3 || body.title.length > 120) return Response.json({ error: "ERR_PROJECT_TITLE" }, { status: 400 });
    const id = `project-${randomUUID()}`;
    const database = openStudioCatalogueDatabase();
    try { createStudioProject(database, { id, studioId, title: body.title.trim() }); }
    finally { database.close(); }
    return Response.json({ id, title: body.title.trim(), status: "draft" }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "PROJECT_CREATE_FAILED";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 409 });
  }
}
