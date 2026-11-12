import { getChainOperation } from "@royaltydesk/persistence";
import { requireOperationSigner } from "@/server/operation-auth";
import { getAppDatabase } from "@/server/runtime";
import { requireOrigin } from "@/server/runtime";
import { updateChainOperation } from "@royaltydesk/persistence";
import { JsonRpcProvider } from "near-api-js";
import { canonicalJson, type CanonicalValue } from "@royaltydesk/domain";

export async function GET(_: Request, context: { params: Promise<{ operationId: string }> }): Promise<Response> {
  try {
    const { operationId } = await context.params;
    const operation = getChainOperation(getAppDatabase(), operationId);
    if (!operation) return Response.json({ error: "ERR_NOT_FOUND" }, { status: 404 });
    const accountId = await requireOperationSigner(operation.releaseId, operation.operationType);
    const intent = JSON.parse(operation.intentJson) as { signerId?: unknown; transaction?: { receiverId?: unknown; methodName?: unknown; args?: unknown; depositYocto?: unknown } };
    if (intent.signerId !== accountId) return Response.json({ error: "ERR_FORBIDDEN" }, { status: 403 });
    if (operation.transactionHash && operation.signedIdentity === null && ["unknown", "reconciling"].includes(operation.status)) {
      try {
        const receipt = await new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com" }).viewTransactionStatus({ txHash: operation.transactionHash, accountId, waitUntil: "FINAL" });
        const matches = receipt.transaction.hash === operation.transactionHash && receipt.transaction.signer_id === accountId && receipt.transaction.receiver_id === intent.transaction?.receiverId && receipt.transaction.actions.length === 1 && receipt.transaction.actions.some((action) => {
          if (typeof action !== "object" || action === null || !("FunctionCall" in action) || typeof action.FunctionCall.args !== "string") return false;
          try {
            const args = JSON.parse(Buffer.from(action.FunctionCall.args, "base64").toString("utf8")) as CanonicalValue;
            return action.FunctionCall.method_name === intent.transaction?.methodName && action.FunctionCall.deposit === intent.transaction?.depositYocto && canonicalJson(args) === canonicalJson(intent.transaction.args as CanonicalValue);
          } catch { return false; }
        });
        if (!matches) return Response.json({ error: "ERR_OPERATION_RECEIPT_MISMATCH" }, { status: 409 });
        const transfer = operation.operationType === "execute_payout" || operation.operationType === "withdraw_refundable";
        const finalFailure = typeof receipt.status === "object" && receipt.status !== null && "Failure" in receipt.status;
        const finalSuccess = typeof receipt.status === "object" && receipt.status !== null && ("SuccessValue" in receipt.status || "SuccessReceiptId" in receipt.status);
        if (!transfer && (finalFailure || finalSuccess)) updateChainOperation(getAppDatabase(), operation.id, { status: finalFailure ? "failure" : "success" });
      } catch { /* Unknown RPC outcome remains unresolved. */ }
    }
    const refreshed = getChainOperation(getAppDatabase(), operation.id) ?? operation;
    return Response.json({ id: refreshed.id, status: refreshed.status, transactionHash: refreshed.transactionHash, updatedAtMs: refreshed.updatedAtMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "operation_read_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : 403 });
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ operationId: string }> }): Promise<Response> {
  try {
    requireOrigin(request);
    const { operationId } = await context.params;
    const database = getAppDatabase();
    const operation = getChainOperation(database, operationId);
    if (!operation) return Response.json({ error: "ERR_NOT_FOUND" }, { status: 404 });
    const accountId = await requireOperationSigner(operation.releaseId, operation.operationType);
    const intent = JSON.parse(operation.intentJson) as { signerId?: unknown };
    if (intent.signerId !== accountId) return Response.json({ error: "ERR_FORBIDDEN" }, { status: 403 });
    const body = await request.json() as { transactionHash?: unknown; state?: unknown };
    if (operation.status !== "requested" && operation.status !== "unknown" && operation.status !== "reconciling") return Response.json({ error: "ERR_OPERATION_STATE" }, { status: 409 });
    if (body.state !== "submitted" && body.state !== "unknown") return Response.json({ error: "ERR_INPUT" }, { status: 400 });
    if (body.transactionHash !== undefined && (typeof body.transactionHash !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(body.transactionHash))) return Response.json({ error: "ERR_TRANSACTION_HASH" }, { status: 400 });
    if (operation.transactionHash && body.transactionHash && operation.transactionHash !== body.transactionHash) return Response.json({ error: "ERR_TRANSACTION_HASH_CONFLICT" }, { status: 409 });
    const row = updateChainOperation(database, operationId, { status: body.transactionHash ? "reconciling" : "unknown", ...(typeof body.transactionHash === "string" ? { transactionHash: body.transactionHash } : {}) });
    return Response.json({ id: row?.id, status: row?.status, transactionHash: row?.transactionHash });
  } catch (error) {
    const message = error instanceof Error ? error.message : "operation_update_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 400 });
  }
}
