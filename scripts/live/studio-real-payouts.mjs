import assert from "node:assert/strict";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, JsonRpcProvider, actions } from "near-api-js";

const root = resolve("private/studio-v2/testnet");
const deployment = JSON.parse(readFileSync(resolve(root, "bootstrap.json"), "utf8"));
const key = JSON.parse(readFileSync(resolve(root, "contract-key.json"), "utf8"));
const journey = JSON.parse(readFileSync(resolve(root, "journey.json"), "utf8"));
const contractId = deployment.accountId;
const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" });
const admin = new Account(contractId, provider, key.secretKey);
const journalPath = resolve("private/studio-v2/phase05/real-payout-journal.json");
const journal = existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, "utf8")) : { contractId, operations: {} };
assert.equal(journal.contractId, contractId);
const save = () => writeFileSync(journalPath, JSON.stringify(journal, null, 2));
const view = (method, args = {}) => provider.callFunction({ contractId, method, args, blockQuery: { finality: "final" } });
const paymentIds = ["real-phase03-song-purchase", "real-phase03-album-purchase", "real-phase03-song-tip", "real-phase03-album-tip"];
const recipients = [journey.accounts.lyricist.accountId, journey.accounts.composer.accountId];

if (!process.argv.includes("--execute")) {
  console.log(JSON.stringify({ status: "dry_run", contractId, paymentIds, recipients, action: "allocate four published catalogue payments and pay the two fixed agent accounts" }, null, 2));
  process.exit(0);
}
assert.equal(await view("get_schema_version"), 2);
const escrowBefore = BigInt(await view("get_escrow_yocto"));
let newlyPaid = 0n;
async function submit(label, method, args, deposit = 0n) {
  if (journal.operations[label]?.submitting) throw new Error(`UNKNOWN_TX_OUTCOME:${label}; inspect chain state before retry`);
  journal.operations[label] = { submitting: true, method, args, depositYocto: String(deposit) };
  save();
  const tx = await admin.signAndSendTransaction({ receiverId: contractId, actions: [actions.functionCall(method, args, 100_000_000_000_000n, deposit)], waitUntil: "FINAL", throwOnFailure: false });
  if (typeof tx.status === "object" && "Failure" in tx.status) throw new Error(`${label} failed: ${JSON.stringify(tx.status.Failure)}`);
  journal.operations[label] = { ...journal.operations[label], submitting: false, transactionHash: tx.transaction.hash };
  save();
}
for (const paymentId of paymentIds) {
  const before = await view("get_payment", { payment_id: paymentId });
  assert.ok(before && before.status === "finalized" && (before.allocated_yocto === "0" || before.allocated_yocto === before.gross_yocto), `Payment is unavailable or partly allocated: ${paymentId}`);
  if (before.allocated_yocto === "0") await submit(`allocate:${paymentId}`, "allocate_payment", { payment_id: paymentId });
  const after = await view("get_payment", { payment_id: paymentId });
  assert.equal(after.allocated_yocto, after.gross_yocto);
}
for (const recipientId of recipients) {
  const payoutId = `phase07-real-${recipientId.split(".")[0]}`;
  let payout = await view("get_payout", { payout_id: payoutId });
  if (!payout) {
    const earnings = await view("get_earnings", { account_id: recipientId });
    assert.ok(BigInt(earnings.owed_yocto) > 0n && BigInt(earnings.owed_yocto) <= 100_000_000_000_000_000_000_000n);
    await submit(`payout:${payoutId}`, "request_payout", { payout_id: payoutId, recipient_id: recipientId }, 1n);
    payout = await view("get_payout", { payout_id: payoutId });
    newlyPaid += BigInt(payout.amount_yocto);
  }
  assert.equal(payout.recipient_id, recipientId);
  assert.equal(payout.status, "paid", `Payout not final: ${payoutId}`);
  const earnings = await view("get_earnings", { account_id: recipientId });
  assert.equal(earnings.pending_yocto, "0");
  assert.ok(BigInt(earnings.paid_yocto) >= BigInt(payout.amount_yocto));
}
const escrowAfter = BigInt(await view("get_escrow_yocto"));
assert.equal(escrowAfter, escrowBefore - newlyPaid);
assert.equal(await view("get_pending_payout_yocto"), "0");
console.log(JSON.stringify({ status: "pass", contractId, escrowBeforeYocto: String(escrowBefore), escrowAfterYocto: String(escrowAfter), payouts: await Promise.all(recipients.map(async (recipientId) => { const payoutId = `phase07-real-${recipientId.split(".")[0]}`; return { ...(await view("get_payout", { payout_id: payoutId })), transactionHash: journal.operations[`payout:${payoutId}`]?.transactionHash ?? null }; })) }, null, 2));
