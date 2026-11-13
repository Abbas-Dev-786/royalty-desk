import { createHash } from "node:crypto";
import { quarantineStudioAsset } from "@royaltydesk/persistence";
import { currentUser, requireOrigin } from "@/server/runtime";
import { openStudioCatalogueDatabase, studioContractClient } from "@/server/studio-catalogue";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const user = await currentUser();
    if (!user) return Response.json({ error: "ERR_UNAUTHORIZED" }, { status: 401 });
    const chain = studioContractClient();
    if (await chain.guardian() !== user.accountId) return Response.json({ error: "ERR_FORBIDDEN" }, { status: 403 });
    const body = await request.json() as { workId?: unknown; version?: unknown; reason?: unknown };
    if (typeof body.workId !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(body.workId) || !Number.isSafeInteger(body.version) || typeof body.reason !== "string" || body.reason.trim().length < 5 || body.reason.length > 500) return Response.json({ error: "ERR_INPUT" }, { status: 400 });
    const release = await chain.release(body.workId, Number(body.version));
    if (!release?.published) throw new Error("RELEASE_NOT_PUBLISHED");
    const database = openStudioCatalogueDatabase();
    try { quarantineStudioAsset(database, { assetHash: release.media_hash, studioId: (database.prepare("SELECT studio_id FROM studio_works WHERE id = ?").get(body.workId) as { studio_id: string } | undefined)?.studio_id ?? "", adminAccountId: user.accountId, reasonHash: createHash("sha256").update(body.reason).digest("hex") }); }
    finally { database.close(); }
    return Response.json({ transactionRequest: { networkId: "testnet", receiverId: chain.contractId, methodName: "unpublish_release", args: { work_id: body.workId, version: body.version }, depositYocto: "1" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "TAKEDOWN_REQUEST_FAILED" }, { status: 409 }); }
}
