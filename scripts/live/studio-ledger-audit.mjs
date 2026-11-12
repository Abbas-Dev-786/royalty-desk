import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JsonRpcProvider } from "near-api-js";

const root = resolve("private/studio-v2");
const deployment = JSON.parse(readFileSync(resolve(root, "testnet/bootstrap.json"), "utf8"));
const commerce = JSON.parse(readFileSync(resolve(root, "phase05/real-commerce-journal.json"), "utf8"));
const payouts = JSON.parse(readFileSync(resolve(root, "phase05/real-payout-journal.json"), "utf8"));
const contractId = deployment.accountId;
assert.equal(commerce.contractId, contractId);
assert.equal(payouts.contractId, contractId);
const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" });
const view = (method, args = {}) => provider.callFunction({ contractId, method, args, blockQuery: { finality: "final" } });
const paymentIds = ["real-phase03-song-purchase", "real-phase03-album-purchase", "real-phase03-song-tip", "real-phase03-album-tip"];
const expected = new Map();
let total = 0n;

function distribute(amount, shares) {
  let remainder = amount;
  for (let index = 0; index < shares.length; index += 1) {
    const share = shares[index];
    const portion = index + 1 === shares.length ? remainder : amount * BigInt(share.basis_points) / 10_000n;
    remainder -= portion;
    expected.set(share.account_id, (expected.get(share.account_id) ?? 0n) + portion);
  }
  assert.equal(remainder, 0n);
}

for (const paymentId of paymentIds) {
  const payment = await view("get_payment", { payment_id: paymentId });
  assert.ok(payment?.status === "finalized" && payment.allocated_yocto === payment.gross_yocto, `Unallocated payment: ${paymentId}`);
  assert.ok(commerce.payments[paymentId]?.transactionHash, `Missing transaction journal: ${paymentId}`);
  const receipt = await provider.viewTransactionStatus({ txHash: commerce.payments[paymentId].transactionHash, accountId: payment.buyer_id, waitUntil: "FINAL" });
  assert.ok(typeof receipt.status === "object" && ("SuccessValue" in receipt.status || "SuccessReceiptId" in receipt.status), `Transaction not final: ${paymentId}`);
  assert.equal(receipt.transaction.receiver_id, contractId);
  const release = await view("get_release", { work_id: payment.work_id, version: payment.version });
  assert.ok(release && release.commitment === payment.commitment);
  const gross = BigInt(payment.gross_yocto);
  total += gross;
  if (release.kind === "song") distribute(gross, release.shares);
  else {
    let remainder = gross;
    for (let index = 0; index < release.tracks.length; index += 1) {
      const track = release.tracks[index];
      const portion = index + 1 === release.tracks.length ? remainder : gross * BigInt(track.basis_points) / 10_000n;
      remainder -= portion;
      const song = await view("get_release", { work_id: track.song_id, version: track.song_version });
      assert.equal(song?.kind, "song");
      distribute(portion, song.shares);
    }
    assert.equal(remainder, 0n);
  }
}
assert.equal([...expected.values()].reduce((sum, value) => sum + value, 0n), total);
const payoutResults = [];
for (const [recipientId, amount] of expected) {
  const payoutId = `phase07-real-${recipientId.split(".")[0]}`;
  const payout = await view("get_payout", { payout_id: payoutId });
  assert.ok(payout?.status === "paid" && payout.recipient_id === recipientId && BigInt(payout.amount_yocto) === amount);
  const txHash = payouts.operations[`payout:${payoutId}`]?.transactionHash;
  assert.ok(txHash, `Missing payout journal: ${payoutId}`);
  const receipt = await provider.viewTransactionStatus({ txHash, accountId: contractId, waitUntil: "FINAL" });
  assert.ok(typeof receipt.status === "object" && ("SuccessValue" in receipt.status || "SuccessReceiptId" in receipt.status));
  assert.equal(receipt.transaction.receiver_id, contractId);
  const earnings = await view("get_earnings", { account_id: recipientId });
  assert.ok(BigInt(earnings.paid_yocto) >= amount);
  payoutResults.push({ accountId: recipientId, allocatedYocto: String(amount), payoutId, transactionHash: txHash, status: payout.status });
}
console.log(JSON.stringify({ status: "pass", contractId, paymentCount: paymentIds.length, grossYocto: String(total), allocatedYocto: String([...expected.values()].reduce((sum, value) => sum + value, 0n)), payoutResults }, null, 2));
