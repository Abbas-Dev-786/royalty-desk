import { DomainError } from "../errors.ts";
import { DOMAIN_LIMITS } from "../limits.ts";
import { canonicalJson } from "../canonical/canonical-json.ts";
import { sha256Hex } from "../canonical/commitments.ts";
import { parseStatementRow } from "../schemas/statement.ts";
import type { StatementRow } from "../types.ts";

export const STATEMENT_HEADERS = [
  "statement_id", "line_id", "period", "recording_id", "platform", "row_type", "amount", "currency", "deduction_code", "evidence_ref"
] as const;

export interface StatementImportResult {
  readonly rawHash: string;
  readonly normalizedHash: string;
  readonly statementId: string;
  readonly period: string;
  readonly recordingId: string;
  readonly grossYocto: string;
  readonly rows: readonly StatementRow[];
  readonly unsupportedClaimLineIds: readonly string[];
  readonly payable: boolean;
}

export function normalizeStatementRecords(
  records: readonly (readonly string[])[],
  rawBytes: Uint8Array,
  approvedRecoupmentCode: string | null = null
): StatementImportResult {
  if (records.length < 2) throw new DomainError("ERR_CSV_ROWS", "Statement needs a header and at least one row", "$statement");
  const header = records[0];
  if (!header || header.length !== STATEMENT_HEADERS.length || header.some((value, index) => value !== STATEMENT_HEADERS[index])) {
    throw new DomainError("ERR_CSV_HEADER", "Statement headers must exactly match CSV v1", "$statement.headers");
  }
  const data = records.slice(1);
  if (data.length > DOMAIN_LIMITS.maxStatementRows) throw new DomainError("ERR_CSV_ROWS", "Statement exceeds 100 rows", "$statement.rows");
  const rows = data.map((record, index) => {
    if (record.length !== STATEMENT_HEADERS.length) throw new DomainError("ERR_CSV_PARSE", "Row has the wrong column count", `$statement.rows[${index}]`);
    return parseStatementRow(Object.fromEntries(STATEMENT_HEADERS.map((name, column) => [name, record[column]])), index);
  });
  const first = rows[0];
  if (!first) throw new DomainError("ERR_CSV_ROWS", "Statement contains no rows", "$statement.rows");
  const lineIds = new Set<string>();
  for (const [index, row] of rows.entries()) {
    if (lineIds.has(row.lineId)) throw new DomainError("ERR_CSV_DUPLICATE", "Duplicate line_id", `$statement.rows[${index}].line_id`);
    lineIds.add(row.lineId);
    if (row.statementId !== first.statementId || row.period !== first.period || row.recordingId !== first.recordingId) {
      throw new DomainError("ERR_CSV_VALUE", "All rows must share statement, period, and recording", `$statement.rows[${index}]`);
    }
  }
  const normalizedRows = [...rows].sort((left, right) => left.lineId < right.lineId ? -1 : left.lineId > right.lineId ? 1 : 0);
  const grossYocto = normalizedRows.filter((row) => row.rowType === "revenue").reduce((sum, row) => sum + BigInt(row.amountYocto), 0n);
  const unsupportedClaimLineIds = normalizedRows
    .filter((row) => row.rowType === "deduction_claim" && row.deductionCode !== approvedRecoupmentCode)
    .map((row) => row.lineId);
  const normalizedValue = {
    schema: "statement/v1",
    statementId: first.statementId,
    period: first.period,
    recordingId: first.recordingId,
    rows: normalizedRows.map((row) => ({
      statementId: row.statementId,
      lineId: row.lineId,
      period: row.period,
      recordingId: row.recordingId,
      platform: row.platform,
      rowType: row.rowType,
      amountYocto: row.amountYocto,
      currency: row.currency,
      deductionCode: row.deductionCode,
      evidenceRef: row.evidenceRef
    }))
  } as const;
  return {
    rawHash: sha256Hex(rawBytes),
    normalizedHash: sha256Hex(canonicalJson(normalizedValue)),
    statementId: first.statementId,
    period: first.period,
    recordingId: first.recordingId,
    grossYocto: grossYocto.toString(),
    rows: normalizedRows,
    unsupportedClaimLineIds,
    payable: grossYocto > 0n && unsupportedClaimLineIds.length === 0
  };
}

export function escapeSpreadsheetCell(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}
