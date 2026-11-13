import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, JsonRpcProvider, KeyPair, parseNearAmount } from "near-api-js";

const journeyPath = resolve("private/studio-v2/testnet/journey.json");
if (!existsSync(journeyPath)) throw new Error("Studio testnet journey file is missing");
const journey = JSON.parse(readFileSync(journeyPath, "utf8"));
const contractId = process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID;
if (!contractId || !contractId.endsWith(".testnet")) throw new Error("Studio contract is not configured");
const roles = [
  { owner: "producer", key: "producerAllocateScoped", method: "allocate_payment" },
  { owner: "producer", key: "producerPayoutScoped", method: "request_payout" },
  { owner: "lyricist", key: "lyricistPayoutScoped", method: "request_payout" },
  { owner: "composer", key: "composerPayoutScoped", method: "request_payout" },
  { owner: "reviewer", key: "reviewerPayoutScoped", method: "request_payout" }
];
for (const role of roles) if (!journey.accounts?.[role.owner]?.secretKey || !journey.accounts?.[role.owner]?.accountId) throw new Error(`Missing ${role.owner} account`);
if (!process.argv.includes("--execute")) {
  console.log(JSON.stringify({ status: "dry_run", contractId, keys: roles.map((role) => ({ accountId: journey.accounts[role.owner].accountId, method: role.method, configured: Boolean(journey.accounts[role.key]) })) }));
  process.exit(0);
}
const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" });
async function readAccess(accountId, publicKey) {
  try { return await provider.viewAccessKey({ accountId, publicKey, finalityQuery: { finality: "final" } }); }
  catch (error) { if (error?.name === "AccessKeyDoesNotExistError") return null; throw error; }
}
for (const role of roles) {
  const owner = journey.accounts[role.owner];
  const pendingPath = resolve(`private/studio-v2/testnet/${role.key}.pending.json`);
  const pending = journey.accounts[role.key] ?? (existsSync(pendingPath) ? JSON.parse(readFileSync(pendingPath, "utf8")) : (() => {
    const key = KeyPair.fromRandom("ed25519");
    const record = { accountId: owner.accountId, publicKey: key.getPublicKey().toString(), secretKey: key.toString(), methods: [role.method] };
    writeFileSync(pendingPath, JSON.stringify(record), { flag: "wx", mode: 0o600 });
    return record;
  })());
  if (pending.accountId !== owner.accountId || JSON.stringify(pending.methods) !== JSON.stringify([role.method]) || KeyPair.fromString(pending.secretKey).getPublicKey().toString() !== pending.publicKey) throw new Error(`Pending ${role.key} does not match account and method`);
  let access = await readAccess(owner.accountId, pending.publicKey);
  if (!access) {
    const account = new Account(owner.accountId, provider, owner.secretKey);
    await account.addFunctionCallAccessKey({ publicKey: KeyPair.fromString(pending.secretKey).getPublicKey(), contractId, methodNames: [role.method], allowance: parseNearAmount("0.5") });
    for (let attempt = 0; attempt < 8 && !access; attempt += 1) {
      await new Promise((done) => setTimeout(done, 2_000));
      access = await readAccess(owner.accountId, pending.publicKey);
    }
    if (!access) throw new Error(`Key ${role.key} was submitted but is not visible yet; inspect the chain before retrying`);
  }
  if (access.permission === "FullAccess" || access.permission.FunctionCall.receiver_id !== contractId || JSON.stringify(access.permission.FunctionCall.method_names) !== JSON.stringify([role.method])) throw new Error(`Final ${role.key} permission mismatch`);
  journey.accounts[role.key] = pending;
  writeFileSync(journeyPath, JSON.stringify(journey, null, 2));
  console.log(JSON.stringify({ status: "ready", accountId: owner.accountId, publicKey: pending.publicKey, method: role.method }));
}
