import assert from "node:assert/strict";
import test from "node:test";
import { ReadFallbackRpcProvider } from "../src/read-fallback-rpc-provider.ts";

const endpoints: [string, string] = ["https://primary.invalid", "https://backup.invalid"];
const success = () => Response.json({ result: { chain_id: "testnet" } });

test("RPC-READ-01: rate-limited reads fall back and reuse the working endpoint", async (context) => {
  const calls: string[] = [];
  context.mock.method(globalThis, "fetch", async (url: string) => {
    calls.push(url);
    return url === endpoints[0] ? new Response("Rate limit exceeded, retry after 47 seconds", { status: 429 }) : success();
  });
  const provider = new ReadFallbackRpcProvider(endpoints);
  assert.equal((await provider.viewNodeStatus()).chain_id, "testnet");
  await provider.viewNodeStatus();
  assert.deepEqual(calls, [endpoints[0], endpoints[1], endpoints[1]]);
});

test("RPC-READ-02: a stalled primary leaves time to use the backup", async (context) => {
  context.mock.method(globalThis, "fetch", (url: string) => url === endpoints[0] ? new Promise<Response>(() => {}) : Promise.resolve(success()));
  const provider = new ReadFallbackRpcProvider(endpoints, 20, Date.now() + 1_000);
  assert.equal((await provider.viewNodeStatus()).chain_id, "testnet");
});

test("RPC-READ-03: later reads cannot exceed the shared deadline", async (context) => {
  let now = 1_000;
  context.mock.method(Date, "now", () => now);
  const fetchMock = context.mock.method(globalThis, "fetch", async () => { now = 1_051; return new Response("Unavailable", { status: 503 }); });
  const provider = new ReadFallbackRpcProvider(endpoints, 100, 1_050);
  await assert.rejects(provider.viewNodeStatus(), /ERR_NEAR_RPC_TIMEOUT/);
  await assert.rejects(provider.viewNodeStatus(), /ERR_NEAR_RPC_TIMEOUT/);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("RPC-READ-04: network failures on every endpoint remain unavailable", async (context) => {
  const fetchMock = context.mock.method(globalThis, "fetch", async () => { throw new TypeError("fetch failed"); });
  await assert.rejects(new ReadFallbackRpcProvider(endpoints).viewNodeStatus(), /ERR_NEAR_RPC_UNAVAILABLE/);
  assert.equal(fetchMock.mock.callCount(), 2);
});

test("RPC-READ-05: a missing release is authoritative and does not fall back", async (context) => {
  const fetchMock = context.mock.method(globalThis, "fetch", async () => Response.json({ result: { result: [...Buffer.from("null")], logs: [] } }));
  const result = await new ReadFallbackRpcProvider(endpoints).callFunction({ contractId: "studio.testnet", method: "get_release", args: {} });
  assert.equal(result, null);
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("RPC-READ-06: contract errors are not retried on another endpoint", async (context) => {
  const fetchMock = context.mock.method(globalThis, "fetch", async () => Response.json({ error: { code: -32602, message: "Invalid params" } }));
  await assert.rejects(new ReadFallbackRpcProvider(endpoints).sendJsonRpc("query", {}), { name: "RpcError" });
  assert.equal(fetchMock.mock.callCount(), 1);
});

test("RPC-READ-07: submissions never use read fallback", async (context) => {
  const fetchMock = context.mock.method(globalThis, "fetch", async () => new Response("Rate limit exceeded", { status: 429 }));
  await assert.rejects(new ReadFallbackRpcProvider(endpoints).sendJsonRpc("send_tx", {}), /ERR_NEAR_RPC_UNAVAILABLE/);
  assert.equal(fetchMock.mock.callCount(), 1);
});
