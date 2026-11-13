import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, JsonRpcProvider, actions } from "near-api-js";

const guardianId = process.argv.find((value) => value.startsWith("--guardian-id="))?.slice("--guardian-id=".length) ?? process.env.STUDIO_GUARDIAN_ID;
if (!guardianId || !/^[a-z0-9._-]+\.testnet$/.test(guardianId)) throw new Error("Pass --guardian-id=<testnet account>");
const manifestPath = resolve("private/studio-v2/testnet/bootstrap.json");
const secretPath = resolve("private/studio-v2/testnet/contract-key.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const secret = JSON.parse(readFileSync(secretPath, "utf8"));
if (manifest.accountId !== secret.accountId || manifest.publicKey !== secret.publicKey || guardianId === manifest.accountId) throw new Error("Studio account or guardian identity mismatch");
const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" });
const current = await provider.callFunction({ contractId: manifest.accountId, method: "get_guardian", args: {} });
if (current === guardianId) {
  console.log(JSON.stringify({ status: "already_transferred", contractId: manifest.accountId, guardianId }));
  process.exit(0);
}
if (current !== manifest.accountId) throw new Error("Guardian is already a different account; reconcile before changing authority");
if (!process.argv.includes("--execute")) {
  console.log(JSON.stringify({ status: "dry_run", action: "one-time transfer of emergency and policy authority", contractId: manifest.accountId, from: current, guardianId }));
  process.exit(0);
}
await provider.viewAccount({ accountId: guardianId });
const account = new Account(manifest.accountId, provider, secret.secretKey);
const result = await account.signAndSendTransaction({ receiverId: manifest.accountId, actions: [actions.functionCall("transfer_guardian", { guardian_id: guardianId }, 100_000_000_000_000n, 1n)], waitUntil: "FINAL", throwOnFailure: false });
if (typeof result.status === "object" && "Failure" in result.status) throw new Error("Guardian handover failed on chain");
if (await provider.callFunction({ contractId: manifest.accountId, method: "get_guardian", args: {} }) !== guardianId) throw new Error("Guardian handover outcome needs chain reconciliation");
manifest.guardianId = guardianId;
manifest.guardianTransferTxHash = result.transaction.hash;
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ status: "transferred", contractId: manifest.accountId, guardianId, transactionHash: result.transaction.hash }));
