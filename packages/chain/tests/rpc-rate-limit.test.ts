import assert from "node:assert/strict";
import test from "node:test";
import { retryRpcRead } from "../src/rpc-rate-limit.ts";

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
