import { DomainError } from "../errors.ts";
import { DOMAIN_LIMITS } from "../limits.ts";
import type { ReleaseDefinition } from "../types.ts";
import { expectAccountId, expectArray, expectIdentifier, expectRecord, rejectUnknownKeys } from "./primitives.ts";

export function parseReleaseDefinition(value: unknown): ReleaseDefinition {
  const record = expectRecord(value, "$release");
  rejectUnknownKeys(record, ["releaseId", "recordingId", "administratorId", "funderId", "invitedOwnerIds"], "$release");
  const invitations = expectArray(record.invitedOwnerIds, "$release.invitedOwnerIds");
  if (invitations.length > DOMAIN_LIMITS.maxInvitations) {
    throw new DomainError("ERR_SCHEMA_BOUND", "Too many invitations", "$release.invitedOwnerIds");
  }
  const invitedOwnerIds = invitations.map((entry, index) => expectAccountId(entry, `$release.invitedOwnerIds[${index}]`));
  if (new Set(invitedOwnerIds).size !== invitedOwnerIds.length) {
    throw new DomainError("ERR_PARTICIPANTS", "Duplicate invitation", "$release.invitedOwnerIds");
  }
  return {
    releaseId: expectIdentifier(record.releaseId, "$release.releaseId"),
    recordingId: expectIdentifier(record.recordingId, "$release.recordingId"),
    administratorId: expectAccountId(record.administratorId, "$release.administratorId"),
    funderId: expectAccountId(record.funderId, "$release.funderId"),
    invitedOwnerIds
  };
}
