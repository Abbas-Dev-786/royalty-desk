import { DomainError } from "../errors.ts";
import type { MandateAction, MandateDefinition } from "../types.ts";
import { expectAccountId, expectArray, expectIdentifier, expectRecord, expectUnsignedDecimal, expectYocto, rejectUnknownKeys } from "./primitives.ts";

const ALLOWED_ACTIONS = new Set<MandateAction>(["approve_settlement", "dispute_settlement", "execute_payout"]);

export function parseMandateDefinition(value: unknown): MandateDefinition {
  const record = expectRecord(value, "$mandate");
  rejectUnknownKeys(record, ["ownerId", "agentId", "releaseId", "agreementVersion", "actions", "maxGrossYocto", "expiresAtNanoseconds", "epoch"], "$mandate");
  const ownerId = expectAccountId(record.ownerId, "$mandate.ownerId");
  const agentId = expectAccountId(record.agentId, "$mandate.agentId");
  if (ownerId === agentId) throw new DomainError("ERR_ACCOUNT_ID", "Agent must be distinct from owner", "$mandate.agentId");
  const actionInputs = expectArray(record.actions, "$mandate.actions");
  if (actionInputs.length === 0) throw new DomainError("ERR_SCHEMA_BOUND", "Mandate needs at least one action", "$mandate.actions");
  const actions = actionInputs.map((action, index) => {
    if (typeof action !== "string" || !ALLOWED_ACTIONS.has(action as MandateAction)) {
      throw new DomainError("ERR_SCHEMA_TYPE", "Unsupported mandate action", `$mandate.actions[${index}]`);
    }
    return action as MandateAction;
  });
  const uniqueActions = [...new Set(actions)].sort();
  if (uniqueActions.length !== actions.length) throw new DomainError("ERR_SCHEMA_TYPE", "Duplicate mandate action", "$mandate.actions");
  return {
    ownerId,
    agentId,
    releaseId: expectIdentifier(record.releaseId, "$mandate.releaseId"),
    agreementVersion: expectUnsignedDecimal(record.agreementVersion, "$mandate.agreementVersion"),
    actions: uniqueActions,
    maxGrossYocto: expectYocto(record.maxGrossYocto, "$mandate.maxGrossYocto"),
    expiresAtNanoseconds: expectUnsignedDecimal(record.expiresAtNanoseconds, "$mandate.expiresAtNanoseconds"),
    epoch: expectUnsignedDecimal(record.epoch, "$mandate.epoch")
  };
}
