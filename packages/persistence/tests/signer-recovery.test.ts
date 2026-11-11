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

test("PAY-06 top-level success does not complete a transfer operation", async () => {
  const database = openDatabase(":memory:");
  const account = {
    getSigner: () => ({}),
    createSignedTransaction: async () => ({ transaction: { encode: () => new Uint8Array([7]) }, encode: () => new Uint8Array([8]) }),
    provider: { sendTransactionUntil: async () => ({ status: { SuccessValue: "" } }) }
  } as unknown as Account;
  const signer = new RestrictedSigner({ account, contractId: "contract.testnet", allowedMethods: ["execute_payout"], database, keyId: "payout-key" });
  try {
    const result = await signer.call({ operationId: "payout", logicalKey: "payout", releaseId: "release", methodName: "execute_payout", args: { release_id: "release", period: "2026-01", owner_id: "owner.testnet" } });
    assert.equal(result.status, "unknown");
    assert.equal(database.prepare("SELECT status FROM chain_operations WHERE id = 'payout'").get()?.status, "reconciling");
  } finally { database.close(); }
});
