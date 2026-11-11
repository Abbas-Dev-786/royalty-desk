import { JsonRpcProvider } from "near-api-js";
import { getMembership, upsertMembership } from "@royaltydesk/persistence";
import { currentUser, getAppDatabase, requireOrigin } from "@/server/runtime";

interface ReleaseView { readonly administrator_id: string; readonly funder_id: string; readonly invited_owner_ids: readonly string[]; }

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const user = await currentUser();
    if (!user) return Response.json({ error: "ERR_UNAUTHORIZED" }, { status: 401 });
    const body = await request.json() as { releaseId?: unknown };
    if (typeof body.releaseId !== "string" || body.releaseId.length > 128) return Response.json({ error: "ERR_RELEASE_ID" }, { status: 400 });
    const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID;
    if (!contractId?.endsWith(".testnet")) return Response.json({ error: "ERR_CHAIN_CONFIG" }, { status: 503 });
    const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com" });
    const release = await provider.callFunction<ReleaseView>({ contractId, method: "get_release", args: { release_id: body.releaseId } });
    if (!release || release.administrator_id !== user.accountId) return Response.json({ error: "ERR_CHAIN_ADMINISTRATOR" }, { status: 403 });
    const database = getAppDatabase();
    database.exec("BEGIN IMMEDIATE");
    try {
      const existing = database.prepare("SELECT account_id FROM release_memberships WHERE release_id = ? AND role = 'administrator' LIMIT 1").get(body.releaseId) as { account_id?: string } | undefined;
      if (existing && existing.account_id !== user.accountId) throw new Error("ERR_RELEASE_EXISTS");
      upsertMembership(database, { releaseId: body.releaseId, accountId: user.accountId, role: "administrator", status: "accepted" });
      upsertMembership(database, { releaseId: body.releaseId, accountId: release.funder_id, role: "funder", status: "accepted" });
      for (const ownerId of release.invited_owner_ids) {
        const ownerAccepted = getMembership(database, body.releaseId, ownerId, ["owner"], "accepted") !== undefined;
        upsertMembership(database, { releaseId: body.releaseId, accountId: ownerId, role: "owner", status: ownerAccepted ? "accepted" : "invited" });
      }
      database.exec("COMMIT");
    } catch (error) { if (database.isTransaction) database.exec("ROLLBACK"); throw error; }
    return Response.json({ releaseId: body.releaseId, confirmedFrom: contractId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "release_confirmation_failed";
    if (message.includes("ERR_RELEASE_NOT_FOUND")) return Response.json({ error: "ERR_RELEASE_NOT_ON_CHAIN" }, { status: 404 });
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : 409 });
  }
}
