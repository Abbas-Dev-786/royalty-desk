import { requireMembership } from "@/server/authorization";
import { requireOrigin } from "@/server/runtime";

type Action = "approve_settlement" | "dispute_settlement" | "clear_dispute" | "approve_cancellation" | "finalize_settlement" | "fund_settlement";

export async function POST(request: Request, context: { params: Promise<{ releaseId: string }> }): Promise<Response> {
  try {
    requireOrigin(request);
    const { releaseId } = await context.params;
    const body = await request.json() as { action?: unknown; period?: unknown; digest?: unknown; reasonHash?: unknown; amountYocto?: unknown };
    if (typeof body.action !== "string" || !["approve_settlement", "dispute_settlement", "clear_dispute", "approve_cancellation", "finalize_settlement", "fund_settlement"].includes(body.action) || typeof body.period !== "string") return Response.json({ error: "ERR_INPUT" }, { status: 400 });
    const action = body.action as Action;
    const role = action === "fund_settlement" ? ["funder"] as const : action === "finalize_settlement" ? ["administrator", "owner", "funder"] as const : ["owner"] as const;
    const { accountId } = await requireMembership(releaseId, role);
    if (action === "approve_settlement" && typeof body.digest !== "string") return Response.json({ error: "ERR_DIGEST" }, { status: 400 });
    if (action === "dispute_settlement" && typeof body.reasonHash !== "string") return Response.json({ error: "ERR_REASON" }, { status: 400 });
    if (action === "fund_settlement" && (typeof body.amountYocto !== "string" || !/^\d+$/.test(body.amountYocto))) return Response.json({ error: "ERR_AMOUNT" }, { status: 400 });
    const args = action === "approve_settlement" ? { release_id: releaseId, period: body.period, digest: body.digest } : action === "dispute_settlement" ? { release_id: releaseId, period: body.period, reason_hash: body.reasonHash } : { release_id: releaseId, period: body.period };
    return Response.json({ requestedBy: accountId, transactionRequest: { networkId: "testnet", receiverId: process.env.NEXT_PUBLIC_CONTRACT_ID ?? "", methodName: action, args, depositYocto: action === "fund_settlement" ? body.amountYocto : "0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "settlement_action_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : 403 });
  }
}
