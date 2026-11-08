import { DomainError } from "../errors.ts";
import { DOMAIN_LIMITS } from "../limits.ts";
import type { AgreementRules, ParticipantShare, RecoupmentRule } from "../types.ts";
import { expectAccountId, expectArray, expectIdentifier, expectPeriod, expectRecord, expectString, expectUnsignedDecimal, expectYocto, rejectUnknownKeys } from "./primitives.ts";

function parseParticipant(value: unknown, index: number): ParticipantShare {
  const path = `$agreement.participants[${index}]`;
  const record = expectRecord(value, path);
  rejectUnknownKeys(record, ["ownerId", "basisPoints"], path);
  const basisPoints = expectUnsignedDecimal(record.basisPoints, `${path}.basisPoints`, 10_000n);
  return { ownerId: expectAccountId(record.ownerId, `${path}.ownerId`), basisPoints };
}

function parseRecoupment(value: unknown): RecoupmentRule | null {
  if (value === null) return null;
  const record = expectRecord(value, "$agreement.recoupment");
  rejectUnknownKeys(record, ["code", "beneficiaryId", "capYocto"], "$agreement.recoupment");
  const capYocto = expectYocto(record.capYocto, "$agreement.recoupment.capYocto");
  if (capYocto === "0") throw new DomainError("ERR_RECOUPMENT", "Recoupment cap must be positive", "$agreement.recoupment.capYocto");
  return {
    code: expectString(record.code, "$agreement.recoupment.code", 64),
    beneficiaryId: expectAccountId(record.beneficiaryId, "$agreement.recoupment.beneficiaryId"),
    capYocto
  };
}

export function parseAgreementRules(value: unknown): AgreementRules {
  const record = expectRecord(value, "$agreement");
  rejectUnknownKeys(record, ["schemaVersion", "releaseId", "recordingId", "participants", "recoupment", "effectivePeriod"], "$agreement");
  if (record.schemaVersion !== "1") throw new DomainError("ERR_SCHEMA_TYPE", "Unsupported agreement schema", "$agreement.schemaVersion");
  const inputs = expectArray(record.participants, "$agreement.participants");
  if (inputs.length < 2 || inputs.length > DOMAIN_LIMITS.maxParticipants) {
    throw new DomainError("ERR_PARTICIPANTS", "Agreement requires two to five participants", "$agreement.participants");
  }
  const participants = inputs.map(parseParticipant).sort((left, right) => left.ownerId < right.ownerId ? -1 : left.ownerId > right.ownerId ? 1 : 0);
  if (new Set(participants.map((entry) => entry.ownerId)).size !== participants.length) {
    throw new DomainError("ERR_PARTICIPANTS", "Participant owner ids must be unique", "$agreement.participants");
  }
  const total = participants.reduce((sum, entry) => sum + BigInt(entry.basisPoints), 0n);
  if (total !== 10_000n) throw new DomainError("ERR_BASIS_POINTS", "Participant shares must total 10000", "$agreement.participants");
  const recoupment = parseRecoupment(record.recoupment);
  if (recoupment && !participants.some((entry) => entry.ownerId === recoupment.beneficiaryId)) {
    throw new DomainError("ERR_RECOUPMENT", "Recoupment beneficiary must be a participant", "$agreement.recoupment.beneficiaryId");
  }
  return {
    schemaVersion: "1",
    releaseId: expectIdentifier(record.releaseId, "$agreement.releaseId"),
    recordingId: expectIdentifier(record.recordingId, "$agreement.recordingId"),
    participants,
    recoupment,
    effectivePeriod: expectPeriod(record.effectivePeriod, "$agreement.effectivePeriod")
  };
}
