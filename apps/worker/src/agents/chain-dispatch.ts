import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Account, JsonRpcProvider } from "near-api-js";
import type { DatabaseSync } from "node:sqlite";
import type { AgentAction } from "@royaltydesk/domain";
import { RestrictedSigner } from "@royaltydesk/chain";
import { AgentToolDispatcher } from "./tools.ts";
import type { PersonalAgentContext } from "./types.ts";
import type { WorkerConfig } from "../config.ts";

interface ChainMandate { readonly owner_id: string; readonly agent_id: string; readonly agreement_version: string; readonly actions: readonly string[]; readonly max_gross_yocto: string; readonly expires_at_nanoseconds: string; readonly epoch: string; readonly revoked: boolean; }
interface ChainRelease { readonly mandates: readonly ChainMandate[]; }
interface ChainSettlement { readonly status: string; readonly revision: string; readonly agreement_version: string; readonly normalized_statement_hash: string; readonly gross_yocto: string; readonly deduction_evidence_hash: string; readonly allocation_preview_hash: string; }

export async function dispatchAgentAction(database: DatabaseSync, config: WorkerConfig, context: PersonalAgentContext, action: AgentAction) {
  if (!config.agentKeystorePath || !context.agentAccountId || !context.settlement) throw new Error("ERR_AGENT_KEY_CONFIG");
  if (!/^[a-z0-9._-]+\.testnet$/.test(context.agentAccountId)) throw new Error("ERR_AGENT_ACCOUNT");
  const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com" });
  const [release, settlement] = await Promise.all([
    provider.callFunction<ChainRelease>({ contractId: config.contractId, method: "get_release", args: { release_id: context.releaseId } }),
    provider.callFunction<ChainSettlement>({ contractId: config.contractId, method: "get_settlement", args: { release_id: context.releaseId, period: context.settlement.period } })
  ]);
  if (!release || !settlement) throw new Error("ERR_AGENT_CHAIN_STALE");
  const mandate = release.mandates.find((entry) => entry.owner_id === context.ownerAccountId && entry.agent_id === context.agentAccountId && !entry.revoked);
  if (!mandate || mandate.epoch !== context.mandateEpoch || mandate.agreement_version !== context.settlement.agreementVersion || settlement.revision !== context.settlement.revision || settlement.agreement_version !== context.settlement.agreementVersion || settlement.normalized_statement_hash !== context.settlement.normalizedStatementHash || settlement.gross_yocto !== context.settlement.grossYocto || settlement.deduction_evidence_hash !== context.settlement.deductionEvidenceHash || settlement.allocation_preview_hash !== context.settlement.allocationPreviewHash || !["Review", "Held"].includes(settlement.status)) throw new Error("ERR_AGENT_CHAIN_STALE");
  const method = action.type === "recommend_approval" ? "approve_settlement" : action.type === "raise_objection" ? "dispute_settlement" : null;
  if (!method || !mandate.actions.includes(method) || BigInt(mandate.expires_at_nanoseconds) <= BigInt(Date.now()) * 1_000_000n || BigInt(mandate.max_gross_yocto) < BigInt(settlement.gross_yocto)) throw new Error("ERR_AGENT_MANDATE");
  const keyPath = join(resolve(config.agentKeystorePath), `${context.agentAccountId}.json`);
  const keyFile = JSON.parse(await readFile(keyPath, "utf8")) as { private_key?: unknown; secret_key?: unknown; public_key?: unknown };
  const secret = typeof keyFile.private_key === "string" ? keyFile.private_key : keyFile.secret_key;
  if (typeof secret !== "string" || typeof keyFile.public_key !== "string") throw new Error("ERR_AGENT_KEY_FILE");
  const account = new Account(context.agentAccountId, provider, secret as `ed25519:${string}`);
  const accessKey = await account.getAccessKey(keyFile.public_key);
  const permission = accessKey.permission;
  if (typeof permission !== "object" || !permission || !("FunctionCall" in permission) || permission.FunctionCall.receiver_id !== config.contractId || !permission.FunctionCall.method_names.includes(method)) throw new Error("ERR_AGENT_KEY_PERMISSION");
  const signer = new RestrictedSigner({ account, contractId: config.contractId, allowedMethods: [method], database, keyId: `${context.agentAccountId}:${keyFile.public_key}` });
  return new AgentToolDispatcher(signer).dispatch(context, action);
}
