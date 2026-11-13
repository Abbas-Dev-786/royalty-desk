import { JsonRpcProvider } from "near-api-js";
import { currentUser, getAppDatabase, requireOrigin } from "@/server/runtime";
import { studioContractClient } from "@/server/studio-catalogue";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const user = await currentUser();
    if (!user) return Response.json({ error: "ERR_UNAUTHORIZED" }, { status: 401 });
    const chain = studioContractClient();
    const body = await request.json() as { paymentId?: unknown; transactionHash?: unknown };
    if (typeof body.paymentId !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(body.paymentId) || typeof body.transactionHash !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(body.transactionHash)) return Response.json({ error: "ERR_INPUT" }, { status: 400 });
    const receipt = await new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" }).viewTransactionStatus({ txHash: body.transactionHash, accountId: user.accountId, waitUntil: "FINAL" });
    if (receipt.transaction.hash !== body.transactionHash || receipt.transaction.signer_id !== user.accountId || receipt.transaction.receiver_id !== chain.contractId || receipt.transaction.actions.length !== 1 || typeof receipt.status !== "object" || !("SuccessValue" in receipt.status || "SuccessReceiptId" in receipt.status)) throw new Error("REFUND_RECEIPT_INVALID");
    const action = receipt.transaction.actions[0];
    if (!action || typeof action !== "object" || !("FunctionCall" in action) || action.FunctionCall.method_name !== "refund_payment" || action.FunctionCall.deposit !== "1") throw new Error("REFUND_ACTION_MISMATCH");
    const args = JSON.parse(Buffer.from(action.FunctionCall.args, "base64").toString("utf8")) as { payment_id?: unknown };
    if (args.payment_id !== body.paymentId) throw new Error("REFUND_ARGUMENT_MISMATCH");
    const payment = await chain.payment(body.paymentId);
    if (!payment || payment.status !== "refunded" || (user.accountId !== payment.buyer_id && user.accountId !== await chain.guardian())) throw new Error("REFUND_NOT_FINAL");
    getAppDatabase().prepare("UPDATE studio_orders SET status = 'refunded', updated_at_ms = ? WHERE payment_id = ? AND buyer_account_id = ? AND amount_yocto = ?").run(Date.now(), body.paymentId, payment.buyer_id, payment.gross_yocto);
    return Response.json({ paymentId: body.paymentId, status: "refunded", transactionHash: body.transactionHash });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "REFUND_CONFIRM_FAILED" }, { status: 409 }); }
}
