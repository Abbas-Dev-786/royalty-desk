import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const networkId = process.env.NEXT_PUBLIC_NEAR_NETWORK ?? "testnet";
const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID;
const wasmPath = resolve(process.env.ROYALTYDESK_WASM_PATH ?? "contracts/royaltydesk/target/near/royaltydesk_contract.wasm");
const outputPath = resolve(process.env.RELEASE_MANIFEST_PATH ?? "plans/evidence/artifacts/release-manifest.json");
const deploymentEvidencePath = resolve(process.env.RELEASE_DEPLOYMENT_EVIDENCE_PATH ?? "plans/evidence/artifacts/testnet-deployment.json");

function sourceRevision() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: process.cwd(), encoding: "utf8" }).trim();
  } catch {
    return process.env.RELEASE_SOURCE_REVISION ?? "working-tree";
  }
}

if (networkId !== "testnet") throw new Error("Release manifest only supports testnet");
if (!contractId || !contractId.endsWith(".testnet")) throw new Error("NEXT_PUBLIC_CONTRACT_ID must be a testnet account");

let bytes;
try {
  bytes = readFileSync(wasmPath);
} catch {
  console.error(`Release artifact not found: ${wasmPath}. Run npm run build first.`);
  process.exit(2);
}
const wasmSha256 = createHash("sha256").update(bytes).digest("hex");
let deployment = { verified: false, transactionHash: null, recordedBy: null };
try {
  const evidence = JSON.parse(readFileSync(deploymentEvidencePath, "utf8"));
  if (evidence.verified === true && evidence.networkId === networkId && evidence.contractId === contractId && evidence.wasmSha256 === wasmSha256 && typeof evidence.transactionHash === "string") {
    deployment = { verified: true, transactionHash: evidence.transactionHash, recordedBy: "verify:deployment" };
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}

const manifest = {
  schema: "royaltydesk-release-manifest/v1",
  status: deployment.verified ? "deployment-verified" : "artifact-recorded-not-deployment-proof",
  generatedAt: new Date().toISOString(),
  sourceRevision: sourceRevision(),
  networkId,
  contractId,
  wasm: {
    path: wasmPath,
    bytes: statSync(wasmPath).size,
    sha256: wasmSha256
  },
  supportedMethods: [
    "health",
    "get_release",
    "get_settlement",
    "create_release",
    "accept_membership",
    "freeze_agreement",
    "approve_agreement",
    "set_mandate",
    "revoke_mandate",
    "open_settlement",
    "revise_settlement",
    "approve_settlement",
    "dispute_settlement",
    "clear_dispute",
    "fund_settlement",
    "finalize_settlement",
    "execute_payout",
    "approve_cancellation",
    "withdraw_refundable"
  ],
  deployment
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: "ok", manifest: outputPath, sha256: manifest.wasm.sha256, contractId }));
