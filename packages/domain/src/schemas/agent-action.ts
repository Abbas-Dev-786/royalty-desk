import { DomainError } from "../errors.ts";
import type { AgentAction } from "../types.ts";
import { parseAgreementRules } from "./agreement.ts";
import { expectArray, expectHexDigest, expectIdentifier, expectRecord, expectString } from "./primitives.ts";

function evidenceIds(value: unknown, path: string): readonly string[] {
  const values = expectArray(value, path).map((entry, index) => expectIdentifier(entry, `${path}[${index}]`));
  if (values.length === 0 || values.length > 20 || new Set(values).size !== values.length) {
    throw new DomainError("ERR_SCHEMA_BOUND", "Evidence ids must be a unique nonempty bounded list", path);
  }
  return values;
}

export function parseAgentAction(value: unknown): AgentAction {
  const record = expectRecord(value, "$action");
  switch (record.type) {
    case "propose_terms":
      return { type: "propose_terms", agreement: parseAgreementRules(record.agreement) };
    case "counter_terms":
      return {
        type: "counter_terms",
        parentProposalId: expectIdentifier(record.parentProposalId, "$action.parentProposalId"),
        agreement: parseAgreementRules(record.agreement)
      };
    case "request_evidence":
      return {
        type: "request_evidence",
        evidenceIds: evidenceIds(record.evidenceIds, "$action.evidenceIds"),
        rationale: expectString(record.rationale, "$action.rationale", 1_000)
      };
    case "recommend_approval":
      return {
        type: "recommend_approval",
        settlementDigest: expectHexDigest(record.settlementDigest, "$action.settlementDigest"),
        rationale: expectString(record.rationale, "$action.rationale", 1_000)
      };
    case "raise_objection":
      return {
        type: "raise_objection",
        settlementDigest: expectHexDigest(record.settlementDigest, "$action.settlementDigest"),
        evidenceIds: evidenceIds(record.evidenceIds, "$action.evidenceIds"),
        rationale: expectString(record.rationale, "$action.rationale", 1_000)
      };
    case "needs_human":
      return { type: "needs_human", rationale: expectString(record.rationale, "$action.rationale", 1_000) };
    default:
      throw new DomainError("ERR_SCHEMA_TYPE", "Unsupported agent action", "$action.type");
  }
}
