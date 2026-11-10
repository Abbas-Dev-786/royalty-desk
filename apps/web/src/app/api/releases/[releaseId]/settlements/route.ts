import { allocateEntitlements, parseSettlementCommitment, type ParticipantShare } from "@royaltydesk/domain";
import { requireMembership } from "@/server/authorization";
import { getAppDatabase, requireOrigin } from "@/server/runtime";

interface SettlementRequest {
  readonly commitment?: unknown;
  readonly participants?: unknown;
  readonly remainingRecoupmentYocto?: unknown;
  readonly recoupmentBeneficiaryId?: unknown;
  readonly fundedYocto?: unknown;
  readonly holds?: unknown;
  readonly approvals?: unknown;
}

export async function POST(request: Request, context: { params: Promise<{ releaseId: string }> }): Promise<Response> {
  try {
    requireOrigin(request);
    const { releaseId } = await context.params;
    const { accountId } = await requireMembership(releaseId, ["administrator"]);
    const body = await request.json() as SettlementRequest;
    const commitment = parseSettlementCommitment(body.commitment);
    if (commitment.releaseId !== releaseId) return Response.json({ error: "ERR_RELEASE_MISMATCH" }, { status: 400 });
    if (!Array.isArray(body.participants) || !body.participants.every((value): value is ParticipantShare => typeof value === "object" && value !== null && typeof (value as Record<string, unknown>).ownerId === "string" && typeof (value as Record<string, unknown>).basisPoints === "string")) return Response.json({ error: "ERR_PARTICIPANTS" }, { status: 400 });
    const remaining = typeof body.remainingRecoupmentYocto === "string" ? BigInt(body.remainingRecoupmentYocto) : 0n;
    const beneficiary = typeof body.recoupmentBeneficiaryId === "string" ? body.recoupmentBeneficiaryId : null;
    const allocation = allocateEntitlements({ grossYocto: BigInt(commitment.grossYocto), remainingRecoupmentYocto: remaining, recoupmentBeneficiaryId: beneficiary, participants: body.participants });
    const funded = typeof body.fundedYocto === "string" ? BigInt(body.fundedYocto) : 0n;
    const holds = Array.isArray(body.holds) ? body.holds.filter((value): value is string => typeof value === "string") : [];
    const approvals = Array.isArray(body.approvals) ? body.approvals.filter((value): value is string => typeof value === "string") : [];
    const status = holds.length > 0 ? "Held" : "Review";
    getAppDatabase().prepare(`INSERT INTO settlement_projections(release_id, period, revision, agreement_version, normalized_statement_hash, allocation_preview_hash, status, chain_json, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(release_id, period, revision) DO UPDATE SET status = excluded.status, allocation_preview_hash = excluded.allocation_preview_hash, chain_json = excluded.chain_json, updated_at_ms = excluded.updated_at_ms`).run(releaseId, commitment.period, commitment.revision, commitment.agreementVersion, commitment.normalizedStatementHash, commitment.allocationPreviewHash, status, JSON.stringify({ allocation: allocation.entitlements.map((entry) => ({ ownerId: entry.ownerId, amountYocto: entry.amountYocto.toString() })), fundedYocto: funded.toString(), holds, approvals, createdBy: accountId }), Date.now());
    return Response.json({ releaseId, period: commitment.period, revision: commitment.revision, status, readiness: { funded: funded >= BigInt(commitment.grossYocto), approvals: approvals.length, holds: holds.length, expectedGrossYocto: commitment.grossYocto }, allocation: allocation.entitlements.map((entry) => ({ ownerId: entry.ownerId, amountYocto: entry.amountYocto.toString() })), transactionRequest: { networkId: "testnet", receiverId: process.env.NEXT_PUBLIC_CONTRACT_ID ?? "", methodName: "open_settlement", args: { release_id: releaseId, input: commitment }, depositYocto: "0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "settlement_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 400 });
  }
}
