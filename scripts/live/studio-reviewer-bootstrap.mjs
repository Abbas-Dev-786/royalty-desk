import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, JsonRpcProvider, KeyPair, actions, parseNearAmount } from "near-api-js";
import { openDatabase } from "@royaltydesk/persistence";

const root = resolve("private/studio-v2/testnet");
const deployment = JSON.parse(readFileSync(resolve(root, "bootstrap.json"), "utf8"));
const ownerKey = JSON.parse(readFileSync(resolve(root, "contract-key.json"), "utf8"));
const journeyPath = resolve(root, "journey.json");
const journey = JSON.parse(readFileSync(journeyPath, "utf8"));
const contractId = deployment.accountId;
const accountId = `reviewer.${contractId}`;
const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" });
const owner = new Account(contractId, provider, ownerKey.secretKey);
if (!process.argv.includes("--execute")) {
  console.log(JSON.stringify({ status: "dry_run", accountId, action: "create distinct reviewer testnet account, register reviewer role, update derived catalogue identity" }, null, 2));
  process.exit(0);
}
if (!journey.accounts.reviewer) {
  const key = KeyPair.fromRandom("ed25519");
  journey.accounts.reviewer = { accountId, publicKey: key.getPublicKey().toString(), secretKey: key.toString() };
  writeFileSync(journeyPath, JSON.stringify(journey, null, 2));
}
assert.equal(journey.accounts.reviewer.accountId, accountId);
const reviewerKey = KeyPair.fromString(journey.accounts.reviewer.secretKey);
assert.equal(reviewerKey.getPublicKey().toString(), journey.accounts.reviewer.publicKey);
try { await provider.viewAccount({ accountId }); }
catch { await owner.createAccount({ newAccountId: accountId, publicKey: reviewerKey.getPublicKey(), nearToTransfer: parseNearAmount("1") }); }
let agent = await provider.callFunction({ contractId, method: "get_agent", args: { account_id: accountId }, blockQuery: { finality: "final" } });
if (!agent) {
  const tx = await owner.signAndSendTransaction({ receiverId: contractId, actions: [actions.functionCall("register_agent", { account_id: accountId, role: "reviewer", expires_at_ms: Date.now() + 30 * 86_400_000, max_actions: 100 }, 100_000_000_000_000n, 100_000_000_000_000_000_000_000n)], waitUntil: "FINAL", throwOnFailure: false });
  if (typeof tx.status === "object" && "Failure" in tx.status) throw new Error(`Reviewer registration failed: ${JSON.stringify(tx.status.Failure)}`);
  journey.transactions["register-reviewer"] = { txHash: tx.transaction.hash };
  writeFileSync(journeyPath, JSON.stringify(journey, null, 2));
  agent = await provider.callFunction({ contractId, method: "get_agent", args: { account_id: accountId }, blockQuery: { finality: "final" } });
}
assert.equal(agent?.role, "reviewer");
const database = openDatabase(resolve("private/studio-v2/phase05/studio.sqlite"));
try {
  const current = database.prepare("SELECT account_id FROM studio_agents WHERE id = 'reviewer-phase03' AND studio_id = 'studio-phase03'").get();
  assert.ok(current, "Derived reviewer missing");
  if (current.account_id !== accountId) {
    assert.equal(current.account_id, "reviewer.testnet", "Unexpected reviewer identity; manual reconciliation required");
    database.prepare("UPDATE studio_agents SET account_id = ?, controller_account_id = ? WHERE id = 'reviewer-phase03' AND studio_id = 'studio-phase03'").run(accountId, contractId);
  }
} finally { database.close(); }
console.log(JSON.stringify({ status: "ready", accountId, role: agent.role, localIdentityUpdated: true, registrationTransactionHash: journey.transactions["register-reviewer"]?.txHash ?? null }, null, 2));
