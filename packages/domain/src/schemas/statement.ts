import { DomainError } from "../errors.ts";
import { DOMAIN_LIMITS } from "../limits.ts";
import type { StatementRow } from "../types.ts";
import { parseNearAmount } from "../money/amount.ts";
import { expectIdentifier, expectPeriod, expectRecord, expectString, rejectUnknownKeys } from "./primitives.ts";

export interface StatementRowInput {
  readonly statement_id: unknown;
  readonly line_id: unknown;
  readonly period: unknown;
  readonly recording_id: unknown;
  readonly platform: unknown;
  readonly row_type: unknown;
  readonly amount: unknown;
  readonly currency: unknown;
  readonly deduction_code: unknown;
  readonly evidence_ref: unknown;
}

function optionalBoundedString(value: unknown, path: string, maximum: number): string | null {
  if (value === "" || value === null || value === undefined) return null;
  return expectString(value, path, maximum);
}

export function parseStatementRow(value: unknown, index: number): StatementRow {
  const path = `$statement.rows[${index}]`;
  const record = expectRecord(value, path);
  rejectUnknownKeys(record, ["statement_id", "line_id", "period", "recording_id", "platform", "row_type", "amount", "currency", "deduction_code", "evidence_ref"], path);
  if (record.row_type !== "revenue" && record.row_type !== "deduction_claim") {
    throw new DomainError("ERR_CSV_VALUE", "Unsupported row_type", `${path}.row_type`);
  }
  if (record.currency !== "NEAR") throw new DomainError("ERR_CSV_VALUE", "Currency must be NEAR", `${path}.currency`);
  if (typeof record.amount !== "string") throw new DomainError("ERR_CSV_VALUE", "Amount must be a string", `${path}.amount`);
  const amountYocto = parseNearAmount(record.amount).toString();
  const deductionCode = optionalBoundedString(record.deduction_code, `${path}.deduction_code`, 64);
  if (record.row_type === "revenue" && deductionCode !== null) {
    throw new DomainError("ERR_CSV_VALUE", "Revenue rows cannot contain a deduction code", `${path}.deduction_code`);
  }
  if (record.row_type === "deduction_claim" && deductionCode === null) {
    throw new DomainError("ERR_CSV_VALUE", "Deduction claims require a code", `${path}.deduction_code`);
  }
  return {
    statementId: expectIdentifier(record.statement_id, `${path}.statement_id`),
    lineId: expectIdentifier(record.line_id, `${path}.line_id`),
    period: expectPeriod(record.period, `${path}.period`),
    recordingId: expectIdentifier(record.recording_id, `${path}.recording_id`),
    platform: expectString(record.platform, `${path}.platform`, DOMAIN_LIMITS.maxLabelLength),
    rowType: record.row_type,
    amountYocto,
    currency: "NEAR",
    deductionCode,
    evidenceRef: optionalBoundedString(record.evidence_ref, `${path}.evidence_ref`, DOMAIN_LIMITS.maxEvidenceReferenceLength)
  };
}
