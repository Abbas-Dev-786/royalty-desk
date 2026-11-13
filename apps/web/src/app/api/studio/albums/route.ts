import { resolve } from "node:path";
import { createStudioAlbumDraft, StudioMediaStore } from "@studio/persistence";
import { requireOrigin } from "@/server/runtime";
import { requireStudioAdmin } from "@/server/studio-admin";
import { openStudioCatalogueDatabase } from "@/server/studio-catalogue";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const { studioId } = await requireStudioAdmin();
    const body = await request.json() as { projectId?: unknown; title?: unknown; songIds?: unknown };
    if (typeof body.projectId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(body.projectId) || typeof body.title !== "string" || !body.title.trim() || body.title.length > 160 || !Array.isArray(body.songIds) || body.songIds.length !== 2 || body.songIds.some((id: unknown) => typeof id !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(id))) return Response.json({ error: "ERR_ALBUM_INPUT" }, { status: 400 });
    const database = openStudioCatalogueDatabase();
    try {
      const mediaPath = resolve(/* turbopackIgnore: true */ process.cwd(), "../..", process.env.STUDIO_MEDIA_PATH ?? "private/studio-media");
      const result = createStudioAlbumDraft(database, new StudioMediaStore(mediaPath), { studioId, projectId: body.projectId, title: body.title.trim(), songIds: body.songIds as [string, string] });
      return Response.json(result, { status: 201, headers: { "cache-control": "no-store" } });
    } finally { database.close(); }
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERR_ALBUM_CREATE";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 409 });
  }
}
