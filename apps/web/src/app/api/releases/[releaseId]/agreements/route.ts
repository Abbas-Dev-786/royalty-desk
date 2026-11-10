import { freezeAgreement } from "@royaltydesk/persistence";
import { JsonRpcProvider } from "near-api-js";
import { parseAgreementRules } from "@royaltydesk/domain";
import { requireMembership } from "@/server/authorization";
import { getAppDatabase, requireOrigin } from "@/server/runtime";

export async function POST(request: Request, context: { params: Promise<{ releaseId: string }> }): Promise<Response> {
  try {
    requireOrigin(request);
    const { releaseId } = await context.params;
    const { accountId } = await requireMembership(releaseId, ["administrator"]);
    const body = await request.json() as { version?: unknown; rules?: unknown };
    if (typeof body.version !== "string" || body.version.length > 32 || typeof body.rules !== "object" || body.rules === null) return Response.json({ error: "ERR_INPUT" }, { status: 400 });
    const rules = parseAgreementRules(body.rules);
    if (rules.releaseId !== releaseId) return Response.json({ error: "ERR_RELEASE_MISMATCH" }, { status: 400 });
    const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID;
    if (!contractId?.endsWith(".testnet")) return Response.json({ error: "ERR_CHAIN_CONFIG" }, { status: 503 });
    const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com" });
    const release = await provider.callFunction<{ administrator_id: string; recording_id: string; agreements: readonly { version: string | number; document_hash: string; rules_hash: string; approval_digest: string }[] }>({ contractId, method: "get_release", args: { release_id: releaseId } });
    if (!release || release.administrator_id !== accountId || release.recording_id !== rules.recordingId) return Response.json({ error: "ERR_CHAIN_AUTHORITY" }, { status: 409 });
    const nextVersion = String(release.agreements.length + 1);
    if (body.version !== nextVersion) return Response.json({ error: "ERR_AGREEMENT_VERSION_STALE", nextVersion }, { status: 409 });
    const result = freezeAgreement(getAppDatabase(), { rules, version: body.version, createdBy: accountId, networkId: "testnet", contractId });
    return Response.json({ ...result, transactionRequest: { networkId: "testnet", receiverId: process.env.NEXT_PUBLIC_CONTRACT_ID ?? "", methodName: "freeze_agreement", args: { release_id: releaseId, input: { recording_id: rules.recordingId, participants: rules.participants.map((participant) => ({ owner_id: participant.ownerId, basis_points: participant.basisPoints })), recoupment: rules.recoupment ? { code: rules.recoupment.code, beneficiary_id: rules.recoupment.beneficiaryId, cap_yocto: rules.recoupment.capYocto } : null, effective_period: rules.effectivePeriod, document_hash: result.documentHash } }, depositYocto: "0" } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "agreement_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 400 });
  }
}

export async function GET(request: Request, context: { params: Promise<{ releaseId: string }> }): Promise<Response> {
  try {
    const { releaseId } = await context.params;
    await requireMembership(releaseId);
    const version = new URL(request.url).searchParams.get("version");
    if (!version) return Response.json({ error: "ERR_VERSION" }, { status: 400 });
    const row = getAppDatabase().prepare(`SELECT document_bytes, document_hash FROM agreement_drafts WHERE release_id = ? AND version = ? AND status IN ('frozen','active')`).get(releaseId, version) as { document_bytes?: Uint8Array; document_hash?: string } | undefined;
    if (!row || !row.document_bytes || typeof row.document_hash !== "string") return Response.json({ error: "ERR_NOT_FOUND" }, { status: 404 });
    return new Response(new TextDecoder().decode(row.document_bytes), { headers: { "content-type": "text/markdown; charset=utf-8", "content-disposition": `attachment; filename="agreement-${releaseId}-${version}.md"`, "x-document-hash": row.document_hash, "cache-control": "private, no-store" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "agreement_read_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : 403 });
  }
}
