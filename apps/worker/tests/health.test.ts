import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { readWorkerConfig } from "../src/config.ts";
import { createWorkerHealthServer } from "../src/health-server.ts";

test("P00-WORKER-01 health server starts, reports testnet, and stops", async () => {
  const config = readWorkerConfig({
    NEXT_PUBLIC_NEAR_NETWORK: "testnet",
    STUDIO_WORKER_HOST: "127.0.0.1",
    STUDIO_WORKER_PORT: "3101"
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

test("P00-WORKER-02 configuration rejects mainnet and weak production tokens", () => {
  assert.throws(() => readWorkerConfig({ NEXT_PUBLIC_NEAR_NETWORK: "mainnet" }));
  assert.throws(() => readWorkerConfig({ NEXT_PUBLIC_NEAR_NETWORK: "testnet", NODE_ENV: "production", STUDIO_WORKER_TOKEN: "short" }));
  const preferred = readWorkerConfig({ STUDIO_APP_DB_PATH: "data/studio.sqlite", ROYALTYDESK_DB_PATH: "data/legacy.sqlite", STUDIO_WORKER_TOKEN: "a".repeat(32), ROYALTYDESK_WORKER_TOKEN: "b".repeat(32) });
  assert.ok(preferred.databasePath.endsWith("studio.sqlite"));
  assert.equal(preferred.workerApiToken, "a".repeat(32));
  const legacy = readWorkerConfig({ ROYALTYDESK_DB_PATH: "data/legacy.sqlite", ROYALTYDESK_WORKER_TOKEN: "b".repeat(32) });
  assert.ok(legacy.databasePath.endsWith("legacy.sqlite"));
  assert.equal(legacy.workerApiToken, "b".repeat(32));
});
