import { JsonRpcProvider } from "near-api-js";
import { getMembership, upsertMembership } from "@royaltydesk/persistence";
import { requireOrigin, currentUser, getAppDatabase } from "@/server/runtime";

interface ReleaseView { readonly accepted_owner_ids?: readonly string[]; }

export async function POST(request: Request, context: { params: Promise<{ releaseId: string }> }): Promise<Response> {
  try {
    requireOrigin(request);
    const { releaseId } = await context.params;
    const user = await currentUser();
    if (!user) return Response.json({ error: "ERR_UNAUTHORIZED" }, { status: 401 });
    const local = getMembership(getAppDatabase(), releaseId, user.accountId, ["owner"], "invited");
    if (!local || local.status !== "invited") return Response.json({ error: "ERR_INVITATION" }, { status: 403 });
    const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID;
    if (!contractId || !contractId.endsWith(".testnet")) return Response.json({ error: "ERR_CHAIN_CONFIG" }, { status: 503 });
    const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com" });
    const release = await provider.callFunction<ReleaseView>({ contractId, method: "get_release", args: { release_id: releaseId } });
    if (!release?.accepted_owner_ids?.includes(user.accountId)) return Response.json({ error: "ERR_CHAIN_MEMBERSHIP_PENDING" }, { status: 409 });
    const membership = upsertMembership(getAppDatabase(), { releaseId, accountId: user.accountId, role: local.role, status: "accepted" });
    return Response.json({ membership, confirmedFrom: contractId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "membership_confirmation_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : 409 });
  }
}
