import { strict as assert } from "node:assert";
import { interpretReceipt, type ChainOperationDescriptor, type ChainTransactionResponse } from "../packages/chain/src/index.ts";

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

const completed = interpretReceipt(operation, response, true);
assert.equal(completed.transactionHash, "tx-1");
assert.equal(completed.included, true);
assert.equal(completed.callbackCompleted, true);
assert.equal(completed.succeeded, true);
assert.equal(completed.reconciliationRequired, false);

const pending = interpretReceipt(operation, response, false);
assert.equal(pending.succeeded, false);
assert.equal(pending.reconciliationRequired, true);

const failed = interpretReceipt(operation, { status: { Failure: { message: "failed" } }, transaction: { hash: "tx-2" } } as unknown as ChainTransactionResponse, false);
assert.equal(failed.succeeded, false);
assert.equal(failed.reconciliationRequired, false);
assert.equal(failed.error !== null, true);

console.log(JSON.stringify({ status: "ok", checks: { success: "pass", callbackPending: "pass", failedReceipt: "pass" } }));
