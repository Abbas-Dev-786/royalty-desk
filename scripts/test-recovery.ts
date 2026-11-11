import { strict as assert } from "node:assert";
import { interpretReceipt, interpretTransfer, type ChainOperationDescriptor, type ChainTransactionResponse } from "../packages/chain/src/index.ts";

const operation: ChainOperationDescriptor = {
  operationId: "op-1",
  releaseId: "release-1",
  period: "2026-01",
  action: "execute_payout",
  signerId: "caller.testnet",
  receiverId: "contract.testnet",
  amountYocto: "1000000000000000000000000",
};

const response = {
  status: { SuccessValue: "" },
  transaction: { hash: "tx-1" },
} as unknown as ChainTransactionResponse;

const paidEvidence = { transferReceiptSucceeded: true, callbackReceiptSucceeded: true, contractState: "paid" as const, attemptMatches: true };
const completed = interpretReceipt(operation, response, paidEvidence);
assert.equal(completed.transactionHash, "tx-1");
assert.equal(completed.included, true);
assert.equal(completed.callbackCompleted, true);
assert.equal(completed.succeeded, true);
assert.equal(completed.reconciliationRequired, false);

for (const evidence of [
  { ...paidEvidence, transferReceiptSucceeded: null },
  { ...paidEvidence, callbackReceiptSucceeded: false, contractState: "pending" as const },
  { ...paidEvidence, contractState: "pending" as const },
  { ...paidEvidence, attemptMatches: false }
]) {
  const pending = interpretReceipt(operation, response, evidence);
  assert.equal(pending.succeeded, false);
  assert.equal(pending.reconciliationRequired, true);
}

const failed = interpretReceipt(operation, { status: { Failure: { message: "failed" } }, transaction: { hash: "tx-2" } } as unknown as ChainTransactionResponse, { transferReceiptSucceeded: false, callbackReceiptSucceeded: true, contractState: "available", attemptMatches: true });
assert.equal(failed.succeeded, false);
assert.equal(failed.reconciliationRequired, false);
assert.equal(failed.error !== null, true);
assert.equal(interpretTransfer({ transactionHash: "tx-3", transactionIncluded: true, transactionFailed: false, transferReceiptSucceeded: true, callbackReceiptSucceeded: true, contractState: "refunded", attemptMatches: true }, "refund").status, "refunded");
assert.equal(interpretTransfer({ transactionHash: "tx-4", transactionIncluded: true, transactionFailed: false, transferReceiptSucceeded: true, callbackReceiptSucceeded: false, contractState: "refund_pending", attemptMatches: true }, "refund").status, "reconciliation_required");

console.log(JSON.stringify({ status: "ok", checks: { success: "pass", callbackPending: "pass", failedReceipt: "pass" } }));
