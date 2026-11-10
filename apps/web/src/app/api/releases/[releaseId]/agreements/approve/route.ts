import { requireMembership } from "@/server/authorization";
import { getAppDatabase, requireOrigin } from "@/server/runtime";

export async function POST(request: Request, context: { params: Promise<{ releaseId: string }> }): Promise<Response> {
  try {
    requireOrigin(request);
    const { releaseId } = await context.params;
    const { accountId } = await requireMembership(releaseId, ["owner"]);
    const body = await request.json() as { version?: unknown; approvalDigest?: unknown };
    if (typeof body.version !== "string" || typeof body.approvalDigest !== "string") return Response.json({ error: "ERR_INPUT" }, { status: 400 });
    const row = getAppDatabase().prepare(`SELECT status, approval_digest FROM agreement_drafts WHERE release_id = ? AND version = ?`).get(releaseId, body.version) as { status?: unknown; approval_digest?: unknown } | undefined;
    if (!row || row.status !== "frozen" || row.approval_digest !== body.approvalDigest) return Response.json({ error: "ERR_STALE_AGREEMENT" }, { status: 409 });
    return Response.json({ requestedBy: accountId, transactionRequest: { networkId: "testnet", receiverId: process.env.NEXT_PUBLIC_CONTRACT_ID ?? "", methodName: "approve_agreement", args: { release_id: releaseId, version: body.version, approval_digest: body.approvalDigest }, depositYocto: "0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "approval_request_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : 403 });
  }
}
