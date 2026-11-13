import { parseYocto } from "../packages/domain/src/studio/index.ts";
import { openJobStore } from "../packages/persistence/src/job-store.ts";
import { assertContractIdentity } from "../packages/chain/src/index.ts";
import { readWorkerConfig } from "../apps/worker/src/config.ts";
import { runStructuredProbe } from "../apps/worker/src/near-ai/client.ts";

if (parseYocto("1000000000000000000000000") !== 1_000_000_000_000_000_000_000_000n) {
  throw new Error("Domain import check failed");
}

const store = openJobStore(":memory:");
store.enqueue({ id: "offline-import-check", releaseId: "studio-check", inputDigest: "0".repeat(64) });
store.close();
assertContractIdentity({ networkId: "testnet", contractId: "studio.testnet" });
readWorkerConfig({ NEXT_PUBLIC_NEAR_NETWORK: "testnet" });
void runStructuredProbe;
console.log("Offline TypeScript imports and SQLite initialization passed.");
