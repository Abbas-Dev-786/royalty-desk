import { parseNearAmount } from "../packages/domain/src/money/amount.ts";
import { openJobStore } from "../packages/persistence/src/job-store.ts";
import { assertContractIdentity } from "../packages/chain/src/index.ts";
import { readWorkerConfig } from "../apps/worker/src/config.ts";
import { runStructuredProbe } from "../apps/worker/src/near-ai/client.ts";

if (parseNearAmount("1") !== 1_000_000_000_000_000_000_000_000n) {
  throw new Error("Domain import check failed");
}

const store = openJobStore(":memory:");
store.enqueue({ id: "offline-import-check", releaseId: "release-check", inputDigest: "0".repeat(64) });
store.close();
assertContractIdentity({ networkId: "testnet", contractId: "royaltydesk.testnet" });
readWorkerConfig({ NEXT_PUBLIC_NEAR_NETWORK: "testnet", NEXT_PUBLIC_CONTRACT_ID: "royaltydesk.testnet" });
void runStructuredProbe;
console.log("Offline TypeScript imports and SQLite initialization passed.");
