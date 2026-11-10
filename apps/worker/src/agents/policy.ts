import type { AgentAction } from "@royaltydesk/domain";
import type { AgentToolRequest, PersonalAgentContext } from "./types.ts";

export interface ToolPolicyInput { readonly context: PersonalAgentContext; readonly action: AgentAction; readonly currentTimeNanoseconds: bigint; }

export function validateAgentTool(input: ToolPolicyInput): AgentToolRequest | undefined {
  const { context, action } = input;
  if (!context.agentAccountId || !context.mandateEpoch || !context.mandateExpiresAtNanoseconds || !context.mandateMaxGrossYocto) return undefined;
  if (input.currentTimeNanoseconds >= BigInt(context.mandateExpiresAtNanoseconds)) return undefined;
  if (context.settlement && BigInt(context.settlement.grossYocto) > BigInt(context.mandateMaxGrossYocto)) return undefined;
  if (action.type === "raise_objection") {
    if (!context.allowedActions.includes("dispute_settlement") || !context.settlement || action.settlementDigest !== (context.settlementDigest ?? context.settlement.allocationPreviewHash)) return undefined;
    const known = new Set(context.statementRows.map((row) => row.lineId));
    if (action.evidenceIds.some((id) => !known.has(id))) return undefined;
    return { methodName: "dispute_settlement", args: { release_id: context.releaseId, period: context.settlement.period, reason_hash: action.settlementDigest }, ownerAccountId: context.ownerAccountId, agentAccountId: context.agentAccountId, mandateEpoch: context.mandateEpoch, inputDigest: action.settlementDigest, evidenceIds: action.evidenceIds };
  }
  if (action.type === "recommend_approval") {
    if (!context.allowedActions.includes("approve_settlement") || !context.settlement || action.settlementDigest !== (context.settlementDigest ?? context.settlement.allocationPreviewHash) || context.validationFindings.length > 0) return undefined;
    return { methodName: "approve_settlement", args: { release_id: context.releaseId, period: context.settlement.period, digest: action.settlementDigest }, ownerAccountId: context.ownerAccountId, agentAccountId: context.agentAccountId, mandateEpoch: context.mandateEpoch, inputDigest: action.settlementDigest, evidenceIds: [] };
  }
  return undefined;
}
