import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, JsonRpcProvider, actions } from "near-api-js";

const root = resolve("private/studio-v2/testnet");
const deployment = JSON.parse(readFileSync(resolve(root, "bootstrap.json"), "utf8"));
const journey = JSON.parse(readFileSync(resolve(root, "journey.json"), "utf8"));
const contractId = deployment.accountId;
const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" });
const listener = new Account(journey.accounts.listener.accountId, provider, journey.accounts.listener.secretKey);
const journalPath = resolve("private/studio-v2/phase05/real-commerce-journal.json");
const journal = existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, "utf8")) : { contractId, payments: {} };
assert.equal(journal.contractId, contractId);
const save = () => writeFileSync(journalPath, JSON.stringify(journal, null, 2));
const getPayment = (paymentId) => provider.callFunction({ contractId, method: "get_payment", args: { payment_id: paymentId }, blockQuery: { finality: "final" } });
const releases = [
  { workId: "song-phase03-1", price: "10000000000000000000000" },
  { workId: "album-phase03", price: "15000000000000000000000" }
];
const operations = [
  { id: "real-phase03-song-purchase", method: "purchase", release: releases[0], amount: releases[0].price },
  { id: "real-phase03-album-purchase", method: "purchase", release: releases[1], amount: releases[1].price },
  { id: "real-phase03-song-tip", method: "tip", release: releases[0], amount: "1000000000000000000000" },
  { id: "real-phase03-album-tip", method: "tip", release: releases[1], amount: "1000000000000000000000" }
];

if (!process.argv.includes("--execute")) {
  console.log(JSON.stringify({ status: "dry_run", contractId, buyer: listener.accountId, operations: operations.map(({ id, method, release, amount }) => ({ id, method, workId: release.workId, amountYocto: amount })) }, null, 2));
  process.exit(0);
}

const startingEscrow = BigInt(await provider.callFunction({ contractId, method: "get_escrow_yocto", args: {}, blockQuery: { finality: "final" } }));
const existingIds = new Set();
for (const operation of operations) {
  const release = await provider.callFunction({ contractId, method: "get_release", args: { work_id: operation.release.workId, version: 2 }, blockQuery: { finality: "final" } });
  assert.ok(release?.published && release.price_yocto === operation.release.price, `Release unavailable or price changed: ${operation.release.workId}`);
  const existing = await getPayment(operation.id);
  if (existing) {
    assert.equal(existing.status, "finalized");
    assert.equal(existing.work_id, operation.release.workId);
    assert.equal(existing.version, 2);
    assert.equal(existing.gross_yocto, operation.amount);
    assert.equal(existing.commitment, release.commitment);
    existingIds.add(operation.id);
    continue;
  }
  assert.ok(!journal.payments[operation.id]?.submitting, `UNKNOWN_TX_OUTCOME:${operation.id}; reconcile before retry`);
  journal.payments[operation.id] = { submitting: true, workId: operation.release.workId, method: operation.method, amountYocto: operation.amount };
  save();
  const args = { payment_id: operation.id, work_id: operation.release.workId, version: 2, commitment: release.commitment, quote_expires_at_ms: Date.now() + 240_000 };
  const tx = await listener.signAndSendTransaction({ receiverId: contractId, actions: [actions.functionCall(operation.method, args, 100_000_000_000_000n, BigInt(operation.amount))], waitUntil: "FINAL", throwOnFailure: false });
  if (typeof tx.status === "object" && "Failure" in tx.status) throw new Error(`${operation.id} failed: ${JSON.stringify(tx.status.Failure)}`);
  journal.payments[operation.id] = { ...journal.payments[operation.id], submitting: false, transactionHash: tx.transaction.hash };
  save();
  const payment = await getPayment(operation.id);
  assert.ok(payment && payment.status === "finalized" && payment.gross_yocto === operation.amount && payment.commitment === release.commitment, `Final payment mismatch: ${operation.id}`);
}
const expectedIncrease = operations.filter((operation) => !existingIds.has(operation.id)).reduce((sum, operation) => sum + BigInt(operation.amount), 0n);
const endingEscrow = BigInt(await provider.callFunction({ contractId, method: "get_escrow_yocto", args: {}, blockQuery: { finality: "final" } }));
assert.equal(endingEscrow, startingEscrow + expectedIncrease, "Escrow does not match finalized payments");
console.log(JSON.stringify({ status: "pass", contractId, buyer: listener.accountId, escrowBeforeYocto: String(startingEscrow), escrowAfterYocto: String(endingEscrow), payments: operations.map((operation) => ({ id: operation.id, workId: operation.release.workId, method: operation.method, amountYocto: operation.amount, transactionHash: journal.payments[operation.id]?.transactionHash ?? null })) }, null, 2));
