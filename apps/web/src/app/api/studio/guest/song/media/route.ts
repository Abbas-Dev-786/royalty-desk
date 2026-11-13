import { resolve } from "node:path";
import { StudioMediaStore } from "@studio/persistence";
import { parseSingleByteRange } from "@/server/media-range";
import { guestAccountId, guestSong } from "@/server/studio-guest";
import { openStudioCatalogueDatabase } from "@/server/studio-catalogue";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
    const row = guestSong(await guestAccountId(), projectId);
    if (!row?.work_id) return Response.json({ error: "ERR_GUEST_SONG_MISSING" }, { status: 404 });
    const database = openStudioCatalogueDatabase();
    let asset: { asset_hash: string; mime_type: string } | undefined;
    try { asset = database.prepare("SELECT v.asset_hash, a.mime_type FROM studio_work_versions v JOIN studio_assets a ON a.hash = v.asset_hash JOIN studio_works w ON w.id = v.work_id WHERE w.id = ? AND w.project_id = ? AND v.version = 1").get(row.work_id, row.project_id) as { asset_hash: string; mime_type: string } | undefined; }
    finally { database.close(); }
    if (!asset || asset.mime_type !== "audio/mpeg") return Response.json({ error: "ERR_GUEST_MEDIA_MISSING" }, { status: 404 });
    const bytes = new StudioMediaStore(resolve(/* turbopackIgnore: true */ process.cwd(), "../..", process.env.STUDIO_MEDIA_PATH ?? "private/studio-media")).get(asset.asset_hash);
    let range;
    try { range = parseSingleByteRange(request.headers.get("range"), bytes.byteLength); }
    catch { return new Response(null, { status: 416, headers: { "content-range": `bytes */${bytes.byteLength}`, "cache-control": "private, no-store" } }); }
    const body = range ? bytes.slice(range.start, range.end + 1) : bytes;
    return new Response(Buffer.from(body), { status: range ? 206 : 200, headers: { "content-type": "audio/mpeg", "content-length": String(body.byteLength), "accept-ranges": "bytes", "cache-control": "private, no-store", "x-content-type-options": "nosniff", ...(range ? { "content-range": `bytes ${range.start}-${range.end}/${bytes.byteLength}` } : {}) } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERR_GUEST_MEDIA";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : 503 });
  }
}
