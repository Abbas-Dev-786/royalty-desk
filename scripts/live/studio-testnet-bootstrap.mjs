import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { Account, JsonRpcProvider, KeyPair, actions } from "near-api-js";

const root = resolve("private/studio-v2/testnet");
const manifestPath = resolve(root, "bootstrap.json");
const keyPath = resolve(root, "contract-key.json");
const wasmPath = resolve("contracts/studio/target/near/studio_contract.wasm");
if (!process.argv.includes("--execute")) {
  console.log(JSON.stringify({ status: "dry_run", action: "create a faucet-funded studio testnet account, save its key under ignored private storage, deploy and initialize the studio WASM", keyPath, manifestPath }));
  process.exit(0);
}
if (!existsSync(wasmPath)) throw new Error("Build the studio contract before testnet deployment");
mkdirSync(root, { recursive: true });
let manifest;
let secret;
if (existsSync(manifestPath) || existsSync(keyPath)) {
  if (!existsSync(manifestPath) || !existsSync(keyPath)) throw new Error("Incomplete existing testnet key material; reconcile before retrying");
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  secret = JSON.parse(readFileSync(keyPath, "utf8"));
  if (manifest.accountId !== secret.accountId || manifest.publicKey !== secret.publicKey) throw new Error("Testnet key manifest mismatch");
} else {
  const key = KeyPair.fromRandom("ed25519");
  const accountId = `studio-rd-${randomBytes(4).toString("hex")}.testnet`;
  secret = { accountId, publicKey: key.getPublicKey().toString(), secretKey: key.toString() };
  manifest = { accountId, publicKey: secret.publicKey, wasmHash: null, deploymentTxHash: null, initialized: false };
  writeFileSync(keyPath, JSON.stringify(secret), { flag: "wx", mode: 0o600 });
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), { flag: "wx" });
}
  const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" });
let onChain = false;
try { await provider.viewAccount({ accountId: manifest.accountId }); onChain = true; } catch { /* Faucet creation has not finalized. */ }
if (!onChain) {
  const mount = `type=bind,source=${resolve(".")},target=/workspace`;
  const command = ["run", "--rm", "--mount", mount, "--workdir", "/workspace", process.env.STUDIO_CONTRACT_IMAGE ?? "studio-contract-toolchain:dev", "near", "account", "create-account", "sponsor-by-faucet-service", manifest.accountId, "use-manually-provided-public-key", manifest.publicKey, "network-config", "testnet", "create"];
  const result = spawnSync("docker", command, { stdio: "inherit", shell: false });
  if (result.error || result.status !== 0) throw new Error(`Testnet faucet account creation failed (${result.status ?? "spawn"}); saved key can be retried safely`);
  await provider.viewAccount({ accountId: manifest.accountId });
}
const account = new Account(manifest.accountId, provider, secret.secretKey);
const wasm = new Uint8Array(readFileSync(wasmPath));
const wasmHash = createHash("sha256").update(wasm).digest("hex");
const deployed = await provider.viewAccount({ accountId: manifest.accountId });
if (deployed.code_hash === "11111111111111111111111111111111") {
  const response = await account.signAndSendTransaction({ receiverId: manifest.accountId, actions: [actions.deployContract(wasm)], waitUntil: "FINAL" });
  if (typeof response.status === "object" && "Failure" in response.status) throw new Error("Studio deployment failed");
  manifest.deploymentTxHash = response.transaction.hash;
  manifest.wasmHash = wasmHash;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
} else {
  const currentCode = await provider.viewContractCode({ contractId: manifest.accountId, blockQuery: { finality: "final" } });
  const currentHash = createHash("sha256").update(currentCode.code).digest("hex");
  if (currentHash === wasmHash) {
    if (manifest.wasmHash !== wasmHash) {
      manifest.wasmHash = wasmHash;
      manifest.reconciledUpgradeWithoutTxHash = true;
      writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }
  } else {
    if (!process.argv.includes("--upgrade")) throw new Error("Existing testnet code differs from the built WASM; pass --upgrade after reviewing the diff");
    if (currentHash !== manifest.wasmHash) throw new Error("On-chain code differs from the recorded deployment; refusing upgrade");
    const previousWasmHash = currentHash;
    const response = await account.signAndSendTransaction({ receiverId: manifest.accountId, actions: [actions.deployContract(wasm)], waitUntil: "FINAL", throwOnFailure: false });
    if (typeof response.status === "object" && "Failure" in response.status) throw new Error("Studio upgrade failed");
    const finalCode = await provider.viewContractCode({ contractId: manifest.accountId, blockQuery: { finality: "final" } });
    if (createHash("sha256").update(finalCode.code).digest("hex") !== wasmHash) throw new Error("Studio upgrade outcome is unknown; reconcile the on-chain code before retrying");
    manifest.upgrades = [...(manifest.upgrades ?? []), { previousWasmHash, wasmHash, transactionHash: response.transaction.hash }];
    manifest.wasmHash = wasmHash;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  }
}
if (deployed.code_hash !== "11111111111111111111111111111111") {
  let schema;
  try { schema = await provider.callFunction({ contractId: manifest.accountId, method: "get_schema_version", args: {} }); } catch { schema = null; }
  if (schema === null) {
    const migration = await account.signAndSendTransaction({ receiverId: manifest.accountId, actions: [actions.functionCall("migrate", {}, 100_000_000_000_000n, 0n)], waitUntil: "FINAL", throwOnFailure: false });
    if (typeof migration.status === "object" && "Failure" in migration.status) throw new Error(`Studio state migration failed: ${JSON.stringify(migration.status.Failure)}`);
    manifest.migrationTxHash = migration.transaction.hash;
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    if (await provider.callFunction({ contractId: manifest.accountId, method: "get_schema_version", args: {} }) !== 2) throw new Error("Studio state migration did not reach schema v2");
  }
}
let initialized = false;
try { initialized = [1, 2].includes(await provider.callFunction({ contractId: manifest.accountId, method: "get_schema_version", args: {} })); } catch { /* New deployment still needs initialization. */ }
if (!initialized) {
  const response = await account.signAndSendTransaction({ receiverId: manifest.accountId, actions: [actions.functionCall("new", { admin_id: manifest.accountId }, 100_000_000_000_000n, 0n)], waitUntil: "FINAL" });
  if (typeof response.status === "object" && "Failure" in response.status) throw new Error("Studio initialization failed");
  manifest.initialized = true;
  manifest.initializationTxHash = response.transaction.hash;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}
console.log(JSON.stringify({ status: "ready", network: "testnet", accountId: manifest.accountId, publicKey: manifest.publicKey, wasmHash, deploymentTxHash: manifest.deploymentTxHash, initializationTxHash: manifest.initializationTxHash ?? null, privateKeyPath: keyPath }));
