export interface ParticipantShare {
  readonly ownerId: string;
  readonly basisPoints: string;
}

export interface RecoupmentRule {
  readonly code: string;
  readonly beneficiaryId: string;
  readonly capYocto: string;
}

export interface AgreementRules {
  readonly schemaVersion: "1";
  readonly releaseId: string;
  readonly recordingId: string;
  readonly participants: readonly ParticipantShare[];
  readonly recoupment: RecoupmentRule | null;
  readonly effectivePeriod: string;
}

export interface ReleaseDefinition {
  readonly releaseId: string;
  readonly recordingId: string;
  readonly administratorId: string;
  readonly funderId: string;
  readonly invitedOwnerIds: readonly string[];
}

export type MandateAction = "approve_settlement" | "dispute_settlement" | "execute_payout";

export interface MandateDefinition {
  readonly ownerId: string;
  readonly agentId: string;
  readonly releaseId: string;
  readonly agreementVersion: string;
  readonly actions: readonly MandateAction[];
  readonly maxGrossYocto: string;
  readonly expiresAtNanoseconds: string;
  readonly epoch: string;
}

export interface StatementRow {
  readonly statementId: string;
  readonly lineId: string;
  readonly period: string;
  readonly recordingId: string;
  readonly platform: string;
  readonly rowType: "revenue" | "deduction_claim";
  readonly amountYocto: string;
  readonly currency: "NEAR";
  readonly deductionCode: string | null;
  readonly evidenceRef: string | null;
}

export interface SettlementCommitment {
  readonly releaseId: string;
  readonly period: string;
  readonly agreementVersion: string;
  readonly revision: string;
  readonly normalizedStatementHash: string;
  readonly grossYocto: string;
  readonly deductionEvidenceHash: string;
  readonly allocationPreviewHash: string;
}

export type AgentAction =
  | { readonly type: "propose_terms"; readonly agreement: AgreementRules }
  | { readonly type: "counter_terms"; readonly parentProposalId: string; readonly agreement: AgreementRules }
  | { readonly type: "request_evidence"; readonly evidenceIds: readonly string[]; readonly rationale: string }
  | { readonly type: "recommend_approval"; readonly settlementDigest: string; readonly rationale: string }
  | { readonly type: "raise_objection"; readonly settlementDigest: string; readonly evidenceIds: readonly string[]; readonly rationale: string }
  | { readonly type: "needs_human"; readonly rationale: string };
