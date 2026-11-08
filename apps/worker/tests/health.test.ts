import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { readWorkerConfig } from "../src/config.ts";
import { createWorkerHealthServer } from "../src/health-server.ts";

test("P00-WORKER-01 health server starts, reports testnet, and stops", async () => {
  const config = readWorkerConfig({
    NEXT_PUBLIC_NEAR_NETWORK: "testnet",
    NEXT_PUBLIC_CONTRACT_ID: "royaltydesk.testnet",
    ROYALTYDESK_WORKER_HOST: "127.0.0.1",
    ROYALTYDESK_WORKER_PORT: "3101"
  });
  const server = createWorkerHealthServer(config);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/health`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: "ok", networkId: "testnet" });
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

test("P00-WORKER-02 configuration rejects mainnet and malformed contract ids", () => {
  assert.throws(() => readWorkerConfig({ NEXT_PUBLIC_NEAR_NETWORK: "mainnet", NEXT_PUBLIC_CONTRACT_ID: "royaltydesk.near" }));
  assert.throws(() => readWorkerConfig({ NEXT_PUBLIC_NEAR_NETWORK: "testnet", NEXT_PUBLIC_CONTRACT_ID: "royaltydesk.near" }));
});
