import assert from "node:assert/strict";
import test from "node:test";
import { BoundedRpcProvider } from "../src/bounded-rpc-provider.ts";
import { retryRpcRead } from "../src/rpc-rate-limit.ts";

test("a stalled RPC read has a bounded wait", async (context) => {
  context.mock.method(globalThis, "fetch", () => new Promise<Response>(() => {}));
  const provider = new BoundedRpcProvider("https://rpc.invalid", 15);
  await assert.rejects(provider.viewNodeStatus(), /ERR_NEAR_RPC_TIMEOUT/);
});

test("a successful RPC retains the SDK response", async (context) => {
  context.mock.method(globalThis, "fetch", async () => Response.json({ jsonrpc: "2.0", id: "1", result: { chain_id: "testnet" } }));
  const provider = new BoundedRpcProvider("https://rpc.invalid", 100);
  assert.equal((await provider.viewNodeStatus()).chain_id, "testnet");
});

test("successive reads share the page deadline", async (context) => {
  let now = 1000;
  context.mock.method(Date, "now", () => now);
  const fetchMock = context.mock.method(globalThis, "fetch", async () => Response.json({ result: { chain_id: "testnet" } }));
  const provider = new BoundedRpcProvider("https://rpc.invalid", 100, 1050);
  await provider.viewNodeStatus();
  now = 1051;
  await assert.rejects(provider.viewNodeStatus(), /ERR_NEAR_RPC_TIMEOUT/);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("page reads do not wait through an upstream rate-limit cooldown", async (context) => {
  const fetchMock = context.mock.method(globalThis, "fetch", async () => new Response("Rate limit exceeded, retry after 47 seconds", { status: 429 }));
  const provider = new BoundedRpcProvider("https://rpc.invalid", 100, Date.now() + 100);
  await assert.rejects(retryRpcRead(() => provider.viewNodeStatus()), /ERR_NEAR_RPC_UNAVAILABLE/);
  assert.equal(fetchMock.mock.callCount(), 1);
});
