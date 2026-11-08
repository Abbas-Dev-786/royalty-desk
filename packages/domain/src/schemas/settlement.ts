import type { SettlementCommitment } from "../types.ts";
import { expectHexDigest, expectIdentifier, expectPeriod, expectRecord, expectUnsignedDecimal, expectYocto, rejectUnknownKeys } from "./primitives.ts";

export function parseSettlementCommitment(value: unknown): SettlementCommitment {
  const record = expectRecord(value, "$settlement");
  rejectUnknownKeys(record, ["releaseId", "period", "agreementVersion", "revision", "normalizedStatementHash", "grossYocto", "deductionEvidenceHash", "allocationPreviewHash"], "$settlement");
  return {
    releaseId: expectIdentifier(record.releaseId, "$settlement.releaseId"),
    period: expectPeriod(record.period, "$settlement.period"),
    agreementVersion: expectUnsignedDecimal(record.agreementVersion, "$settlement.agreementVersion"),
    revision: expectUnsignedDecimal(record.revision, "$settlement.revision"),
    normalizedStatementHash: expectHexDigest(record.normalizedStatementHash, "$settlement.normalizedStatementHash"),
    grossYocto: expectYocto(record.grossYocto, "$settlement.grossYocto"),
    deductionEvidenceHash: expectHexDigest(record.deductionEvidenceHash, "$settlement.deductionEvidenceHash"),
    allocationPreviewHash: expectHexDigest(record.allocationPreviewHash, "$settlement.allocationPreviewHash")
  };
}
