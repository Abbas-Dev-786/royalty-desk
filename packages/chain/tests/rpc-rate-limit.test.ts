import assert from "node:assert/strict";
import test from "node:test";
import type { SignedTransaction } from "near-api-js";
import { retryRpcRead, retrySignedTransactionAfterRateLimit, rpcRateLimitDelayMs } from "../src/rpc-rate-limit.ts";

test("uses the provider cooldown and caps excessive waits", () => {
  assert.equal(rpcRateLimitDelayMs(new Error("rate limit exceeded, retry after 47 seconds", { cause: 429 })), 48_000);
  assert.equal(rpcRateLimitDelayMs(new Error("retry after 500 seconds", { cause: 429 })), 60_000);
  assert.equal(rpcRateLimitDelayMs(new Error("contract rejected")), null);
});

test("retries a rejected read after HTTP 429", async () => {
  let calls = 0;
  const result = await retryRpcRead(async () => {
    calls += 1;
    if (calls === 1) throw new Error("rate limit exceeded, retry after 0 seconds", { cause: 429 });
    return "verified";
  });
  assert.equal(result, "verified");
  assert.equal(calls, 2);
});

test("does not retry unrelated RPC failures", async () => {
  let calls = 0;
  await assert.rejects(() => retryRpcRead(async () => {
    calls += 1;
    throw new Error("contract rejected");
  }), /contract rejected/);
  assert.equal(calls, 1);
});

test("rebroadcasts the identical signed transaction after a 429", async () => {
  const signed = {} as SignedTransaction;
  const seen: SignedTransaction[] = [];
  const result = await retrySignedTransactionAfterRateLimit(signed, async (transaction) => {
    seen.push(transaction);
    if (seen.length === 1) throw new Error("retry after 0 seconds", { cause: 429 });
    return "finalized";
  });
  assert.equal(result, "finalized");
  assert.deepEqual(seen, [signed, signed]);
});
