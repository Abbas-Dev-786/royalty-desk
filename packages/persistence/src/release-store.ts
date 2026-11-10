import { randomBytes } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import type { AgreementRules, StatementImportResult } from "@royaltydesk/domain";
import { canonicalJson, createAgreementCommitment, importStatementCsv, renderAgreementMarkdown } from "@royaltydesk/domain";

export interface Membership { readonly releaseId: string; readonly accountId: string; readonly role: "administrator" | "owner" | "funder"; readonly status: "invited" | "accepted" | "revoked"; }
export interface StoredStatement extends StatementImportResult { readonly releaseId: string; readonly revision: string; readonly storageKey: string; readonly importedBy: string; }

function mapMembership(row: unknown): Membership | undefined {
  if (typeof row !== "object" || row === null) return undefined;
  const value = row as Record<string, unknown>;
  if (typeof value.release_id !== "string" || typeof value.account_id !== "string" || (value.role !== "administrator" && value.role !== "owner" && value.role !== "funder") || (value.status !== "invited" && value.status !== "accepted" && value.status !== "revoked")) return undefined;
  return { releaseId: value.release_id, accountId: value.account_id, role: value.role, status: value.status };
}

export function upsertMembership(database: DatabaseSync, membership: Membership, nowMs = Date.now()): Membership {
  database.prepare(`INSERT INTO release_memberships(release_id, account_id, role, status, created_at_ms) VALUES (?, ?, ?, ?, ?) ON CONFLICT(release_id, account_id, role) DO UPDATE SET status = excluded.status`).run(membership.releaseId, membership.accountId, membership.role, membership.status, nowMs);
  const row = database.prepare(`SELECT release_id, account_id, role, status FROM release_memberships WHERE release_id = ? AND account_id = ? AND role = ?`).get(membership.releaseId, membership.accountId, membership.role);
  const result = mapMembership(row);
  if (!result) throw new Error("Membership was not persisted");
  return result;
}

export function getMembership(database: DatabaseSync, releaseId: string, accountId: string, roles?: readonly Membership["role"][], status?: Membership["status"]): Membership | undefined {
  const rows = database.prepare(`SELECT release_id, account_id, role, status FROM release_memberships WHERE release_id = ? AND account_id = ? ORDER BY CASE status WHEN 'accepted' THEN 0 WHEN 'invited' THEN 1 ELSE 2 END`).all(releaseId, accountId);
  return rows.map(mapMembership).find((membership) => membership && (!roles || roles.includes(membership.role)) && (!status || membership.status === status));
}

export function importStatement(database: DatabaseSync, input: { readonly releaseId: string; readonly csv: string | Uint8Array; readonly importedBy: string; readonly approvedRecoupmentCode?: string | null }): StoredStatement {
  const parsed = importStatementCsv(input.csv, input.approvedRecoupmentCode ?? null);
  const existing = database.prepare(`SELECT release_id, period, revision, statement_id, recording_id, raw_hash, normalized_hash, gross_yocto, validation_json, storage_key, imported_by FROM statement_imports WHERE release_id = ? AND period = ? AND normalized_hash = ?`).get(input.releaseId, parsed.period, parsed.normalizedHash) as Record<string, unknown> | undefined;
  if (existing) return deserializeStatement(existing);
  const revisionRow = database.prepare(`SELECT COALESCE(MAX(CAST(revision AS INTEGER)), 0) AS revision FROM statement_imports WHERE release_id = ? AND period = ?`).get(input.releaseId, parsed.period) as { revision?: number } | undefined;
  const revision = String((revisionRow?.revision ?? 0) + 1);
  const storageKey = randomBytes(24).toString("hex");
  database.prepare(`INSERT INTO statement_imports(release_id, period, revision, statement_id, recording_id, raw_hash, normalized_hash, gross_yocto, validation_json, storage_key, imported_by, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(input.releaseId, parsed.period, revision, parsed.statementId, parsed.recordingId, parsed.rawHash, parsed.normalizedHash, parsed.grossYocto, JSON.stringify({ unsupportedClaimLineIds: parsed.unsupportedClaimLineIds, payable: parsed.payable, rows: parsed.rows }), storageKey, input.importedBy, Date.now());
  return { ...parsed, releaseId: input.releaseId, revision, storageKey, importedBy: input.importedBy };
}

function deserializeStatement(row: Record<string, unknown>): StoredStatement {
  const validation = JSON.parse(String(row.validation_json)) as { unsupportedClaimLineIds?: unknown; payable?: unknown; rows?: unknown };
  if (!Array.isArray(validation.rows) || !Array.isArray(validation.unsupportedClaimLineIds) || typeof validation.payable !== "boolean") throw new Error("Stored statement validation is corrupt");
  return { releaseId: String(row.release_id), period: String(row.period), revision: String(row.revision), statementId: String(row.statement_id), recordingId: String(row.recording_id), rawHash: String(row.raw_hash), normalizedHash: String(row.normalized_hash), grossYocto: String(row.gross_yocto), unsupportedClaimLineIds: validation.unsupportedClaimLineIds.filter((value): value is string => typeof value === "string"), payable: validation.payable, rows: validation.rows as StoredStatement["rows"], storageKey: String(row.storage_key), importedBy: String(row.imported_by) };
}

export function freezeAgreement(database: DatabaseSync, input: { readonly rules: AgreementRules; readonly version: string; readonly createdBy: string; readonly networkId: string; readonly contractId: string }): { readonly version: string; readonly rulesHash: string; readonly documentHash: string; readonly approvalDigest: string; readonly markdown: string } {
  const rendered = renderAgreementMarkdown(input.rules);
  const commitment = createAgreementCommitment(input.rules, rendered.bytes, { networkId: input.networkId, contractId: input.contractId, releaseId: input.rules.releaseId, agreementVersion: input.version });
  database.prepare(`INSERT INTO agreement_drafts(release_id, version, rules_json, document_bytes, document_hash, rules_hash, approval_digest, status, created_by, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, 'frozen', ?, ?)`).run(input.rules.releaseId, input.version, canonicalJson(input.rules as never), Buffer.from(rendered.bytes), commitment.documentHash, commitment.rulesHash, commitment.approvalDigest, input.createdBy, Date.now());
  return { version: input.version, rulesHash: commitment.rulesHash, documentHash: commitment.documentHash, approvalDigest: commitment.approvalDigest, markdown: rendered.markdown };
}
