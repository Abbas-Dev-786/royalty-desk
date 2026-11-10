import test from "node:test";
import assert from "node:assert/strict";
import type { Account } from "near-api-js";
import { openDatabase } from "../src/database.ts";
import { RestrictedSigner } from "../../chain/src/restricted-signer.ts";

test("OPS-06 ambiguous broadcast is never automatically submitted again", async () => {
  const database = openDatabase(":memory:");
  let sends = 0;
  const account = {
    getSigner: () => ({}),
    createSignedTransaction: async () => ({ transaction: { encode: () => new Uint8Array([1, 2, 3]) }, encode: () => new Uint8Array([4, 5, 6]) }),
    provider: { sendTransactionUntil: async () => { sends += 1; throw new Error("response lost"); } }
  } as unknown as Account;
  const signer = new RestrictedSigner({ account, contractId: "contract.testnet", allowedMethods: ["approve_settlement"], database, keyId: "key" });
  const operation = { operationId: "operation", logicalKey: "operation", releaseId: "release", methodName: "approve_settlement", args: {} };
  try {
    assert.equal((await signer.call(operation)).status, "unknown");
    assert.equal((await signer.call(operation)).status, "unknown");
    assert.equal(sends, 1);
    const recorded = database.prepare("SELECT signed_identity, transaction_hash FROM chain_operations WHERE id = ?").get(operation.operationId) as { signed_identity?: string; transaction_hash?: string };
    assert.equal(recorded.signed_identity, "BAUG");
    assert.ok(recorded.transaction_hash);
  } finally { database.close(); }
});
