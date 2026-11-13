import { resolve } from "node:path";
import { StudioMediaStore } from "@studio/persistence";
import { parseSingleByteRange } from "@/server/media-range";
import { requireStudioAdmin } from "@/server/studio-admin";
import { openStudioCatalogueDatabase } from "@/server/studio-catalogue";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ workId: string }> }): Promise<Response> {
  try {
    const { studioId } = await requireStudioAdmin();
    const { workId } = await context.params;
    const version = Number(new URL(request.url).searchParams.get("version"));
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(workId) || !Number.isSafeInteger(version) || version < 1) return Response.json({ error: "ERR_DRAFT_INPUT" }, { status: 400 });
    const database = openStudioCatalogueDatabase();
    let asset: { asset_hash: string; mime_type: string } | undefined;
    try { asset = database.prepare("SELECT v.asset_hash, a.mime_type FROM studio_work_versions v JOIN studio_works w ON w.id = v.work_id JOIN studio_assets a ON a.hash = v.asset_hash WHERE v.work_id = ? AND v.version = ? AND w.studio_id = ?").get(workId, version, studioId) as { asset_hash: string; mime_type: string } | undefined; }
    finally { database.close(); }
    if (!asset) return Response.json({ error: "ERR_DRAFT_MISSING" }, { status: 404 });
    const mediaPath = resolve(/* turbopackIgnore: true */ process.cwd(), "../..", process.env.STUDIO_MEDIA_PATH ?? "private/studio-media");
    const bytes = new StudioMediaStore(mediaPath).get(asset.asset_hash);
    const size = bytes.byteLength;
    let range;
    try { range = parseSingleByteRange(request.headers.get("range"), size); }
    catch { return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}`, "accept-ranges": "bytes", "cache-control": "no-store" } }); }
    const body = range ? bytes.slice(range.start, range.end + 1) : bytes;
    return new Response(Buffer.from(body), { status: range ? 206 : 200, headers: { "content-type": asset.mime_type, "content-length": String(body.byteLength), "accept-ranges": "bytes", "cache-control": "private, no-store", "x-content-type-options": "nosniff", "content-security-policy": asset.mime_type === "image/svg+xml" ? "sandbox" : "default-src 'none'", ...(range ? { "content-range": `bytes ${range.start}-${range.end}/${size}` } : {}) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERR_DRAFT_MEDIA";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 503 });
  }
}
