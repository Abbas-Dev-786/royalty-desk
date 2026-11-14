import { resolve } from "node:path";
import { StudioMediaStore } from "@studio/persistence";
import { parseSingleByteRange } from "@/server/media-range";
import { requireStudioProjectAccess } from "@/server/studio-album-access";
import { openStudioCatalogueDatabase } from "@/server/studio-catalogue";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    const projectId = params.get("projectId");
    const workId = params.get("workId");
    if (!projectId || !workId || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(projectId) || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(workId)) return Response.json({ error: "ERR_ALBUM_MEDIA_INPUT" }, { status: 400 });
    await requireStudioProjectAccess(projectId);
    const database = openStudioCatalogueDatabase();
    let asset: { asset_hash: string; mime_type: string } | undefined;
    try {
      asset = database.prepare("SELECT v.asset_hash, a.mime_type FROM studio_works w JOIN studio_work_versions v ON v.work_id = w.id AND v.version = w.current_version JOIN studio_assets a ON a.hash = v.asset_hash WHERE w.id = ? AND w.project_id = ? AND w.kind IN ('song','album') AND v.state IN ('review','accepted')").get(workId, projectId) as { asset_hash: string; mime_type: string } | undefined;
    } finally { database.close(); }
    if (!asset || !["audio/mpeg", "image/svg+xml"].includes(asset.mime_type)) return Response.json({ error: "ERR_ALBUM_MEDIA_MISSING" }, { status: 404 });
    const bytes = new StudioMediaStore(resolve(/* turbopackIgnore: true */ process.cwd(), "../..", process.env.STUDIO_MEDIA_PATH ?? "private/studio-media")).get(asset.asset_hash);
    let range;
    try { range = asset.mime_type === "audio/mpeg" ? parseSingleByteRange(request.headers.get("range"), bytes.byteLength) : null; }
    catch { return new Response(null, { status: 416, headers: { "content-range": `bytes */${bytes.byteLength}`, "cache-control": "private, no-store" } }); }
    const body = range ? bytes.slice(range.start, range.end + 1) : bytes;
    return new Response(Buffer.from(body), { status: range ? 206 : 200, headers: { "content-type": asset.mime_type, "content-length": String(body.byteLength), "cache-control": "private, no-store", "x-content-type-options": "nosniff", ...(asset.mime_type === "audio/mpeg" ? { "accept-ranges": "bytes" } : {}), ...(range ? { "content-range": `bytes ${range.start}-${range.end}/${bytes.byteLength}` } : {}) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERR_ALBUM_MEDIA";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 503 });
  }
}
