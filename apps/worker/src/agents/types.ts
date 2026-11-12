import type { AgentAction, AgreementRules, SettlementCommitment, StatementRow } from "@royaltydesk/domain";

export type AgentMode = "live" | "fixture";
export type AgentSessionStatus = "negotiating" | "reviewing" | "awaiting_human" | "succeeded" | "failed" | "paused";

export interface PersonalAgentContext {
  readonly releaseId: string;
  readonly ownerAccountId: string;
  readonly agentAccountId: string | null;
  readonly privatePreferences: string;
  readonly sharedProposals?: readonly { readonly id: string; readonly ownerAccountId: string; readonly action: AgentAction }[];
  readonly agreement: AgreementRules | null;
  readonly settlement: SettlementCommitment | null;
  readonly settlementDigest: string | null;
  readonly statementRows: readonly StatementRow[];
  readonly validationFindings: readonly string[];
  readonly allowedActions: readonly ("approve_settlement" | "dispute_settlement" | "execute_payout")[];
  readonly mandateEpoch: string | null;
  readonly mandateExpiresAtNanoseconds: string | null;
  readonly mandateMaxGrossYocto: string | null;
}

export interface AgentModelRequest { readonly system: string; readonly user: string; readonly inputDigest: string; readonly maxOutputTokens: number; }
export interface AgentModelResult { readonly model: string; readonly content: string; readonly inputTokens?: number; readonly outputTokens?: number; readonly responseId?: string; }
export interface AgentModel { readonly mode: AgentMode; readonly complete: (request: AgentModelRequest) => Promise<AgentModelResult>; }
export interface AgentRunResult { readonly sessionId: string; readonly status: AgentSessionStatus; readonly action?: AgentAction; readonly proposalId?: string; readonly reason?: string; readonly model: string; readonly mode: AgentMode; readonly chainOperation?: { readonly operationId: string; readonly transactionHash: string | null; readonly status: "success" | "failure" | "unknown" }; }

export interface AgentToolRequest {
  readonly methodName: "approve_settlement" | "dispute_settlement";
  readonly args: Record<string, string>;
  readonly ownerAccountId: string;
  readonly agentAccountId: string;
  readonly mandateEpoch: string;
  readonly inputDigest: string;
  readonly evidenceIds: readonly string[];
}
