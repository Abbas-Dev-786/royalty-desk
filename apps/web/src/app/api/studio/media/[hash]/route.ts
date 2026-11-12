import { publishedMedia } from "@/server/studio-catalogue";
import { parseSingleByteRange } from "@/server/media-range";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ hash: string }> }): Promise<Response> {
  try {
    const { hash } = await context.params;
    const media = await publishedMedia(hash);
    if (!media) return Response.json({ error: "MEDIA_NOT_PUBLISHED" }, { status: 404, headers: { "cache-control": "no-store" } });
    const size = media.bytes.byteLength;
    let range;
    try { range = parseSingleByteRange(request.headers.get("range"), size); }
    catch { return new Response(null, { status: 416, headers: { "content-range": `bytes */${size}`, "accept-ranges": "bytes", "cache-control": "no-store" } }); }
    const bytes = range ? media.bytes.slice(range.start, range.end + 1) : media.bytes;
    return new Response(Buffer.from(bytes), { status: range ? 206 : 200, headers: { "content-type": media.mimeType, "content-length": String(bytes.byteLength), "accept-ranges": "bytes", "cache-control": "no-store", "x-content-type-options": "nosniff", "content-security-policy": media.mimeType === "image/svg+xml" ? "sandbox" : "default-src 'none'", ...(range ? { "content-range": `bytes ${range.start}-${range.end}/${size}` } : {}) } });
  } catch (error) {
    console.error("STUDIO_MEDIA_UNAVAILABLE", error);
    return Response.json({ error: "MEDIA_UNAVAILABLE" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
