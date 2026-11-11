import { JsonRpcProvider } from "near-api-js";
import { allocateEntitlements, canonicalJson, parseAgreementRules, sha256Hex, type CanonicalValue } from "@royaltydesk/domain";
import { requireMembership } from "@/server/authorization";
import { getAppDatabase, requireOrigin } from "@/server/runtime";

interface ChainAgreement {
  readonly version: string;
  readonly rules_hash: string;
  readonly active: boolean;
  readonly recoupment: { readonly code: string; readonly beneficiary_id: string; readonly cap_yocto: string; readonly consumed_yocto: string } | null;
}
interface ChainRelease {
  readonly administrator_id: string;
  readonly active_agreement_version: string | null;
  readonly agreements: readonly ChainAgreement[];
}
interface ChainSettlement {
  readonly status: string;
  readonly agreement_version: string;
  readonly normalized_statement_hash: string;
}

export async function POST(request: Request, context: { params: Promise<{ releaseId: string }> }): Promise<Response> {
  try {
    requireOrigin(request);
    const { releaseId } = await context.params;
    const { accountId } = await requireMembership(releaseId, ["administrator"]);
    const body = await request.json() as { period?: unknown; operation?: unknown };
    if (typeof body.period !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(body.period)) return Response.json({ error: "ERR_PERIOD" }, { status: 400 });
    if (body.operation !== undefined && body.operation !== "open" && body.operation !== "revise") return Response.json({ error: "ERR_OPERATION" }, { status: 400 });
    const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID;
    if (!contractId?.endsWith(".testnet")) return Response.json({ error: "ERR_CONTRACT_CONFIG" }, { status: 503 });
    const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com" });
    const release = await provider.callFunction<ChainRelease>({ contractId, method: "get_release", args: { release_id: releaseId } });
    if (!release || release.administrator_id !== accountId || !release.active_agreement_version) return Response.json({ error: "ERR_CHAIN_AUTHORITY" }, { status: 409 });
    const version = release.active_agreement_version;
    const active = release.agreements.find((agreement) => agreement.version === version && agreement.active);
    if (!active) return Response.json({ error: "ERR_CHAIN_AGREEMENT" }, { status: 409 });
    let existingSettlement: ChainSettlement | undefined;
    if (body.operation === "revise") {
      const existing = await provider.callFunction<ChainSettlement>({ contractId, method: "get_settlement", args: { release_id: releaseId, period: body.period } });
      if (!existing || !["Review", "Held"].includes(existing.status) || existing.agreement_version !== version) return Response.json({ error: "ERR_REVISION_STATE" }, { status: 409 });
      existingSettlement = existing;
    }
    const database = getAppDatabase();
    const statement = database.prepare("SELECT revision, recording_id, normalized_hash, gross_yocto, validation_json FROM statement_imports WHERE release_id = ? AND period = ? ORDER BY CAST(revision AS INTEGER) DESC LIMIT 1").get(releaseId, body.period) as { revision: string; recording_id: string; normalized_hash: string; gross_yocto: string; validation_json: string } | undefined;
    const agreementRow = database.prepare("SELECT rules_json FROM agreement_drafts WHERE release_id = ? AND version = ?").get(releaseId, version) as { rules_json: string } | undefined;
    if (!statement || !agreementRow) return Response.json({ error: "ERR_EVIDENCE_MISSING" }, { status: 409 });
    if (existingSettlement?.normalized_statement_hash === statement.normalized_hash) return Response.json({ error: "ERR_UNCHANGED_STATEMENT" }, { status: 409 });
    const validation = JSON.parse(statement.validation_json) as { payable?: unknown; unsupportedClaimLineIds?: unknown; rows?: readonly { rowType?: unknown; deductionCode?: unknown; amountYocto?: unknown }[] };
    const rules = parseAgreementRules(JSON.parse(agreementRow.rules_json) as unknown);
    if (statement.recording_id !== rules.recordingId || rules.releaseId !== releaseId || body.period < rules.effectivePeriod || !/^\d+$/.test(statement.gross_yocto) || BigInt(statement.gross_yocto) === 0n) return Response.json({ error: "ERR_EVIDENCE_MISMATCH" }, { status: 409 });
    if (sha256Hex(canonicalJson(rules as unknown as CanonicalValue)) !== active.rules_hash) return Response.json({ error: "ERR_AGREEMENT_MISMATCH" }, { status: 409 });
    const recoupment = active.recoupment;
    const remaining = recoupment ? BigInt(recoupment.cap_yocto) - BigInt(recoupment.consumed_yocto) : 0n;
    if (remaining < 0n) return Response.json({ error: "ERR_CHAIN_RECOUPMENT" }, { status: 409 });
    const claims = validation.rows?.filter((row) => row.rowType === "deduction_claim") ?? [];
    if (claims.length > 0 && validation.payable === true) {
      const expected = BigInt(statement.gross_yocto) < remaining ? BigInt(statement.gross_yocto) : remaining;
      if (!recoupment || claims.some((row) => row.deductionCode !== recoupment.code || typeof row.amountYocto !== "string" || !/^\d+$/.test(row.amountYocto)) || claims.reduce((sum, row) => sum + BigInt(String(row.amountYocto)), 0n) !== expected) return Response.json({ error: "ERR_CLAIM_AMOUNT_STALE" }, { status: 409 });
    }
    const allocation = allocateEntitlements({ grossYocto: BigInt(statement.gross_yocto), remainingRecoupmentYocto: remaining, recoupmentBeneficiaryId: recoupment?.beneficiary_id ?? null, participants: rules.participants });
    const preview = {
      schema: "allocation-preview/v1", releaseId, period: body.period, agreementVersion: version, statementRevision: statement.revision,
      grossYocto: statement.gross_yocto, recoupedYocto: allocation.recoupedYocto.toString(),
      entitlements: allocation.entitlements.map((entry) => ({ ownerId: entry.ownerId, amountYocto: entry.amountYocto.toString() }))
    };
    const allocationPreviewHash = sha256Hex(canonicalJson(preview));
    const unsupportedClaimLineIds = Array.isArray(validation.unsupportedClaimLineIds) ? validation.unsupportedClaimLineIds.filter((lineId): lineId is string => typeof lineId === "string") : [];
    const deductionEvidenceHash = sha256Hex(canonicalJson({ schema: "deduction-evidence/v1", normalizedStatementHash: statement.normalized_hash, unsupportedClaimLineIds }));
    database.prepare(`INSERT INTO settlement_projections(release_id, period, revision, agreement_version, normalized_statement_hash, allocation_preview_hash, status, chain_json, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(release_id, period, revision) DO UPDATE SET status = excluded.status, allocation_preview_hash = excluded.allocation_preview_hash, chain_json = excluded.chain_json, updated_at_ms = excluded.updated_at_ms`).run(releaseId, body.period, statement.revision, version, statement.normalized_hash, allocationPreviewHash, "Prepared", JSON.stringify(preview), Date.now());
    return Response.json({ preview, allocationPreviewHash, deductionEvidenceHash, payable: validation.payable === true, unsupportedClaimLineIds, transactionRequest: { networkId: "testnet", receiverId: contractId, methodName: body.operation === "revise" ? "revise_settlement" : "open_settlement", args: { release_id: releaseId, input: { period: body.period, agreement_version: version, normalized_statement_hash: statement.normalized_hash, gross_yocto: statement.gross_yocto, deduction_evidence_hash: deductionEvidenceHash, allocation_preview_hash: allocationPreviewHash } }, depositYocto: "0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "settlement_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 400 });
  }
}
