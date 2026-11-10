import { JsonRpcProvider } from "near-api-js";
import { resolve } from "node:path";
import { EncryptedFileStore } from "@royaltydesk/persistence";
import { parseAgreementRules, sha256Hex, type StatementRow } from "@royaltydesk/domain";

export interface AgentContextPayload {
  readonly releaseId: string;
  readonly ownerAccountId: string;
  readonly agentAccountId: string | null;
  readonly privatePreferences: string;
  readonly agreement: ReturnType<typeof parseAgreementRules> | null;
  readonly settlement: { readonly releaseId: string; readonly period: string; readonly agreementVersion: string; readonly revision: string; readonly normalizedStatementHash: string; readonly grossYocto: string; readonly deductionEvidenceHash: string; readonly allocationPreviewHash: string } | null;
  readonly settlementDigest: string | null;
  readonly statementRows: readonly StatementRow[];
  readonly validationFindings: readonly string[];
  readonly allowedActions: readonly ("approve_settlement" | "dispute_settlement" | "execute_payout")[];
  readonly mandateEpoch: string | null;
  readonly mandateExpiresAtNanoseconds: string | null;
  readonly mandateMaxGrossYocto: string | null;
}

interface ReleaseView { readonly mandates?: readonly { owner_id: string; agent_id: string; agreement_version: string | number; actions: readonly string[]; max_gross_yocto: string; expires_at_nanoseconds: string | number; epoch: string | number; revoked: boolean }[]; }
interface SettlementView { readonly period: string; readonly revision: string; readonly agreement_version: string; readonly normalized_statement_hash: string; readonly gross_yocto: string; readonly deduction_evidence_hash: string; readonly allocation_preview_hash: string }
type Mandate = { readonly owner_id: string; readonly agent_id: string; readonly agreement_version: string | number; readonly actions: readonly string[]; readonly max_gross_yocto: string; readonly expires_at_nanoseconds: string | number; readonly epoch: string | number; readonly revoked: boolean };

function privateStore(): EncryptedFileStore {
  const secret = process.env.ROYALTYDESK_STORAGE_SECRET ?? process.env.ROYALTYDESK_ENCRYPTION_KEY;
  if (!secret) throw new Error("ERR_STORAGE_CONFIG");
  return new EncryptedFileStore(resolve(/* turbopackIgnore: true */ process.cwd(), "../..", process.env.ROYALTYDESK_FILES_PATH ?? process.env.ROYALTYDESK_PRIVATE_FILES_PATH ?? ".royaltydesk/private"), secret);
}

function rowValue(value: unknown): StatementRow | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const row = value as Record<string, unknown>;
  if (typeof row.statementId !== "string" || typeof row.lineId !== "string" || typeof row.period !== "string" || typeof row.recordingId !== "string" || typeof row.platform !== "string" || (row.rowType !== "revenue" && row.rowType !== "deduction_claim") || typeof row.amountYocto !== "string" || row.currency !== "NEAR" || (row.deductionCode !== null && typeof row.deductionCode !== "string") || (row.evidenceRef !== null && typeof row.evidenceRef !== "string")) return undefined;
  return row as unknown as StatementRow;
}

export async function buildAuthorizedAgentContext(database: ReturnType<typeof import("@royaltydesk/persistence").openDatabase>, releaseId: string, ownerAccountId: string, period: string | null): Promise<AgentContextPayload> {
  const profile = database.prepare(`SELECT agent_account_id, key_reference FROM agent_profiles WHERE release_id = ? AND owner_account_id = ?`).get(releaseId, ownerAccountId) as { agent_account_id?: unknown; key_reference?: unknown } | undefined;
  const privatePreferences = profile && typeof profile.key_reference === "string" ? new TextDecoder().decode(privateStore().get(profile.key_reference)) : "";
  const agreementRow = database.prepare(`SELECT rules_json FROM agreement_drafts WHERE release_id = ? ORDER BY CAST(version AS INTEGER) DESC LIMIT 1`).get(releaseId) as { rules_json?: unknown } | undefined;
  const agreement = agreementRow && typeof agreementRow.rules_json === "string" ? parseAgreementRules(JSON.parse(agreementRow.rules_json) as unknown) : null;
  const statementRow = period ? database.prepare(`SELECT period, revision, statement_id, recording_id, normalized_hash, gross_yocto, validation_json FROM statement_imports WHERE release_id = ? AND period = ? ORDER BY CAST(revision AS INTEGER) DESC LIMIT 1`).get(releaseId, period) as Record<string, unknown> | undefined : undefined;
  const validation = statementRow && typeof statementRow.validation_json === "string" ? JSON.parse(statementRow.validation_json) as { rows?: unknown; unsupportedClaimLineIds?: unknown } : undefined;
  const rows = Array.isArray(validation?.rows) ? validation.rows.map(rowValue).filter((row): row is StatementRow => row !== undefined) : [];
  const projection = period ? database.prepare(`SELECT agreement_version, revision, normalized_statement_hash, allocation_preview_hash FROM settlement_projections WHERE release_id = ? AND period = ? ORDER BY CAST(revision AS INTEGER) DESC LIMIT 1`).get(releaseId, period) as Record<string, unknown> | undefined : undefined;
  const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID;
  let mandate: Mandate | undefined;
  let chainSettlement: SettlementView | undefined;
  if (contractId && contractId.endsWith(".testnet")) {
    const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com" });
    const release = await provider.callFunction<ReleaseView>({ contractId, method: "get_release", args: { release_id: releaseId } });
    mandate = release?.mandates?.find((entry) => entry.owner_id === ownerAccountId && !entry.revoked);
    if (period && projection) chainSettlement = await provider.callFunction<SettlementView>({ contractId, method: "get_settlement", args: { release_id: releaseId, period } });
  }
  const settlement = statementRow && chainSettlement && chainSettlement.normalized_statement_hash === statementRow.normalized_hash && chainSettlement.gross_yocto === statementRow.gross_yocto ? { releaseId, period: chainSettlement.period, agreementVersion: String(chainSettlement.agreement_version), revision: String(chainSettlement.revision), normalizedStatementHash: chainSettlement.normalized_statement_hash, grossYocto: chainSettlement.gross_yocto, deductionEvidenceHash: chainSettlement.deduction_evidence_hash, allocationPreviewHash: chainSettlement.allocation_preview_hash } : null;
  const allowedActions = mandate ? mandate.actions.filter((action): action is "approve_settlement" | "dispute_settlement" | "execute_payout" => action === "approve_settlement" || action === "dispute_settlement" || action === "execute_payout") : [];
  return { releaseId, ownerAccountId, agentAccountId: typeof profile?.agent_account_id === "string" ? profile.agent_account_id : null, privatePreferences, agreement, settlement, settlementDigest: settlement ? sha256Hex([settlement.period, settlement.revision, settlement.agreementVersion, settlement.normalizedStatementHash, settlement.grossYocto, settlement.deductionEvidenceHash, settlement.allocationPreviewHash].join("|")) : null, statementRows: rows, validationFindings: Array.isArray(validation?.unsupportedClaimLineIds) ? validation.unsupportedClaimLineIds.filter((value): value is string => typeof value === "string").map((value) => `Unsupported deduction claim: ${value}`) : [], allowedActions, mandateEpoch: mandate ? String(mandate.epoch) : null, mandateExpiresAtNanoseconds: mandate ? String(mandate.expires_at_nanoseconds) : null, mandateMaxGrossYocto: mandate ? String(mandate.max_gross_yocto) : null };
}
