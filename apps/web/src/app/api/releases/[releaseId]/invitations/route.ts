import { JsonRpcProvider } from "near-api-js";
import { getMembership, upsertMembership } from "@royaltydesk/persistence";
import { requireMembership } from "@/server/authorization";
import { requireOrigin, currentUser, getAppDatabase } from "@/server/runtime";

interface ReleaseView { readonly administrator_id: string; readonly funder_id: string; readonly invited_owner_ids: readonly string[]; }

export async function POST(request: Request, context: { params: Promise<{ releaseId: string }> }): Promise<Response> {
  try {
    requireOrigin(request);
    const { releaseId } = await context.params;
    const { accountId: administratorId } = await requireMembership(releaseId, ["administrator"]);
    const body = await request.json() as { accountId?: unknown; role?: unknown };
    if (typeof body.accountId !== "string" || (body.role !== "owner" && body.role !== "funder")) return Response.json({ error: "ERR_INPUT" }, { status: 400 });
    const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID;
    if (!contractId?.endsWith(".testnet")) return Response.json({ error: "ERR_CHAIN_CONFIG" }, { status: 503 });
    const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com" });
    const release = await provider.callFunction<ReleaseView>({ contractId, method: "get_release", args: { release_id: releaseId } });
    if (!release) return Response.json({ error: "ERR_RELEASE_NOT_ON_CHAIN" }, { status: 404 });
    if (release.administrator_id !== administratorId) return Response.json({ error: "ERR_CHAIN_ADMINISTRATOR" }, { status: 403 });
    if (body.role === "owner" ? !release.invited_owner_ids.includes(body.accountId) : release.funder_id !== body.accountId) return Response.json({ error: "ERR_INVITATIONS_FIXED_ON_CHAIN" }, { status: 409 });
    const database = getAppDatabase();
    const accepted = getMembership(database, releaseId, body.accountId, [body.role], "accepted") !== undefined;
    const membership = upsertMembership(database, { releaseId, accountId: body.accountId, role: body.role, status: accepted ? "accepted" : "invited" });
    return Response.json(membership, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "invite_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : 403 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ releaseId: string }> }): Promise<Response> {
  try {
    requireOrigin(request);
    const { releaseId } = await context.params;
    const user = await currentUser();
    if (!user) return Response.json({ error: "ERR_UNAUTHORIZED" }, { status: 401 });
    const existing = getMembership(getAppDatabase(), releaseId, user.accountId, ["owner"], "invited");
    if (!existing || existing.status !== "invited") return Response.json({ error: "ERR_INVITATION" }, { status: 403 });
    return Response.json({ accountId: user.accountId, transactionRequest: { networkId: "testnet", receiverId: process.env.NEXT_PUBLIC_CONTRACT_ID ?? "", methodName: "accept_membership", args: { release_id: releaseId }, depositYocto: "0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "accept_failed";
    return Response.json({ error: message }, { status: message === "ERR_CSRF_ORIGIN" ? 403 : 400 });
  }
}
