import { readFile } from "node:fs/promises";
import type { DatabaseSync } from "node:sqlite";
import { KeyPair, type KeyPairString } from "near-api-js";
import { requireAccountId, requireStudioId } from "@royaltydesk/domain";

interface AccessKeyView {
  readonly block_height: number;
  readonly permission: "FullAccess" | { readonly FunctionCall: { readonly receiver_id: string; readonly method_names: readonly string[]; readonly allowance?: string | null } };
}

export interface AgentKeyProvider {
  viewAccessKey(input: { readonly accountId: string; readonly publicKey: string; readonly finalityQuery: { readonly finality: "final" } }): Promise<AccessKeyView>;
}

export interface AgentKeyProof {
  readonly agentId: string;
  readonly accountId: string;
  readonly controllerAccountId: string;
  readonly publicKey: string;
  readonly contractId: string;
  readonly allowedMethods: readonly string[];
  readonly blockHeight: number;
}

export async function verifyStudioAgentKey(database: DatabaseSync, provider: AgentKeyProvider, input: {
  readonly agentId: string;
  readonly keyFilePath: string;
  readonly contractId: string;
  readonly allowedMethods: readonly string[];
}): Promise<AgentKeyProof> {
  requireStudioId(input.agentId);
  requireAccountId(input.contractId);
  if (input.allowedMethods.length === 0 || new Set(input.allowedMethods).size !== input.allowedMethods.length || input.allowedMethods.some((name) => !/^[a-z][a-z0-9_]{0,63}$/.test(name))) throw new Error("ERR_STUDIO_KEY_METHODS");
  const agent = database.prepare("SELECT account_id, controller_account_id, active, revoked_at_ms, expires_at_ms, key_reference FROM studio_agents WHERE id = ?").get(input.agentId) as { account_id: string; controller_account_id: string; active: number; revoked_at_ms: number | null; expires_at_ms: number | null; key_reference: string | null } | undefined;
  if (!agent || !agent.active || agent.revoked_at_ms !== null || (agent.expires_at_ms !== null && agent.expires_at_ms <= Date.now())) throw new Error("ERR_STUDIO_KEY_AGENT_INACTIVE");
  if (!agent.key_reference?.startsWith("ed25519:")) throw new Error("ERR_STUDIO_KEY_REFERENCE");
  const keyFile = JSON.parse(await readFile(input.keyFilePath, "utf8")) as unknown;
  if (typeof keyFile !== "object" || keyFile === null) throw new Error("ERR_STUDIO_KEY_FILE");
  const record = keyFile as Record<string, unknown>;
  if (record.account_id !== undefined && record.account_id !== agent.account_id) throw new Error("ERR_STUDIO_KEY_ACCOUNT_MISMATCH");
  const encoded = typeof record.private_key === "string" ? record.private_key : record.secret_key;
  if (typeof encoded !== "string" || !encoded.startsWith("ed25519:")) throw new Error("ERR_STUDIO_KEY_FILE");
  const publicKey = KeyPair.fromString(encoded as KeyPairString).getPublicKey().toString();
  if (publicKey !== agent.key_reference || (record.public_key !== undefined && record.public_key !== publicKey)) throw new Error("ERR_STUDIO_KEY_MISMATCH");
  const accessKey = await provider.viewAccessKey({ accountId: agent.account_id, publicKey, finalityQuery: { finality: "final" } });
  const permission = accessKey.permission;
  if (permission === "FullAccess" || !permission.FunctionCall || permission.FunctionCall.receiver_id !== input.contractId) throw new Error("ERR_STUDIO_KEY_PERMISSION");
  const allowed = permission.FunctionCall.method_names;
  if (allowed.length === 0 || allowed.length !== input.allowedMethods.length || !input.allowedMethods.every((name) => allowed.includes(name))) throw new Error("ERR_STUDIO_KEY_METHODS");
  return { agentId: input.agentId, accountId: agent.account_id, controllerAccountId: agent.controller_account_id, publicKey, contractId: input.contractId, allowedMethods: [...allowed], blockHeight: accessKey.block_height };
}
