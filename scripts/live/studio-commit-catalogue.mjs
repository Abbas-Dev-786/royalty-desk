import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Account, JsonRpcProvider, actions } from "near-api-js";
import { studioDigest } from "@royaltydesk/chain";
import { acceptStudioSplit, openDatabase } from "@royaltydesk/persistence";

const root = resolve("private/studio-v2");
const databasePath = resolve(root, "phase05/studio.sqlite");
const journalPath = resolve(root, "phase05/chain-commit-journal.json");
const deployment = JSON.parse(readFileSync(resolve(root, "testnet/bootstrap.json"), "utf8"));
const adminKey = JSON.parse(readFileSync(resolve(root, "testnet/contract-key.json"), "utf8"));
const journey = JSON.parse(readFileSync(resolve(root, "testnet/journey.json"), "utf8"));
const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" });
const contractId = deployment.accountId;
const admin = new Account(contractId, provider, adminKey.secretKey);
const scoped = {
  lyricist: new Account(journey.accounts.lyricist.accountId, provider, journey.accounts.lyricistScoped.secretKey),
  composer: new Account(journey.accounts.composer.accountId, provider, journey.accounts.composerScoped.secretKey)
};
const journal = existsSync(journalPath) ? JSON.parse(readFileSync(journalPath, "utf8")) : { contractId, operations: {} };
assert.equal(journal.contractId, contractId);
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const workOrder = [
  ["song-phase03-1", 1], ["song-phase03-2", 1], ["album-phase03", 1],
  ["song-phase03-1", 2], ["song-phase03-2", 2], ["album-phase03", 2]
];
function save() { writeFileSync(journalPath, JSON.stringify(journal, null, 2)); }
function localRelease(database, workId, version, epoch) {
  const row = database.prepare("SELECT w.kind, w.studio_id, v.title, v.asset_hash, v.metadata_hash, v.price_yocto, v.split_json FROM studio_work_versions v JOIN studio_works w ON w.id = v.work_id WHERE v.work_id = ? AND v.version = ?").get(workId, version);
  assert.ok(row, `Missing local ${workId} v${version}`);
  const split = JSON.parse(row.split_json);
  const contributors = split.map((share) => {
    const agent = database.prepare("SELECT account_id FROM studio_agents WHERE id = ? AND studio_id = ? AND active = 1").get(share.agentId, row.studio_id);
    assert.ok(agent, `Unmapped contributor ${share.agentId}`);
    return { account_id: agent.account_id, basis_points: share.basisPoints };
  });
  const tracks = row.kind === "album" ? database.prepare("SELECT song_id, song_version, basis_points FROM studio_album_tracks WHERE album_id = ? AND album_version = ? ORDER BY track_number").all(workId, version) : [];
  const input = { work_id: workId, version, kind: row.kind, media_hash: row.asset_hash, metadata_hash: row.metadata_hash, split_hash: studioDigest(contributors), track_order_hash: studioDigest(tracks), price_yocto: row.price_yocto, shares: contributors, tracks, policy_epoch: epoch };
  return { input, split, work: { workId, studioId: row.studio_id, version, kind: row.kind, state: "accepted", title: row.title, assetHash: row.asset_hash, metadataHash: row.metadata_hash, priceYocto: row.price_yocto, split } };
}
function matches(chain, input) {
  return chain && Object.entries(input).every(([key, value]) => JSON.stringify(chain[key]) === JSON.stringify(value));
}
async function submit(label, account, method, args, expectedHash) {
  const existing = journal.operations[label];
  if (existing?.status === "final") return existing.transactionHash;
  if (existing?.status === "submitting") throw new Error(`UNKNOWN_TX_OUTCOME:${label}; inspect chain state and the private journal before retrying`);
  journal.operations[label] = { status: "submitting", inputHash: expectedHash, startedAtMs: Date.now() };
  save();
  const result = await account.signAndSendTransaction({ receiverId: contractId, actions: [actions.functionCall(method, args, 100_000_000_000_000n, 0n)], waitUntil: "FINAL", throwOnFailure: false });
  if (typeof result.status === "object" && "Failure" in result.status) throw new Error(`${label} failed: ${JSON.stringify(result.status.Failure)}`);
  journal.operations[label] = { status: "final", inputHash: expectedHash, transactionHash: result.transaction.hash };
  save();
  return result.transaction.hash;
}

assert.ok(existsSync(databasePath), "Run prepare:studio-catalogue -- --execute first");
const database = openDatabase(databasePath);
try {
  const policy = await provider.callFunction({ contractId, method: "get_policy", args: {} });
  assert.equal(policy.paused, false, "Studio is paused");
  assert.equal(policy.human_review, true, "Expected Phase 03 human-review policy");
  const planned = workOrder.map(([id, version]) => localRelease(database, id, version, policy.epoch));
  if (!process.argv.includes("--execute")) {
    console.log(JSON.stringify({ status: "dry_run", contractId, policyEpoch: policy.epoch, releases: planned.map(({ input }) => ({ workId: input.work_id, version: input.version, kind: input.kind, mediaHash: input.media_hash, splitHash: input.split_hash, trackOrderHash: input.track_order_hash })), action: "create six unpublished commitments and accept the three v2 splits with separate scoped agent keys" }, null, 2));
    process.exit(0);
  }
  for (const { input } of planned) {
    const label = `create:${input.work_id}:v${input.version}`;
    const current = await provider.callFunction({ contractId, method: "get_release", args: { work_id: input.work_id, version: input.version } });
    if (current) {
      assert.ok(matches(current, input), `CHAIN_RELEASE_MISMATCH:${label}`);
      assert.equal(current.published, false, `Unexpected public release: ${label}`);
      if (journal.operations[label]?.status === "submitting") { journal.operations[label] = { status: "final", inputHash: digest(input), transactionHash: null, reconciledFromChain: true }; save(); }
      continue;
    }
    await submit(label, admin, "create_release", { input }, digest(input));
    const created = await provider.callFunction({ contractId, method: "get_release", args: { work_id: input.work_id, version: input.version } });
    assert.ok(matches(created, input) && !created.published, `CREATE_NOT_FINAL:${label}`);
  }
  for (const { input, split, work } of planned.filter(({ input }) => input.version === 2)) {
    for (const share of split) {
      const agent = database.prepare("SELECT role, account_id FROM studio_agents WHERE id = ?").get(share.agentId);
      assert.ok(agent && (agent.role === "lyricist" || agent.role === "composer"));
      const caller = scoped[agent.role];
      assert.equal(caller.accountId, agent.account_id);
      const label = `accept:${input.work_id}:v2:${agent.role}`;
      const args = { work_id: input.work_id, version: 2, split_hash: input.split_hash, policy_epoch: input.policy_epoch };
      await submit(label, caller, "accept_split", args, digest(args));
      const local = database.prepare("SELECT 1 FROM studio_split_acceptances WHERE work_id = ? AND work_version = ? AND agent_id = ?").get(input.work_id, 2, share.agentId);
      if (!local) acceptStudioSplit(database, work, share.agentId, caller.accountId);
    }
  }
  console.log(JSON.stringify({ status: "committed_unpublished", contractId, wasmHash: deployment.wasmHash, releases: planned.map(({ input }) => `${input.work_id}:v${input.version}`), acceptedSplits: planned.filter(({ input }) => input.version === 2).length * 2, journalPath }, null, 2));
} finally { database.close(); }
