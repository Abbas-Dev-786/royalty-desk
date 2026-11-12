import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, JsonRpcProvider, actions } from "near-api-js";
import { addStudioPublication, openDatabase, recordStudioProviderPermission, recordStudioPublicationReceipt, StudioMediaStore } from "@royaltydesk/persistence";

const root = resolve("private/studio-v2");
const permissionPath = resolve(root, "rights/elevenlabs-permission.json");
const databasePath = resolve(root, "phase05/studio.sqlite");
const journalPath = resolve(root, "phase05/publish-journal.json");
const deployment = JSON.parse(readFileSync(resolve(root, "testnet/bootstrap.json"), "utf8"));
const adminKey = JSON.parse(readFileSync(resolve(root, "testnet/contract-key.json"), "utf8"));
const journey = JSON.parse(readFileSync(resolve(root, "testnet/journey.json"), "utf8"));
const contractId = deployment.accountId;
const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" });
const admin = new Account(contractId, provider, adminKey.secretKey);
const producer = new Account(journey.accounts.producer.accountId, provider, journey.accounts.producerScoped.secretKey);
const media = new StudioMediaStore(resolve(process.env.STUDIO_MEDIA_PATH ?? "private/studio-media"));
const journal = existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, "utf8")) : { contractId, operations: {} };
assert.equal(journal.contractId, contractId);
function save() { writeFileSync(journalPath, JSON.stringify(journal, null, 2)); }
function digest(value) { return createHash("sha256").update(JSON.stringify(value)).digest("hex"); }
function permissionRecord() {
  if (!existsSync(permissionPath)) return null;
  const record = JSON.parse(readFileSync(permissionPath, "utf8"));
  assert.ok(record.basis === "owner-confirmed-private-permission" || record.basis === "provider-written-reference", "Authorization basis is required");
  assert.ok(typeof record.reference === "string" && record.reference.length >= 8 && record.reference.length <= 512 && !/^REPLACE_/i.test(record.reference), "Non-secret authorization record reference is required");
  if (record.basis === "owner-confirmed-private-permission") assert.match(record.reference, /^owner-confirmation-\d{4}-\d{2}-\d{2}$/, "Owner confirmation must have a dated reference");
  assert.equal(record.studioAccountId, contractId, "Authorization record must target this studio account");
  assert.ok(typeof record.confirmedAtUtc === "string" && Number.isFinite(Date.parse(record.confirmedAtUtc)), "Authorization confirmation timestamp is required");
  assert.equal(record.testnetOnly, true);
  for (const use of ["musicLibrary", "musicStreamingDistribution", "publicPlayback", "paidPurchases", "tips", "downloads"]) assert.equal(record.coveredUses?.[use], true, `Permission scope omits ${use}`);
  return record;
}
async function submit(label, account, method, args, deposit) {
  const inputHash = digest({ method, args, deposit: String(deposit) });
  const previous = journal.operations[label];
  if (previous?.status === "final") { assert.equal(previous.inputHash, inputHash); return previous.transactionHash; }
  if (previous?.status === "submitting") throw new Error(`UNKNOWN_TX_OUTCOME:${label}; reconcile before any retry`);
  journal.operations[label] = { status: "submitting", inputHash, startedAtMs: Date.now() };
  save();
  const result = await account.signAndSendTransaction({ receiverId: contractId, actions: [actions.functionCall(method, args, 100_000_000_000_000n, deposit)], waitUntil: "FINAL", throwOnFailure: false });
  if (typeof result.status === "object" && "Failure" in result.status) throw new Error(`${label} failed: ${JSON.stringify(result.status.Failure)}`);
  journal.operations[label] = { status: "final", inputHash, transactionHash: result.transaction.hash };
  save();
  return result.transaction.hash;
}

const database = openDatabase(databasePath);
try {
  const works = ["song-phase03-1", "song-phase03-2", "album-phase03"].map((workId) => {
    const row = database.prepare("SELECT w.kind, w.studio_id, v.asset_hash, v.metadata_hash, v.price_yocto, v.split_json, v.state, a.provider, r.provider_permission_ref, r.public_playback, r.paid_purchase, r.tips, r.downloads, r.expires_at_ms FROM studio_work_versions v JOIN studio_works w ON w.id = v.work_id JOIN studio_assets a ON a.hash = v.asset_hash JOIN studio_asset_rights r ON r.asset_hash = v.asset_hash WHERE v.work_id = ? AND v.version = 2").get(workId);
    assert.ok(row && row.state === "accepted", `Accepted work missing: ${workId}`);
    assert.equal(row.studio_id, "studio-phase03");
    assert.ok(row.public_playback && row.paid_purchase && row.tips && row.downloads, `Rights scope missing: ${workId}`);
    assert.ok(row.expires_at_ms === null || row.expires_at_ms > Date.now(), `Rights expired: ${workId}`);
    assert.ok(database.prepare("SELECT 1 FROM studio_media_reviews WHERE asset_hash = ? AND decision = 'accept'").get(row.asset_hash), `Review missing: ${workId}`);
    assert.ok(!database.prepare("SELECT 1 FROM studio_asset_quarantines WHERE asset_hash = ? AND cleared_at_ms IS NULL").get(row.asset_hash), `Quarantined: ${workId}`);
    media.get(row.asset_hash);
    return { workId, ...row };
  });
  const record = permissionRecord();
  if (!process.argv.includes("--execute")) {
    console.log(JSON.stringify({ status: record ? "ready_for_publication" : "permission_record_required", contractId, permissionPath, authorizationBasis: record?.basis ?? null, releases: works.map((work) => ({ workId: work.workId, kind: work.kind, assetHash: work.asset_hash, permissionRecorded: Boolean(work.provider_permission_ref) })), next: "Record the project owner's confirmed private authorization, then rerun --execute" }, null, 2));
    process.exit(0);
  }
  assert.ok(record, `Missing permission record: ${permissionPath}`);
  assert.equal(process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID, contractId, "Web contract configuration differs from deployment");
  for (const work of works.filter((item) => item.provider === "elevenlabs")) {
    if (work.provider_permission_ref) assert.equal(work.provider_permission_ref, record.reference, "Existing provider reference differs");
    else recordStudioProviderPermission(database, { assetHash: work.asset_hash, studioId: work.studio_id, adminAccountId: contractId, reference: record.reference });
  }
  const policy = await provider.callFunction({ contractId, method: "get_policy", args: {} });
  assert.ok(!policy.paused && policy.human_review, "Expected active human-review policy");
  for (const work of works) {
    const release = await provider.callFunction({ contractId, method: "get_release", args: { work_id: work.workId, version: 2 } });
    assert.ok(release && release.policy_epoch === policy.epoch && release.media_hash === work.asset_hash && release.metadata_hash === work.metadata_hash && release.price_yocto === work.price_yocto, `Chain release mismatch: ${work.workId}`);
    assert.equal(release.kind, work.kind, `Chain release kind mismatch: ${work.workId}`);
    const shares = JSON.parse(work.split_json).map((share) => {
      const agent = database.prepare("SELECT account_id FROM studio_agents WHERE id = ? AND studio_id = ?").get(share.agentId, work.studio_id);
      assert.ok(agent, `Contributor missing: ${share.agentId}`);
      return { account_id: agent.account_id, basis_points: share.basisPoints };
    });
    const tracks = work.kind === "album" ? database.prepare("SELECT song_id, song_version, basis_points FROM studio_album_tracks WHERE album_id = ? AND album_version = 2 ORDER BY track_number").all(work.workId).map((track) => ({ song_id: track.song_id, song_version: track.song_version, basis_points: track.basis_points })) : [];
    assert.deepEqual(release.shares, shares, `Chain split mismatch: ${work.workId}`);
    assert.deepEqual(release.tracks, tracks, `Chain track order mismatch: ${work.workId}`);
    assert.equal(release.split_hash, digest(shares), `Chain split hash mismatch: ${work.workId}`);
    assert.equal(release.track_order_hash, digest(tracks), `Chain track hash mismatch: ${work.workId}`);
    const approvalArgs = { work_id: work.workId, version: 2, commitment: release.commitment, policy_epoch: policy.epoch };
    if (!release.published) {
      await submit(`approve:${work.workId}:v2`, admin, "approve_release", approvalArgs, 1n);
      await submit(`publish:${work.workId}:v2`, producer, "publish_release", approvalArgs, 0n);
    }
    const final = await provider.callFunction({ contractId, method: "get_release", args: { work_id: work.workId, version: 2 } });
    assert.ok(final?.published && final.commitment === release.commitment, `Publication not final: ${work.workId}`);
    const txHash = journal.operations[`publish:${work.workId}:v2`]?.transactionHash;
    assert.ok(txHash, `Missing publication receipt for ${work.workId}`);
    database.exec("BEGIN IMMEDIATE");
    try {
      const existing = database.prepare("SELECT chain_commitment FROM studio_publications WHERE work_id = ? AND work_version = 2").get(work.workId);
      if (!existing) addStudioPublication(database, { workId: work.workId, workVersion: 2, chainCommitment: final.commitment, policyVersion: policy.epoch });
      else assert.equal(existing.chain_commitment, final.commitment);
      recordStudioPublicationReceipt(database, { workId: work.workId, workVersion: 2, chainCommitment: final.commitment, transactionHash: txHash, signerAccountId: producer.accountId });
      database.exec("COMMIT");
    } catch (error) { database.exec("ROLLBACK"); throw error; }
  }
  console.log(JSON.stringify({ status: "published", contractId, workIds: works.map((work) => work.workId), transactions: works.map((work) => ({ workId: work.workId, transactionHash: journal.operations[`publish:${work.workId}:v2`].transactionHash })) }, null, 2));
} finally { database.close(); }
