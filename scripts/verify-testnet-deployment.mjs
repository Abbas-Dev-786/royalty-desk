import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { JsonRpcProvider } from "near-api-js";

const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID;
const txHash = process.argv[2] ?? process.env.RELEASE_DEPLOYMENT_TX_HASH;
const upgrade = process.argv[3] === "--upgrade";
const wasmPath = resolve("contracts/royaltydesk/target/near/royaltydesk_contract.wasm");
const outputPath = resolve("plans/evidence/artifacts/testnet-deployment.json");

if (process.env.NEXT_PUBLIC_NEAR_NETWORK !== "testnet" || !contractId?.endsWith(".testnet") || !txHash) {
  throw new Error("Testnet network, contract ID, and deployment transaction hash are required");
}

const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com" });
const localHash = createHash("sha256").update(readFileSync(wasmPath)).digest("hex");
const code = await provider.viewContractCode({ contractId, finality: "final" });
const deployedHash = createHash("sha256").update(code.code).digest("hex");
if (localHash !== deployedHash) throw new Error("Deployed code does not match the local release WASM");

const health = await provider.callFunction({ contractId, method: "health", args: {}, finality: "final" });
if (!health || typeof health !== "object" || !("application" in health) || health.application !== "royaltydesk" || !("network_id" in health) || health.network_id !== "testnet" || !("operator_id" in health) || health.operator_id !== contractId) {
  throw new Error("Contract health does not match the expected testnet initializer");
}

const transaction = await provider.viewTransactionStatus({ txHash, accountId: contractId, waitUntil: "FINAL" });
const actions = transaction.transaction.actions;
const hasInitializer = actions.some((action) => "FunctionCall" in action && action.FunctionCall.method_name === "new");
const hasUnexpectedUpgradeCall = upgrade && actions.some((action) => "FunctionCall" in action);
if (transaction.final_execution_status !== "FINAL" || !("SuccessValue" in transaction.status) || transaction.transaction.signer_id !== contractId || transaction.transaction.receiver_id !== contractId || !actions.some((action) => "DeployContract" in action) || (upgrade ? hasUnexpectedUpgradeCall : !hasInitializer)) {
  throw new Error("Deployment transaction did not finalize successfully for this account");
}

const evidence = {
  schema: "royaltydesk-testnet-deployment/v1",
  verified: true,
  verifiedAt: new Date().toISOString(),
  deploymentKind: upgrade ? "upgrade" : "initial",
  networkId: "testnet",
  contractId,
  transactionHash: txHash,
  wasmSha256: localHash,
  deployedCodeHash: code.hash,
  health
};
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ verified: true, contractId, transactionHash: txHash, wasmSha256: localHash, evidence: outputPath }));
