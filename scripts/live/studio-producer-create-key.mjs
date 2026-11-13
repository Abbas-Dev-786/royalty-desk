import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, JsonRpcProvider, KeyPair, parseNearAmount } from "near-api-js";

const journeyPath = resolve("private/studio-v2/testnet/journey.json");
const pendingPath = resolve("private/studio-v2/testnet/producer-create-key.pending.json");
if (!existsSync(journeyPath)) throw new Error("Studio testnet journey file is missing");
const journey = JSON.parse(readFileSync(journeyPath, "utf8"));
const producer = journey.accounts?.producer;
const contractId = process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID;
if (!producer?.accountId || !producer.secretKey || !contractId || !contractId.endsWith(".testnet")) throw new Error("Producer account or studio contract is not configured");
if (journey.accounts.producerCreateScoped) {
  console.log(JSON.stringify({ status: "already_configured", accountId: producer.accountId, method: "create_release" }));
  process.exit(0);
}
if (!process.argv.includes("--execute")) {
  console.log(JSON.stringify({ status: "dry_run", action: "add a create_release-only function-call key to the existing producer account", accountId: producer.accountId, contractId, pendingPath }));
  process.exit(0);
}
const pending = existsSync(pendingPath) ? JSON.parse(readFileSync(pendingPath, "utf8")) : (() => {
  const key = KeyPair.fromRandom("ed25519");
  const record = { accountId: producer.accountId, publicKey: key.getPublicKey().toString(), secretKey: key.toString(), methods: ["create_release"] };
  writeFileSync(pendingPath, JSON.stringify(record), { flag: "wx", mode: 0o600 });
  return record;
})();
if (pending.accountId !== producer.accountId || JSON.stringify(pending.methods) !== JSON.stringify(["create_release"]) || KeyPair.fromString(pending.secretKey).getPublicKey().toString() !== pending.publicKey) throw new Error("Pending key does not match producer account and method");
const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" });
let access;
try { access = await provider.viewAccessKey({ accountId: producer.accountId, publicKey: pending.publicKey, finalityQuery: { finality: "final" } }); } catch { access = null; }
if (!access) {
  const account = new Account(producer.accountId, provider, producer.secretKey);
  await account.addFunctionCallAccessKey({ publicKey: KeyPair.fromString(pending.secretKey).getPublicKey(), contractId, methodNames: ["create_release"], allowance: parseNearAmount("0.5") });
  access = await provider.viewAccessKey({ accountId: producer.accountId, publicKey: pending.publicKey, finalityQuery: { finality: "final" } });
}
if (access.permission === "FullAccess" || access.permission.FunctionCall.receiver_id !== contractId || JSON.stringify(access.permission.FunctionCall.method_names) !== JSON.stringify(["create_release"])) throw new Error("Final producer key permission differs from create_release only");
journey.accounts.producerCreateScoped = pending;
writeFileSync(journeyPath, JSON.stringify(journey, null, 2));
console.log(JSON.stringify({ status: "ready", accountId: producer.accountId, publicKey: pending.publicKey, method: "create_release" }));
