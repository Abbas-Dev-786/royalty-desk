import assert from "node:assert/strict";
import test from "node:test";
import { BoundedRpcProvider } from "../src/bounded-rpc-provider.ts";

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
