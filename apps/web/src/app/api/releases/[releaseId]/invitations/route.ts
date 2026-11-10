import { getMembership, upsertMembership } from "@royaltydesk/persistence";
import { requireMembership } from "@/server/authorization";
import { requireOrigin, currentUser, getAppDatabase } from "@/server/runtime";

export async function POST(request: Request, context: { params: Promise<{ releaseId: string }> }): Promise<Response> {
  try {
    requireOrigin(request);
    const { releaseId } = await context.params;
    await requireMembership(releaseId, ["administrator"]);
    const body = await request.json() as { accountId?: unknown; role?: unknown };
    if (typeof body.accountId !== "string" || (body.role !== "owner" && body.role !== "funder")) return Response.json({ error: "ERR_INPUT" }, { status: 400 });
    const membership = upsertMembership(getAppDatabase(), { releaseId, accountId: body.accountId, role: body.role, status: "invited" });
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
    const existing = getMembership(getAppDatabase(), releaseId, user.accountId, ["owner", "funder"], "invited");
    if (!existing || existing.status !== "invited") return Response.json({ error: "ERR_INVITATION" }, { status: 403 });
    return Response.json({ accountId: user.accountId, transactionRequest: { networkId: "testnet", receiverId: process.env.NEXT_PUBLIC_CONTRACT_ID ?? "", methodName: "accept_membership", args: { release_id: releaseId }, depositYocto: "0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "accept_failed";
    return Response.json({ error: message }, { status: message === "ERR_CSRF_ORIGIN" ? 403 : 400 });
  }
}
