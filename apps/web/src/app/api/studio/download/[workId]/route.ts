import { currentUser } from "@/server/runtime";
import { hasStudioDownloadEntitlement } from "@/server/studio-entitlement";
import { listCatalogue, publishedMedia } from "@/server/studio-catalogue";

export const dynamic = "force-dynamic";
export async function GET(request: Request, context: { params: Promise<{ workId: string }> }): Promise<Response> {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "ERR_UNAUTHORIZED" }, { status: 401 });
    const workId = (await context.params).workId;
    const version = Number(new URL(request.url).searchParams.get("version"));
    if (!Number.isSafeInteger(version) || version < 1) return Response.json({ error: "ERR_VERSION" }, { status: 400 });
    if (!await hasStudioDownloadEntitlement(user.accountId, workId, version)) return Response.json({ error: "PURCHASE_REQUIRED" }, { status: 403 });
    const song = (await listCatalogue()).find((item) => item.kind === "song" && item.workId === workId && item.version === version);
    if (!song) return Response.json({ error: "MEDIA_NOT_PUBLISHED" }, { status: 404 });
    const media = await publishedMedia(song.assetHash);
    if (!media || media.mimeType !== "audio/mpeg") return Response.json({ error: "MEDIA_UNAVAILABLE" }, { status: 404 });
    return new Response(Buffer.from(media.bytes), { headers: { "content-type": "audio/mpeg", "content-length": String(media.bytes.byteLength), "content-disposition": `attachment; filename="${workId}-v${version}.mp3"`, "cache-control": "private, no-store", "x-content-type-options": "nosniff" } });
  } catch { return Response.json({ error: "DOWNLOAD_UNAVAILABLE" }, { status: 503 }); }
}
