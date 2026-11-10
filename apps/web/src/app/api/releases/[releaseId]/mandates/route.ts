import { requireMembership } from "@/server/authorization";
import { requireOrigin } from "@/server/runtime";

const actions = new Set(["approve_settlement", "dispute_settlement", "execute_payout"]);

export async function POST(request: Request, context: { params: Promise<{ releaseId: string }> }): Promise<Response> {
  try {
    requireOrigin(request);
    const { releaseId } = await context.params;
    const { accountId } = await requireMembership(releaseId, ["owner"]);
    const body = await request.json() as { agentId?: unknown; agreementVersion?: unknown; actions?: unknown; maxGrossYocto?: unknown; expiresAtNanoseconds?: unknown };
    if (typeof body.agentId !== "string" || !/^[a-z0-9._-]+\.testnet$/.test(body.agentId) || body.agentId === accountId || typeof body.agreementVersion !== "string" || !/^\d+$/.test(body.agreementVersion) || !Array.isArray(body.actions) || body.actions.length < 1 || body.actions.length > 3 || !body.actions.every((action) => typeof action === "string" && actions.has(action)) || new Set(body.actions).size !== body.actions.length || typeof body.maxGrossYocto !== "string" || !/^\d+$/.test(body.maxGrossYocto) || typeof body.expiresAtNanoseconds !== "string" || !/^\d+$/.test(body.expiresAtNanoseconds)) return Response.json({ error: "ERR_MANDATE_INPUT" }, { status: 400 });
    return Response.json({ requestedBy: accountId, transactionRequest: { networkId: "testnet", receiverId: process.env.NEXT_PUBLIC_CONTRACT_ID ?? "", methodName: "set_mandate", args: { release_id: releaseId, input: { agent_id: body.agentId, agreement_version: body.agreementVersion, actions: body.actions, max_gross_yocto: body.maxGrossYocto, expires_at_nanoseconds: body.expiresAtNanoseconds } }, depositYocto: "0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "mandate_request_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 400 });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ releaseId: string }> }): Promise<Response> {
  try {
    requireOrigin(request);
    const { releaseId } = await context.params;
    const { accountId } = await requireMembership(releaseId, ["owner"]);
    return Response.json({ requestedBy: accountId, transactionRequest: { networkId: "testnet", receiverId: process.env.NEXT_PUBLIC_CONTRACT_ID ?? "", methodName: "revoke_mandate", args: { release_id: releaseId }, depositYocto: "0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "mandate_revocation_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 400 });
  }
}
