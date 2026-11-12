import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, JsonRpcProvider, KeyPair, actions, getTransactionLastResult, parseNearAmount } from "near-api-js";

const root = resolve("private/studio-v2/testnet");
const manifest = JSON.parse(readFileSync(resolve(root, "bootstrap.json"), "utf8"));
const ownerKey = JSON.parse(readFileSync(resolve(root, "contract-key.json"), "utf8"));
const statePath = resolve(root, "journey.json");
  const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" });
const contractId = manifest.accountId;
const owner = new Account(contractId, provider, ownerKey.secretKey);
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const hash = (character) => character.repeat(64);
const gas = 100_000_000_000_000n;
const state = existsSync(statePath) ? JSON.parse(readFileSync(statePath, "utf8")) : { accounts: {}, transactions: {}, commitments: {} };
function save() { writeFileSync(statePath, JSON.stringify(state, null, 2)); }
async function send(account, method, args, deposit = 0n, label = method) {
  if (state.transactions[label]) return { txHash: state.transactions[label].txHash, result: state.transactions[label].result };
  const tx = await account.signAndSendTransaction({ receiverId: contractId, actions: [actions.functionCall(method, args, gas, deposit)], waitUntil: "FINAL", throwOnFailure: false });
  if ("Failure" in tx.status) throw new Error(`${label} failed: ${JSON.stringify(tx.status.Failure)}`);
  const result = getTransactionLastResult(tx);
  state.transactions[label] = { txHash: tx.transaction.hash, result };
  save();
  return state.transactions[label];
}
async function rejected(account, method, args, deposit, expected) {
  const tx = await account.signAndSendTransaction({ receiverId: contractId, actions: [actions.functionCall(method, args, gas, deposit)], waitUntil: "FINAL", throwOnFailure: false });
  assert.ok("Failure" in tx.status, `${method} unexpectedly succeeded`);
  assert.match(JSON.stringify(tx.status.Failure), expected);
  return tx.transaction.hash;
}
async function child(role) {
  let saved = state.accounts[role];
  if (!saved) {
    const key = KeyPair.fromRandom("ed25519");
    saved = { accountId: `${role}.${contractId}`, publicKey: key.getPublicKey().toString(), secretKey: key.toString() };
    state.accounts[role] = saved;
    save();
  }
  try { await provider.viewAccount({ accountId: saved.accountId }); }
  catch { await owner.createAccount({ newAccountId: saved.accountId, publicKey: KeyPair.fromString(saved.secretKey).getPublicKey(), nearToTransfer: parseNearAmount("1") }); }
  return new Account(saved.accountId, provider, saved.secretKey);
}
function release(work_id, kind, media_hash, price_yocto, shares, tracks) {
  return { work_id, version: 1, kind, media_hash, metadata_hash: hash("b"), split_hash: digest(shares), track_order_hash: digest(tracks), price_yocto, shares, tracks, policy_epoch: 1 };
}

if (!process.argv.includes("--execute")) {
  console.log(JSON.stringify({ status: "dry_run", contractId, statePath, action: "create 3 scoped agent accounts and a listener, publish synthetic commitments, purchase song and album, tip song and album, refund song purchase" }));
  process.exit(0);
}
assert.ok([1, 2].includes(await provider.callFunction({ contractId, method: "get_schema_version", args: {} })));
const lyricist = await child("lyricist");
const composer = await child("composer");
const producer = await child("producer");
const listener = await child("listener");
const agents = [[lyricist, "lyricist"], [composer, "composer"], [producer, "producer"]];
for (const [account, role] of agents) {
  if (!(await provider.callFunction({ contractId, method: "get_agent", args: { account_id: account.accountId } }))) {
    await send(owner, "register_agent", { account_id: account.accountId, role, expires_at_ms: Date.now() + 7 * 86_400_000, max_actions: 100 }, 100_000_000_000_000_000_000_000n, `register-${role}`);
  }
}
const scoped = {};
for (const [account, role] of agents) {
  const keyName = `${role}Scoped`;
  if (!state.accounts[keyName]) {
    const key = KeyPair.fromRandom("ed25519");
    state.accounts[keyName] = { accountId: account.accountId, publicKey: key.getPublicKey().toString(), secretKey: key.toString(), methods: role === "producer" ? ["publish_release"] : ["accept_split"] };
    save();
  }
  const key = state.accounts[keyName];
  const keys = await provider.viewAccessKeyList({ accountId: account.accountId });
  if (!keys.keys.some((entry) => entry.public_key === key.publicKey)) await account.addFunctionCallAccessKey({ publicKey: KeyPair.fromString(key.secretKey).getPublicKey(), contractId, methodNames: key.methods, allowance: parseNearAmount("0.5") });
  scoped[role] = new Account(account.accountId, provider, key.secretKey);
}
const shares = [{ account_id: lyricist.accountId, basis_points: 5000 }, { account_id: composer.accountId, basis_points: 5000 }];
async function publish(input) {
  let chain = await provider.callFunction({ contractId, method: "get_release", args: { work_id: input.work_id, version: 1 } });
  if (!chain) {
    await send(owner, "create_release", { input }, 0n, `create-${input.work_id}`);
    chain = await provider.callFunction({ contractId, method: "get_release", args: { work_id: input.work_id, version: 1 } });
  }
  assert.ok(chain);
  state.commitments[input.work_id] = chain.commitment;
  save();
  for (const [account, role] of [[scoped.lyricist, "lyricist"], [scoped.composer, "composer"]]) await send(account, "accept_split", { work_id: input.work_id, version: 1, split_hash: input.split_hash, policy_epoch: 1 }, 0n, `accept-${role}-${input.work_id}`);
  const args = { work_id: input.work_id, version: 1, commitment: chain.commitment, policy_epoch: 1 };
  await send(owner, "approve_release", args, 1n, `approve-${input.work_id}`);
  if (!chain.published) await send(scoped.producer, "publish_release", args, 0n, `publish-${input.work_id}`);
  return chain.commitment;
}
const songOne = release("testnet-song-one", "song", hash("a"), "10000000000000000000000", shares, []);
const songTwo = release("testnet-song-two", "song", hash("c"), "10000000000000000000000", shares, []);
const first = await publish(songOne);
await publish(songTwo);
const album = release("testnet-album", "album", hash("d"), "15000000000000000000000", shares, [{ song_id: songOne.work_id, song_version: 1, basis_points: 5000 }, { song_id: songTwo.work_id, song_version: 1, basis_points: 5000 }]);
const albumCommitment = await publish(album);
const expiry = Date.now() + 240_000;
for (const [label, method, work, commitment, amount] of [
  ["purchase-song", "purchase", songOne, first, songOne.price_yocto],
  ["purchase-album", "purchase", album, albumCommitment, album.price_yocto],
  ["tip-song", "tip", songOne, first, "1000000000000000000000"],
  ["tip-album", "tip", album, albumCommitment, "1000000000000000000000"]
]) await send(listener, method, { payment_id: label, work_id: work.work_id, version: 1, commitment, quote_expires_at_ms: expiry }, BigInt(amount), label);
const duplicate = await rejected(listener, "purchase", { payment_id: "purchase-song", work_id: songOne.work_id, version: 1, commitment: first, quote_expires_at_ms: Date.now() + 240_000 }, BigInt(songOne.price_yocto), /PAYMENT_DUPLICATE_OR_LIMIT/);
const underpaid = await rejected(listener, "purchase", { payment_id: "underpaid-test", work_id: songOne.work_id, version: 1, commitment: first, quote_expires_at_ms: Date.now() + 240_000 }, 1n, /PRICE_MISMATCH/);
await send(owner, "refund_payment", { payment_id: "purchase-song" }, 1n, "refund-song");
const results = {};
for (const id of ["purchase-song", "purchase-album", "tip-song", "tip-album"]) results[id] = await provider.callFunction({ contractId, method: "get_payment", args: { payment_id: id } });
assert.equal(results["purchase-song"].status, "refunded");
assert.equal(results["purchase-album"].status, "finalized");
assert.equal(await provider.callFunction({ contractId, method: "get_escrow_yocto", args: {} }), "17000000000000000000000");
console.log(JSON.stringify({ status: "pass", network: "testnet", contractId, wasmHash: manifest.wasmHash, agentPermissions: agents.map(([account, role]) => ({ accountId: account.accountId, publicKey: state.accounts[`${role}Scoped`].publicKey, methods: state.accounts[`${role}Scoped`].methods })), transactionHashes: Object.fromEntries(Object.entries(state.transactions).map(([name, value]) => [name, value.txHash])), rejected: { duplicate, underpaid }, payments: Object.fromEntries(Object.entries(results).map(([id, value]) => [id, { status: value.status, grossYocto: value.gross_yocto, commitment: value.commitment }])) }));
