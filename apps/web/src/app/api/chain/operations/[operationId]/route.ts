import { getChainOperation } from "@royaltydesk/persistence";
import { requireMembership } from "@/server/authorization";
import { getAppDatabase } from "@/server/runtime";

export async function GET(_: Request, context: { params: Promise<{ operationId: string }> }): Promise<Response> {
  try {
    const { operationId } = await context.params;
    const operation = getChainOperation(getAppDatabase(), operationId);
    if (!operation) return Response.json({ error: "ERR_NOT_FOUND" }, { status: 404 });
    await requireMembership(operation.releaseId);
    return Response.json(operation);
  } catch (error) {
    const message = error instanceof Error ? error.message : "operation_read_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : 403 });
  }
}
