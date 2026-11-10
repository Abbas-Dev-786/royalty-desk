import { createChainOperation, getChainOperation } from "@royaltydesk/persistence";
import { requireMembership } from "@/server/authorization";
import { getAppDatabase, requireOrigin } from "@/server/runtime";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const body = await request.json() as { id?: unknown; logicalKey?: unknown; releaseId?: unknown; operationType?: unknown; intentJson?: unknown };
    if (typeof body.id !== "string" || typeof body.logicalKey !== "string" || typeof body.releaseId !== "string" || typeof body.operationType !== "string" || typeof body.intentJson !== "string") return Response.json({ error: "ERR_INPUT" }, { status: 400 });
    await requireMembership(body.releaseId);
    const existing = getChainOperation(getAppDatabase(), body.id);
    if (existing && (existing.logicalKey !== body.logicalKey || existing.releaseId !== body.releaseId || existing.operationType !== body.operationType || existing.intentJson !== body.intentJson)) return Response.json({ error: "ERR_OPERATION_ID_REUSE" }, { status: 409 });
    const operation = existing ?? createChainOperation(getAppDatabase(), { id: body.id, logicalKey: body.logicalKey, releaseId: body.releaseId, operationType: body.operationType, intentJson: body.intentJson });
    return Response.json(operation, { status: existing ? 200 : 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "operation_request_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 400 });
  }
}
