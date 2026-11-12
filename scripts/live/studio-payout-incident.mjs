import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JsonRpcProvider } from "near-api-js";

const payoutId = process.argv.find((value) => value.startsWith("--payout-id="))?.slice("--payout-id=".length);
const suppliedHash = process.argv.find((value) => value.startsWith("--tx-hash="))?.slice("--tx-hash=".length);
if (!payoutId || !/^[a-zA-Z0-9-]{1,64}$/.test(payoutId) || suppliedHash && !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(suppliedHash)) throw new Error("Pass --payout-id=<exact ID> and optionally --tx-hash=<request transaction>");
const contractId = process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID;
assert.match(contractId ?? "", /^[a-z0-9._-]+\.testnet$/);
const journalPath = resolve("private/studio-v2/phase05/real-payout-journal.json");
const journal = existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, "utf8")) : null;
const txHash = suppliedHash ?? journal?.operations?.[`payout:${payoutId}`]?.transactionHash;
const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" });
const payout = await provider.callFunction({ contractId, method: "get_payout", args: { payout_id: payoutId }, blockQuery: { finality: "final" } });
if (!payout) { console.log(JSON.stringify({ payoutId, status: "not_found", action: "Do not submit a replacement until the original request transaction is reconciled." })); process.exit(0); }
const earnings = await provider.callFunction({ contractId, method: "get_earnings", args: { account_id: payout.recipient_id }, blockQuery: { finality: "final" } });
const incident = { payoutId, recipientId: payout.recipient_id, amountYocto: payout.amount_yocto, chainStatus: payout.status, pendingYocto: earnings.pending_yocto, owedYocto: earnings.owed_yocto, paidYocto: earnings.paid_yocto, transactionHash: txHash ?? null, finalTransaction: null, requestedEvent: false, terminalEvent: null, transferReceipt: null, action: "" };
if (txHash) {
  const receipt = await provider.viewTransactionStatus({ txHash, accountId: contractId, waitUntil: "FINAL" });
  assert.equal(receipt.transaction.hash, txHash);
  assert.equal(receipt.transaction.receiver_id, contractId);
  const action = receipt.transaction.actions.find((entry) => entry && typeof entry === "object" && "FunctionCall" in entry && entry.FunctionCall.method_name === "request_payout");
  assert.ok(action && "FunctionCall" in action && action.FunctionCall.deposit === "1" && receipt.transaction.actions.length === 1, "Not an exact one-yocto payout request");
  const args = JSON.parse(Buffer.from(action.FunctionCall.args, "base64").toString("utf8"));
  assert.equal(args.payout_id, payoutId);
  assert.equal(args.recipient_id, payout.recipient_id);
  incident.finalTransaction = typeof receipt.status === "object" && ("SuccessValue" in receipt.status || "SuccessReceiptId" in receipt.status);
  const outcomes = [receipt.transaction_outcome, ...receipt.receipts_outcome];
  for (const outcome of outcomes) for (const log of outcome.outcome.logs) {
    if (!log.startsWith("EVENT_JSON:")) continue;
    try {
      const event = JSON.parse(log.slice(11));
      if (event.standard !== "studio" || !event.data?.some((entry) => entry.payout_id === payoutId)) continue;
      if (event.event === "payout_requested") incident.requestedEvent = true;
      if (event.event === "payout_paid" || event.event === "payout_failed") incident.terminalEvent = event.event;
    } catch { /* Ignore unrelated malformed logs. */ }
  }
  const transfers = [];
  for (const outcome of receipt.receipts_outcome) {
    const candidate = await provider.viewTransactionReceipt(outcome.id);
    const action = candidate.receipt?.Action?.actions?.find((part) => part && typeof part === "object" && "Transfer" in part);
    if (candidate.receiver_id === payout.recipient_id && action?.Transfer?.deposit === payout.amount_yocto) transfers.push({ receiptId: candidate.receipt_id, result: outcome.outcome.status });
  }
  assert.equal(transfers.length, 1, "Expected exactly one matching child transfer receipt");
  incident.transferReceipt = transfers[0];
}
incident.action = payout.status === "pending" ? "Keep the payout locked. Compare the transfer and callback receipts; do not create another payout for this balance. Escalate a missing callback for contract-level recovery." : payout.status === "paid" ? "No action: the payout is final. Do not retry." : "The transfer failed and owed funds were restored. A new payout ID may be used after fixing the recipient account.";
console.log(JSON.stringify(incident, null, 2));
