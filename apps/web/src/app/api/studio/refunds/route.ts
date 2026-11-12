import { currentUser, getAppDatabase, requireOrigin } from "@/server/runtime";
import { studioContractClient } from "@/server/studio-catalogue";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const user = await currentUser();
    if (!user) return Response.json({ error: "ERR_UNAUTHORIZED" }, { status: 401 });
    const chain = studioContractClient();
    if (await chain.admin() !== user.accountId) return Response.json({ error: "ERR_FORBIDDEN" }, { status: 403 });
    const body = await request.json() as { paymentId?: unknown };
    if (typeof body.paymentId !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(body.paymentId)) return Response.json({ error: "ERR_INPUT" }, { status: 400 });
    const local = getAppDatabase().prepare("SELECT payment_id, buyer_account_id, amount_yocto FROM studio_orders WHERE payment_id = ?").get(body.paymentId) as { payment_id: string; buyer_account_id: string; amount_yocto: string } | undefined;
    const payment = await chain.payment(body.paymentId);
    if (!local || !payment || payment.status !== "finalized" || payment.allocated_yocto !== "0" || payment.buyer_id !== local.buyer_account_id || payment.gross_yocto !== local.amount_yocto) throw new Error("REFUND_NOT_AVAILABLE");
    return Response.json({ transactionRequest: { networkId: "testnet", receiverId: chain.contractId, methodName: "refund_payment", args: { payment_id: body.paymentId }, depositYocto: "1" }, policy: "Administrator correction before creator allocation; final receipt determines refund success." });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "REFUND_REQUEST_FAILED" }, { status: 409 }); }
}
