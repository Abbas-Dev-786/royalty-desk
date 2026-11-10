import { canonicalJson, sha256Hex, type AgentAction, type CanonicalValue } from "@royaltydesk/domain";
import type { RestrictedSigner } from "@royaltydesk/chain";
import { validateAgentTool } from "./policy.ts";
import type { AgentToolRequest, PersonalAgentContext } from "./types.ts";

export interface AgentDispatchResult { readonly operationId: string; readonly transactionHash: string | null; readonly status: "success" | "failure" | "unknown"; readonly request: AgentToolRequest; }

export class AgentToolDispatcher {
  readonly #signer: RestrictedSigner;
  constructor(signer: RestrictedSigner) { this.#signer = signer; }

  async dispatch(context: PersonalAgentContext, action: AgentAction, nowNanoseconds = BigInt(Date.now()) * 1_000_000n): Promise<AgentDispatchResult> {
    const request = validateAgentTool({ context, action, currentTimeNanoseconds: nowNanoseconds });
    if (!request) throw new Error("ERR_AGENT_POLICY");
    const operationId = `agent-${sha256Hex(canonicalJson({ schema: "agent-operation/v1", request } as unknown as CanonicalValue)).slice(0, 48)}`;
    const result = await this.#signer.call({ operationId, logicalKey: operationId, releaseId: context.releaseId, methodName: request.methodName, args: request.args, depositYocto: 0n });
    return { ...result, request };
  }
}
