import { currentUser, getAppDatabase, requireOrigin } from "@/server/runtime";
import { studioContractClient } from "@/server/studio-catalogue";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const user = await currentUser();
    if (!user) return Response.json({ error: "ERR_UNAUTHORIZED" }, { status: 401 });
    const chain = studioContractClient();
    const body = await request.json() as { paymentId?: unknown };
    if (typeof body.paymentId !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(body.paymentId)) return Response.json({ error: "ERR_INPUT" }, { status: 400 });
    const local = getAppDatabase().prepare("SELECT payment_id, buyer_account_id, amount_yocto FROM studio_orders WHERE payment_id = ?").get(body.paymentId) as { payment_id: string; buyer_account_id: string; amount_yocto: string } | undefined;
    const payment = await chain.payment(body.paymentId);
    if (!local || !payment || payment.status !== "finalized" || payment.allocated_yocto !== "0" || payment.buyer_id !== local.buyer_account_id || payment.gross_yocto !== local.amount_yocto) throw new Error("REFUND_NOT_AVAILABLE");
    const guardian = await chain.guardian();
    if (user.accountId !== guardian && (user.accountId !== payment.buyer_id || (await chain.release(payment.work_id, payment.version))?.published !== false)) return Response.json({ error: "ERR_FORBIDDEN" }, { status: 403 });
    return Response.json({ transactionRequest: { networkId: "testnet", receiverId: chain.contractId, methodName: "refund_payment", args: { payment_id: body.paymentId }, depositYocto: "1" }, policy: "Guardian correction or buyer recovery for an unpublished release before creator allocation; the final receipt decides the refund." });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "REFUND_REQUEST_FAILED" }, { status: 409 }); }
}
