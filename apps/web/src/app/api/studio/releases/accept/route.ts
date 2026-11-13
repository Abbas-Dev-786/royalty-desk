import { requireOrigin } from "@/server/runtime";
import { requireStudioAdmin } from "@/server/studio-admin";
import { openStudioCatalogueDatabase } from "@/server/studio-catalogue";

export const maxDuration = 300;

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const { studioId } = await requireStudioAdmin();
    const body = await request.json() as { workId?: unknown; version?: unknown };
    if (typeof body.workId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(body.workId) || !Number.isSafeInteger(body.version) || Number(body.version) < 1) return Response.json({ error: "ERR_RELEASE_INPUT" }, { status: 400 });
    const database = openStudioCatalogueDatabase();
    try { if (!database.prepare("SELECT 1 FROM studio_works w JOIN studio_work_versions v ON v.work_id = w.id WHERE w.id = ? AND v.version = ? AND v.state = 'accepted' AND w.studio_id = ?").get(body.workId, Number(body.version), studioId)) return Response.json({ error: "ERR_RELEASE_SCOPE" }, { status: 404 }); }
    finally { database.close(); }
    const token = process.env.STUDIO_WORKER_TOKEN;
    if (!token || token.length < 32) return Response.json({ error: "ERR_WORKER_NOT_CONFIGURED" }, { status: 503 });
    const workerUrl = process.env.STUDIO_WORKER_URL ?? "http://127.0.0.1:3101";
    const upstream = await fetch(`${workerUrl}/studio/releases/${encodeURIComponent(body.workId)}/accept`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ version: body.version }), cache: "no-store" });
    const result = await upstream.json() as { error?: string; acceptedAccounts?: readonly string[] };
    return Response.json(result, { status: upstream.ok ? 200 : 409, headers: { "cache-control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERR_SPLIT_ACCEPTANCE";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 409 });
  }
}
