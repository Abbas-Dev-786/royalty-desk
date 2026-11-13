import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JsonRpcProvider } from "near-api-js";

const contractId = process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID;
if (!contractId?.endsWith(".testnet")) throw new Error("Studio contract is not configured");
const journey = JSON.parse(readFileSync(resolve("private/studio-v2/testnet/journey.json"), "utf8"));
const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" });
const roles = ["producer", "lyricist", "composer", "reviewer"];
const keys = [
  ["producerCreateScoped", "create_release"], ["producerScoped", "publish_release"], ["producerAllocateScoped", "allocate_payment"], ["producerPayoutScoped", "request_payout"],
  ["lyricistScoped", "accept_split"], ["lyricistPayoutScoped", "request_payout"],
  ["composerScoped", "accept_split"], ["composerPayoutScoped", "request_payout"], ["reviewerPayoutScoped", "request_payout"]
];
const agents = [];
const scopedKeys = [];
const nowMs = Date.now();
for (const role of roles) {
  const owner = journey.accounts?.[role];
  if (!owner?.accountId) throw new Error(`Missing ${role} account`);
  const agent = await provider.callFunction({ contractId, method: "get_agent", args: { account_id: owner.accountId } });
  agents.push({ role, accountId: owner.accountId, active: agent?.active === true, expiresAtMs: agent?.expires_at_ms ?? null, renewalDueWithin14Days: agent ? agent.expires_at_ms < nowMs + 14 * 24 * 60 * 60 * 1000 : true, remainingActions: agent ? agent.max_actions - agent.actions_used : null, ready: agent?.active === true && agent.role === role && agent.expires_at_ms > nowMs && agent.max_actions > agent.actions_used });
}
for (const [name, method] of keys) {
  const key = journey.accounts?.[name];
  if (!key?.accountId || !key.publicKey) { scopedKeys.push({ name, method, ready: false, reason: "missing" }); continue; }
  const access = await provider.viewAccessKey({ accountId: key.accountId, publicKey: key.publicKey, finalityQuery: { finality: "final" } });
  const permission = access.permission;
  scopedKeys.push({ name, method, ready: permission !== "FullAccess" && permission.FunctionCall.receiver_id === contractId && JSON.stringify(permission.FunctionCall.method_names) === JSON.stringify([method]) });
}
const ready = agents.every((agent) => agent.ready) && scopedKeys.every((key) => key.ready);
console.log(JSON.stringify({ ready, renewalDue: agents.filter((agent) => agent.renewalDueWithin14Days).map((agent) => agent.accountId), contractId, agents, scopedKeys }));
if (!ready) process.exitCode = 1;
