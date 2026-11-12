import { createChainOperation, getChainOperation } from "@royaltydesk/persistence";
import { requireMembership } from "@/server/authorization";
import { currentUser, getAppDatabase, requireOrigin } from "@/server/runtime";
import { requireOperationSigner } from "@/server/operation-auth";

export async function GET(request: Request): Promise<Response> {
  try {
    const releaseId = new URL(request.url).searchParams.get("releaseId");
    const user = await currentUser();
    if (!user) return Response.json({ error: "ERR_UNAUTHORIZED" }, { status: 401 });
    if (!releaseId || releaseId.length > 128) return Response.json({ error: "ERR_RELEASE_ID" }, { status: 400 });
    await requireMembership(releaseId);
    const rows = getAppDatabase().prepare("SELECT id, operation_type, status, transaction_hash, intent_json, updated_at_ms FROM chain_operations WHERE release_id = ? ORDER BY updated_at_ms DESC LIMIT 50").all(releaseId) as unknown as readonly { id: string; operation_type: string; status: string; transaction_hash: string | null; intent_json: string; updated_at_ms: number }[];
    return Response.json(rows.filter((row) => {
      try { return (JSON.parse(row.intent_json) as { signerId?: unknown }).signerId === user.accountId; } catch { return false; }
    }).map((row) => ({ id: row.id, operationType: row.operation_type, status: row.status, transactionHash: row.transaction_hash, updatedAtMs: row.updated_at_ms })));
  } catch (error) {
    const message = error instanceof Error ? error.message : "operation_list_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 400 });
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const body = await request.json() as { id?: unknown; logicalKey?: unknown; releaseId?: unknown; operationType?: unknown; intentJson?: unknown };
    if (typeof body.id !== "string" || typeof body.logicalKey !== "string" || typeof body.releaseId !== "string" || typeof body.operationType !== "string" || typeof body.intentJson !== "string") return Response.json({ error: "ERR_INPUT" }, { status: 400 });
    const user = await currentUser();
    if (!user) return Response.json({ error: "ERR_UNAUTHORIZED" }, { status: 401 });
    const intent = JSON.parse(body.intentJson) as { signerId?: unknown; transaction?: { receiverId?: unknown; methodName?: unknown; args?: { release_id?: unknown }; depositYocto?: unknown } };
    if (intent.signerId !== user.accountId || intent.transaction?.methodName !== body.operationType || intent.transaction?.args?.release_id !== body.releaseId || intent.transaction?.receiverId !== process.env.NEXT_PUBLIC_CONTRACT_ID || typeof intent.transaction.depositYocto !== "string" || !/^\d+$/.test(intent.transaction.depositYocto)) return Response.json({ error: "ERR_OPERATION_INTENT" }, { status: 400 });
    await requireOperationSigner(body.releaseId, body.operationType);
    const database = getAppDatabase();
    const existing = getChainOperation(database, body.id);
    if (existing && (existing.logicalKey !== body.logicalKey || existing.releaseId !== body.releaseId || existing.operationType !== body.operationType || existing.intentJson !== body.intentJson)) return Response.json({ error: "ERR_OPERATION_ID_REUSE" }, { status: 409 });
    if (!existing) {
      const pending = database.prepare("SELECT id FROM chain_operations WHERE release_id = ? AND operation_type = ? AND intent_json = ? AND status IN ('requested','signed','broadcast','unknown','reconciling') LIMIT 1").get(body.releaseId, body.operationType, body.intentJson) as { id: string } | undefined;
      if (pending) return Response.json({ error: "ERR_OPERATION_UNRESOLVED", operationId: pending.id }, { status: 409 });
    }
    const operation = existing ?? createChainOperation(database, { id: body.id, logicalKey: body.logicalKey, releaseId: body.releaseId, operationType: body.operationType, intentJson: body.intentJson });
    return Response.json({ id: operation.id, status: operation.status, transactionHash: operation.transactionHash }, { status: existing ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "operation_request_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 400 });
  }
}
