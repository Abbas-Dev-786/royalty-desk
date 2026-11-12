import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { Account, JsonRpcProvider, KeyPair, actions, getTransactionLastResult, parseNearAmount } from "near-api-js";
import { runSandboxCommand, startSandbox, stopSandbox } from "./process.mjs";
import { addStudioAgent, addStudioAsset, addStudioPolicy, addWorkVersion, attestStudioAssetRights, createStudio, createStudioProject, createStudioWork, openDatabase, reviewStudioAsset } from "@royaltydesk/persistence";
import { StudioReleaseAgentService } from "../../apps/worker/src/studio/release-agents.ts";

const wasmPath = resolve("contracts/studio/target/near/studio_contract.wasm");
const home = await mkdtemp(join(tmpdir(), "studio-journey-"));
const provider = new JsonRpcProvider({ url: "http://127.0.0.1:3030" });
const gas = 100_000_000_000_000n;
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const hash = (character) => character.repeat(64);
let sandbox;

async function send(account, contractId, method, args, deposit = 0n) {
  const tx = await account.signAndSendTransaction({ receiverId: contractId, actions: [actions.functionCall(method, args, gas, deposit)], waitUntil: "FINAL" });
  assert.ok(!("Failure" in tx.status), `${method} failed: ${JSON.stringify(tx.status)}`);
  return { result: getTransactionLastResult(tx), txHash: tx.transaction.hash };
}
async function rejected(account, contractId, method, args, deposit = 0n) {
  try {
    const tx = await account.signAndSendTransaction({ receiverId: contractId, actions: [actions.functionCall(method, args, gas, deposit)], waitUntil: "FINAL", throwOnFailure: false });
    if ("Failure" in tx.status) return JSON.stringify(tx.status.Failure);
    throw new Error(`${method} unexpectedly succeeded`);
  } catch (error) {
    if (String(error).includes("unexpectedly succeeded")) throw error;
    return String(error);
  }
}
async function account(root, id, near = "5") {
  const key = KeyPair.fromRandom("ed25519");
  await root.createAccount({ newAccountId: id, publicKey: key.getPublicKey(), nearToTransfer: parseNearAmount(near) });
  return new Account(id, provider, key.toString());
}
function release(work_id, version, kind, media_hash, price_yocto, shares, tracks, policy_epoch) {
  return { work_id, version, kind, media_hash, metadata_hash: hash("b"), split_hash: digest(shares), track_order_hash: digest(tracks), price_yocto, shares, tracks, policy_epoch };
}

try {
  await runSandboxCommand(home, "init");
  sandbox = await startSandbox(home);
  const validator = JSON.parse(await readFile(join(home, "validator_key.json"), "utf8"));
  const rootId = validator.account_id ?? "test.near";
  const root = new Account(rootId, provider, validator.secret_key);
  const suffix = `s${Date.now().toString(36)}`;
  const contract = await account(root, `studio-${suffix}.${rootId}`, "10");
  const lyricist = await account(root, `lyricist-${suffix}.${rootId}`);
  const composer = await account(root, `composer-${suffix}.${rootId}`);
  const producer = await account(root, `producer-${suffix}.${rootId}`);
  const buyer = await account(root, `buyer-${suffix}.${rootId}`);
  const outsider = await account(root, `outsider-${suffix}.${rootId}`);
  const contractId = contract.accountId;
  const contractBytes = new Uint8Array(await readFile(wasmPath));
  const wasmHash = createHash("sha256").update(contractBytes).digest("hex");
  await contract.deployContract(contractBytes);
  await send(contract, contractId, "new", { admin_id: rootId });
  const expiry = Date.now() + 24 * 60 * 60 * 1000;
  for (const [who, role] of [[lyricist, "lyricist"], [composer, "composer"], [producer, "producer"]]) await send(root, contractId, "register_agent", { account_id: who.accountId, role, expires_at_ms: expiry, max_actions: who === producer ? 5 : 12 }, 100_000_000_000_000_000_000_000n);
  const restricted = new Map();
  for (const who of [lyricist, composer, producer]) {
    const key = KeyPair.fromRandom("ed25519");
    const methods = who === producer ? ["publish_release"] : ["accept_split"];
    await who.addFunctionCallAccessKey({ publicKey: key.getPublicKey(), contractId, methodNames: methods, allowance: parseNearAmount("0.5") });
    restricted.set(who.accountId, { account: new Account(who.accountId, provider, key.toString()), key: key.getPublicKey().toString(), secretKey: key.toString(), methods });
  }
  const shares = [{ account_id: lyricist.accountId, basis_points: 5000 }, { account_id: composer.accountId, basis_points: 5000 }];
  async function publish(input, human = true) {
    const created = await send(root, contractId, "create_release", { input });
    const commitment = created.result;
    for (const who of [lyricist, composer]) {
      assert.equal(await provider.callFunction({ contractId, method: "has_accepted_split", args: { work_id: input.work_id, version: input.version, account_id: who.accountId } }), false);
      await send(restricted.get(who.accountId).account, contractId, "accept_split", { work_id: input.work_id, version: input.version, split_hash: input.split_hash, policy_epoch: input.policy_epoch });
      assert.equal(await provider.callFunction({ contractId, method: "has_accepted_split", args: { work_id: input.work_id, version: input.version, account_id: who.accountId } }), true);
    }
    const args = { work_id: input.work_id, version: input.version, commitment, policy_epoch: input.policy_epoch };
    if (human) {
      assert.equal(await provider.callFunction({ contractId, method: "has_approved_release", args: { work_id: input.work_id, version: input.version, policy_epoch: input.policy_epoch } }), false);
      assert.match(await rejected(restricted.get(producer.accountId).account, contractId, "publish_release", args), /HUMAN_APPROVAL_REQUIRED/);
      await send(root, contractId, "approve_release", args, 1n);
      assert.equal(await provider.callFunction({ contractId, method: "has_approved_release", args: { work_id: input.work_id, version: input.version, policy_epoch: input.policy_epoch } }), true);
    }
    const published = await send(restricted.get(producer.accountId).account, contractId, "publish_release", args);
    return { commitment, txHash: published.txHash };
  }
  const songOne = release("river-first-light", 1, "song", hash("a"), "10000000000000000000000", shares, [], 1);
  const songTwo = release("riverlight", 1, "song", hash("c"), "10000000000000000000000", shares, [], 1);
  const first = await publish(songOne);
  const second = await publish(songTwo);
  const localPath = join(home, "studio-agent-service.sqlite");
  const local = openDatabase(localPath);
  createStudio(local, "sandbox-studio", rootId);
  createStudioProject(local, { id: "project-service", studioId: "sandbox-studio", title: "Scoped signer test" });
  addStudioAgent(local, { id: "lyricist-service", studioId: "sandbox-studio", accountId: lyricist.accountId, controllerAccountId: rootId, role: "lyricist", active: true });
  addStudioAgent(local, { id: "composer-service", studioId: "sandbox-studio", accountId: composer.accountId, controllerAccountId: rootId, role: "composer", active: true });
  addStudioPolicy(local, { studioId: "sandbox-studio", version: 1, mode: "human_review", maxGenerationCalls: 2, maxPayoutYocto: "0", paused: false });
  createStudioWork(local, { id: "agent-service-song", studioId: "sandbox-studio", projectId: "project-service", kind: "song" });
  addWorkVersion(local, { workId: "agent-service-song", studioId: "sandbox-studio", version: 1, kind: "song", state: "accepted", title: "Scoped signer test", assetHash: hash("e"), metadataHash: hash("b"), priceYocto: "10000000000000000000000", split: [{ agentId: "lyricist-service", basisPoints: 5000 }, { agentId: "composer-service", basisPoints: 5000 }] });
  local.close();
  const serviceRelease = release("agent-service-song", 1, "song", hash("e"), "10000000000000000000000", shares, [], 1);
  await send(root, contractId, "create_release", { input: serviceRelease });
  const keyPath = join(home, "scoped-keys.json");
  await writeFile(keyPath, JSON.stringify({ accounts: Object.fromEntries([[lyricist, "lyricist"], [composer, "composer"], [producer, "producer"]].map(([who, role]) => [`${role}Scoped`, { accountId: who.accountId, publicKey: restricted.get(who.accountId).key, secretKey: restricted.get(who.accountId).secretKey, methods: restricted.get(who.accountId).methods }])) }));
  const acceptanceService = new StudioReleaseAgentService(localPath, contractId, "http://127.0.0.1:3030", keyPath);
  assert.equal((await acceptanceService.accept("agent-service-song", 1)).acceptedAccounts.length, 2);
  assert.equal((await acceptanceService.accept("agent-service-song", 1)).acceptedAccounts.length, 2);
  const checked = openDatabase(localPath);
  assert.equal((checked.prepare("SELECT COUNT(*) AS n FROM studio_split_acceptances WHERE work_id = 'agent-service-song'").get()).n, 2);
  checked.close();
  const tracks = [{ song_id: songOne.work_id, song_version: 1, basis_points: 5000 }, { song_id: songTwo.work_id, song_version: 1, basis_points: 5000 }];
  const album = release("river-dawn", 1, "album", hash("d"), "15000000000000000000000", shares, tracks, 1);
  const albumPublished = await publish(album);
  assert.match(await rejected(restricted.get(lyricist.accountId).account, contractId, "publish_release", { work_id: songOne.work_id, version: 1, commitment: first.commitment, policy_epoch: 1 }), /publish_release|not allowed|MethodNotAllowed/);
  assert.match(await rejected(outsider, contractId, "accept_split", { work_id: songOne.work_id, version: 1, split_hash: songOne.split_hash, policy_epoch: 1 }), /AGENT_REQUIRED/);
  const now = Date.now() + 180_000;
  const songOrder = await send(buyer, contractId, "purchase", { payment_id: "order-song", work_id: songOne.work_id, version: 1, commitment: first.commitment, quote_expires_at_ms: now }, BigInt(songOne.price_yocto));
  const albumOrder = await send(buyer, contractId, "purchase", { payment_id: "order-album", work_id: album.work_id, version: 1, commitment: albumPublished.commitment, quote_expires_at_ms: now }, BigInt(album.price_yocto));
  const tipAmount = 1_000_000_000_000_000_000_000n;
  const songTip = await send(buyer, contractId, "tip", { payment_id: "tip-song", work_id: songOne.work_id, version: 1, commitment: first.commitment, quote_expires_at_ms: now }, tipAmount);
  const albumTip = await send(buyer, contractId, "tip", { payment_id: "tip-album", work_id: album.work_id, version: 1, commitment: albumPublished.commitment, quote_expires_at_ms: now }, tipAmount);
  assert.match(await rejected(buyer, contractId, "purchase", { payment_id: "order-song", work_id: songOne.work_id, version: 1, commitment: first.commitment, quote_expires_at_ms: now }, BigInt(songOne.price_yocto)), /PAYMENT_DUPLICATE_OR_LIMIT/);
  assert.match(await rejected(buyer, contractId, "purchase", { payment_id: "underpaid", work_id: songOne.work_id, version: 1, commitment: first.commitment, quote_expires_at_ms: now }, 1n), /PRICE_MISMATCH/);
  const refund = await send(root, contractId, "refund_payment", { payment_id: "order-song" }, 1n);
  const refunded = await provider.callFunction({ contractId, method: "get_payment", args: { payment_id: "order-song" } });
  assert.equal(refunded.status, "refunded");
  assert.equal(await provider.callFunction({ contractId, method: "get_escrow_yocto", args: {} }), (BigInt(album.price_yocto) + tipAmount * 2n).toString());
  assert.match(await rejected(outsider, contractId, "allocate_payment", { payment_id: "order-album" }), /ADMIN_REQUIRED/);
  for (const paymentId of ["order-album", "tip-song", "tip-album"]) await send(root, contractId, "allocate_payment", { payment_id: paymentId });
  assert.match(await rejected(root, contractId, "allocate_payment", { payment_id: "order-album" }), /PAYMENT_NOT_ALLOCATABLE/);
  assert.match(await rejected(root, contractId, "refund_payment", { payment_id: "order-album" }, 1n), /REFUND_ALREADY_ACTIVE_OR_ALLOCATED/);
  const expectedEach = (BigInt(album.price_yocto) + tipAmount * 2n) / 2n;
  for (const recipient of [lyricist, composer]) {
    const earnings = await provider.callFunction({ contractId, method: "get_earnings", args: { account_id: recipient.accountId } });
    assert.equal(earnings.owed_yocto, expectedEach.toString());
    assert.match(await rejected(outsider, contractId, "request_payout", { payout_id: `forbidden-${recipient.accountId}`, recipient_id: recipient.accountId }, 1n), /PAYOUT_CALLER_FORBIDDEN/);
    assert.match(await rejected(recipient, contractId, "request_payout", { payout_id: `approval-required-${recipient.accountId}`, recipient_id: recipient.accountId }, 1n), /PAYOUT_CALLER_FORBIDDEN/);
    const payoutId = `sandbox-${recipient === lyricist ? "lyricist" : "composer"}`;
    await send(root, contractId, "request_payout", { payout_id: payoutId, recipient_id: recipient.accountId }, 1n);
    const payout = await provider.callFunction({ contractId, method: "get_payout", args: { payout_id: payoutId } });
    assert.equal(payout.status, "paid");
    assert.equal(payout.amount_yocto, expectedEach.toString());
    const settled = await provider.callFunction({ contractId, method: "get_earnings", args: { account_id: recipient.accountId } });
    assert.equal(settled.owed_yocto, "0");
    assert.equal(settled.pending_yocto, "0");
    assert.equal(settled.paid_yocto, expectedEach.toString());
    assert.match(await rejected(root, contractId, "request_payout", { payout_id: payoutId, recipient_id: recipient.accountId }, 1n), /PAYOUT_DUPLICATE_OR_LIMIT/);
  }
  assert.equal(await provider.callFunction({ contractId, method: "get_escrow_yocto", args: {} }), "0");
  assert.equal(await provider.callFunction({ contractId, method: "get_paid_payout_yocto", args: {} }), (expectedEach * 2n).toString());
  await send(root, contractId, "unpublish_release", { work_id: songTwo.work_id, version: 1 }, 1n);
  assert.match(await rejected(root, contractId, "publish_release", { work_id: songTwo.work_id, version: 1, commitment: second.commitment, policy_epoch: 1 }), /PUBLICATION_STALE/);
  assert.match(await rejected(buyer, contractId, "purchase", { payment_id: "unpublished", work_id: album.work_id, version: 1, commitment: albumPublished.commitment, quote_expires_at_ms: now }, BigInt(album.price_yocto)), /ALBUM_SONG_UNPUBLISHED/);
  await send(root, contractId, "set_policy", { input: { epoch: 2, human_review: false, paused: false, max_price_yocto: "100000000000000000000000", max_tip_yocto: "1000000000000000000000000" } }, 1n);
  assert.match(await rejected(root, contractId, "create_release", { input: release("x".repeat(65), 1, "song", hash("a"), songOne.price_yocto, shares, [], 2) }), /WORK_ID_INVALID/);
  const revised = release(songOne.work_id, 2, "song", hash("e"), songOne.price_yocto, shares, [], 2);
  const revision = await publish(revised, false);
  const autonomousLocal = openDatabase(localPath);
  addStudioPolicy(autonomousLocal, { studioId: "sandbox-studio", version: 2, mode: "autonomous", maxGenerationCalls: 2, maxPayoutYocto: "0", paused: false });
  addStudioAgent(autonomousLocal, { id: "producer-service", studioId: "sandbox-studio", accountId: producer.accountId, controllerAccountId: rootId, role: "producer", active: true });
  addStudioAgent(autonomousLocal, { id: "reviewer-service", studioId: "sandbox-studio", accountId: `reviewer.${contractId}`, controllerAccountId: rootId, role: "reviewer", active: true, allowedTools: ["review"] });
  createStudioWork(autonomousLocal, { id: "autonomous-song", studioId: "sandbox-studio", projectId: "project-service", kind: "song" });
  addStudioAsset(autonomousLocal, { hash: hash("f"), provider: "test", model: "test", licenseRef: "test", storageKey: "test.bin", mimeType: "audio/mpeg", sizeBytes: 4096 });
  addWorkVersion(autonomousLocal, { workId: "autonomous-song", studioId: "sandbox-studio", version: 1, kind: "song", state: "accepted", title: "Autonomous song", assetHash: hash("f"), metadataHash: hash("b"), priceYocto: "10000000000000000000000", split: [{ agentId: "lyricist-service", basisPoints: 5000 }, { agentId: "composer-service", basisPoints: 5000 }] });
  reviewStudioAsset(autonomousLocal, { assetHash: hash("f"), studioId: "sandbox-studio", reviewerAgentId: "reviewer-service", decision: "accept", notesHash: hash("c") });
  attestStudioAssetRights(autonomousLocal, { assetHash: hash("f"), studioId: "sandbox-studio", adminAccountId: rootId, licenseRef: "test", publicPlayback: true, paidPurchase: true, tips: true, downloads: true });
  autonomousLocal.close();
  const autonomousRelease = release("autonomous-song", 1, "song", hash("f"), songOne.price_yocto, shares, [], 2);
  await send(root, contractId, "create_release", { input: autonomousRelease });
  const autonomousResult = await acceptanceService.accept("autonomous-song", 1);
  assert.equal(autonomousResult.published, true);
  assert.equal((await acceptanceService.accept("autonomous-song", 1)).published, true);
  const autonomousChecked = openDatabase(localPath);
  const publishedHash = autonomousChecked.prepare("SELECT chain_tx_hash FROM studio_publications WHERE work_id = 'autonomous-song'").get().chain_tx_hash;
  assert.ok(publishedHash);
  // Simulate a crash after the on-chain publication finalized but before the local receipt was saved.
  autonomousChecked.prepare("DELETE FROM studio_publications WHERE work_id = 'autonomous-song'").run();
  autonomousChecked.prepare("UPDATE studio_external_operations SET status = 'unknown', result_hash = NULL WHERE logical_key = 'publication:autonomous-song:1'").run();
  autonomousChecked.close();
  assert.equal((await acceptanceService.accept("autonomous-song", 1)).published, true);
  const recovered = openDatabase(localPath);
  assert.equal(recovered.prepare("SELECT chain_tx_hash FROM studio_publications WHERE work_id = 'autonomous-song'").get().chain_tx_hash, publishedHash);
  recovered.close();
  assert.match(await rejected(producer, contractId, "create_release", { input: release("extra-song", 1, "song", hash("f"), songOne.price_yocto, shares, [], 2) }), /AGENT_ACTION_BUDGET_EXHAUSTED/);
  assert.equal((await provider.callFunction({ contractId, method: "get_release", args: { work_id: songOne.work_id, version: 1 } })).commitment, first.commitment);
  assert.equal((await provider.callFunction({ contractId, method: "get_release", args: { work_id: songOne.work_id, version: 1 } })).published, false);
  assert.match(await rejected(buyer, contractId, "purchase", { payment_id: "stale-version", work_id: songOne.work_id, version: 1, commitment: first.commitment, quote_expires_at_ms: now }, BigInt(songOne.price_yocto)), /RELEASE_STALE_OR_UNPUBLISHED/);
  await send(root, contractId, "revoke_agent", { account_id: composer.accountId }, 1n);
  assert.match(await rejected(restricted.get(composer.accountId).account, contractId, "accept_split", { work_id: songOne.work_id, version: 2, split_hash: revised.split_hash, policy_epoch: 2 }), /AGENT_REVOKED_OR_EXPIRED/);
  await send(buyer, contractId, "tip", { payment_id: "tip-failure-probe", work_id: songOne.work_id, version: 2, commitment: revision.commitment, quote_expires_at_ms: Date.now() + 180_000 }, tipAmount);
  await send(root, contractId, "allocate_payment", { payment_id: "tip-failure-probe" });
  const competingPayouts = await Promise.allSettled([
    send(root, contractId, "request_payout", { payout_id: "race-admin-lyricist", recipient_id: lyricist.accountId }, 1n),
    send(lyricist, contractId, "request_payout", { payout_id: "race-agent-lyricist", recipient_id: lyricist.accountId }, 1n)
  ]);
  assert.equal(competingPayouts.filter((entry) => entry.status === "fulfilled").length, 1);
  assert.equal(competingPayouts.filter((entry) => entry.status === "rejected").length, 1);
  const racedEarnings = await provider.callFunction({ contractId, method: "get_earnings", args: { account_id: lyricist.accountId } });
  assert.equal(racedEarnings.owed_yocto, "0");
  assert.equal(racedEarnings.paid_yocto, (expectedEach + tipAmount / 2n).toString());
  await composer.signAndSendTransaction({ receiverId: composer.accountId, actions: [actions.deleteAccount(rootId)], waitUntil: "FINAL" });
  await send(root, contractId, "request_payout", { payout_id: "failed-composer-transfer", recipient_id: composer.accountId }, 1n);
  const failedPayout = await provider.callFunction({ contractId, method: "get_payout", args: { payout_id: "failed-composer-transfer" } });
  assert.equal(failedPayout.status, "failed");
  const restored = await provider.callFunction({ contractId, method: "get_earnings", args: { account_id: composer.accountId } });
  assert.equal(restored.owed_yocto, (tipAmount / 2n).toString());
  assert.equal(restored.pending_yocto, "0");
  assert.equal(await provider.callFunction({ contractId, method: "get_escrow_yocto", args: {} }), (tipAmount / 2n).toString());
  await send(root, contractId, "set_policy", { input: { epoch: 3, human_review: false, paused: true, max_price_yocto: "100000000000000000000000", max_tip_yocto: "1000000000000000000000000" } }, 1n);
  assert.match(await rejected(buyer, contractId, "tip", { payment_id: "paused-tip", work_id: songOne.work_id, version: 2, commitment: revision.commitment, quote_expires_at_ms: now }, tipAmount), /STUDIO_PAUSED/);
  console.log(JSON.stringify({ status: "pass", network: "sandbox", contractId, wasmHash, agentKeys: [...restricted.values()].map(({ key, methods }) => ({ key, methods })), publicationTxHashes: [first.txHash, second.txHash, albumPublished.txHash, revision.txHash], paymentTxHashes: [songOrder.txHash, albumOrder.txHash, songTip.txHash, albumTip.txHash], refundTxHash: refund.txHash, payments: ["order-song", "order-album", "tip-song", "tip-album"] }));
} finally {
  stopSandbox(sandbox);
  const safe = resolve(tmpdir()) + sep;
  if (!resolve(home).startsWith(safe)) throw new Error("Unsafe sandbox cleanup target");
  await rm(home, { recursive: true, force: true });
}
