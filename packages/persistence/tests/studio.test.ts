import assert from "node:assert/strict";
import { mkdtempSync, copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { acceptStudioSplit, addAlbumTracks, addStudioAgent, addStudioAsset, addStudioContribution, addStudioEntitlement, addStudioExternalOperation, addStudioPayout, addStudioPolicy, addStudioPublication, addStudioRefund, addStudioTask, addWorkVersion, attestStudioAssetRights, createRevenueEvent, createStudio, createStudioAlbumDraft, createStudioProject, createStudioWork, CURRENT_SCHEMA_VERSION, listStudioProjects, openDatabase, quarantineStudioAsset, readStudioPermissionReference, recordStudioProviderPermission, reviewStudioAsset, StudioMediaStore, transitionStudioWorkState } from "../src/index.ts";

function path(): string { return join(mkdtempSync(join(tmpdir(), "studio-test-")), "db.sqlite"); }
const work = { workId: "song-a", studioId: "studio-a", version: 1, kind: "song" as const, state: "draft" as const, title: "First", assetHash: "a".repeat(64), metadataHash: "b".repeat(64), priceYocto: "100", split: [{ agentId: "agent-a", basisPoints: 10000 }] };

test("DOM-01/04 migrates, persists versions, rejects stale and duplicate IDs", () => {
  const db = openDatabase(path());
  createStudio(db, "studio-a", "admin.testnet");
  addStudioPolicy(db, { studioId: "studio-a", version: 1, mode: "human_review", maxGenerationCalls: 10, maxPayoutYocto: "100", paused: false });
  assert.throws(() => addStudioPolicy(db, { studioId: "studio-a", version: 3, mode: "autonomous", maxGenerationCalls: 10, maxPayoutYocto: "100", paused: false }));
  addStudioAgent(db, { id: "agent-a", studioId: "studio-a", accountId: "agent-a.testnet", controllerAccountId: "admin.testnet", role: "producer", active: true });
  createStudioProject(db, { id: "project-a", studioId: "studio-a", title: "Album" });
  assert.equal(listStudioProjects(db, "studio-a", 1).length, 1);
  assert.throws(() => listStudioProjects(db, "studio-a", 101));
  createStudioWork(db, { id: "song-a", studioId: "studio-a", projectId: "project-a", kind: "song" });
  addWorkVersion(db, work);
  transitionStudioWorkState(db, "song-a", 1, "draft", "review");
  transitionStudioWorkState(db, "song-a", 1, "review", "accepted");
  assert.throws(() => transitionStudioWorkState(db, "song-a", 1, "review", "accepted"), /STALE/);
  assert.throws(() => addWorkVersion(db, work));
  addWorkVersion(db, { ...work, version: 2, title: "Second" });
  assert.throws(() => addWorkVersion(db, { ...work, version: 2 }));
  assert.throws(() => addWorkVersion(db, { ...work, version: 3, split: [{ agentId: "stranger", basisPoints: 10000 }] }));
  const event = { id: "order-a", workId: "song-a", workVersion: 1, kind: "purchase" as const, buyerAccountId: "buyer.testnet", grossYocto: "100", feeYocto: "0", refundableYocto: "0", state: "requested" as const };
  createRevenueEvent(db, event);
  assert.throws(() => createRevenueEvent(db, event));
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM studio_revenue_events").get() as { n: number }).n, 1);
  db.close();
});

test("DOM-01 migrates one-song wallets without losing the old song and accepts another project", () => {
  const file = path();
  const previous = openDatabase(file);
  createStudio(previous, "studio-a", "admin.testnet");
  for (const [id, role] of [["lyricist", "lyricist"], ["composer", "composer"], ["reviewer", "reviewer"]] as const) {
    addStudioAgent(previous, { id, studioId: "studio-a", accountId: `${id}.testnet`, controllerAccountId: "admin.testnet", role, active: true });
  }
  createStudioProject(previous, { id: "project-old", studioId: "studio-a", title: "First song" });
  previous.exec(`DROP TABLE studio_guest_songs;
    CREATE TABLE studio_guest_songs (
      account_id TEXT PRIMARY KEY, studio_id TEXT NOT NULL REFERENCES studios(id),
      project_id TEXT NOT NULL UNIQUE REFERENCES studio_projects(id), brief TEXT NOT NULL,
      title TEXT NOT NULL, lyricist_id TEXT NOT NULL REFERENCES studio_agents(id),
      composer_id TEXT NOT NULL REFERENCES studio_agents(id), reviewer_id TEXT NOT NULL REFERENCES studio_agents(id),
      deadline_at_ms INTEGER NOT NULL, session_id TEXT, work_id TEXT UNIQUE, created_at_ms INTEGER NOT NULL
    ) STRICT;
    UPDATE schema_migrations SET version = 15;`);
  previous.prepare("INSERT INTO studio_guest_songs(account_id,studio_id,project_id,brief,title,lyricist_id,composer_id,reviewer_id,deadline_at_ms,created_at_ms) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run("alice.testnet", "studio-a", "project-old", "A bright song about the first morning", "First song", "lyricist", "composer", "reviewer", Date.now() + 600_000, Date.now());
  previous.close();

  const upgraded = openDatabase(file);
  assert.equal((upgraded.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }).version, CURRENT_SCHEMA_VERSION);
  assert.equal((upgraded.prepare("SELECT title FROM studio_guest_songs WHERE project_id = 'project-old'").get() as { title: string }).title, "First song");
  createStudioProject(upgraded, { id: "project-new", studioId: "studio-a", title: "Second song" });
  upgraded.prepare("INSERT INTO studio_guest_songs(account_id,studio_id,project_id,brief,title,lyricist_id,composer_id,reviewer_id,deadline_at_ms,created_at_ms) VALUES (?,?,?,?,?,?,?,?,?,?)")
    .run("alice.testnet", "studio-a", "project-new", "Another bright song about the next morning", "Second song", "lyricist", "composer", "reviewer", Date.now() + 600_000, Date.now());
  assert.equal((upgraded.prepare("SELECT COUNT(*) AS n FROM studio_guest_songs WHERE account_id = 'alice.testnet'").get() as { n: number }).n, 2);
  assert.deepEqual(upgraded.prepare("PRAGMA foreign_key_check").all(), []);
  upgraded.close();
});

test("DOM-02 album track references cannot cross projects", () => {
  const db = openDatabase(path());
  createStudio(db, "studio-a", "admin.testnet");
  addStudioAgent(db, { id: "agent-a", studioId: "studio-a", accountId: "agent-a.testnet", controllerAccountId: "admin.testnet", role: "producer", active: true });
  createStudioProject(db, { id: "project-a", studioId: "studio-a", title: "Album" });
  createStudioProject(db, { id: "project-b", studioId: "studio-a", title: "Other" });
  createStudioWork(db, { id: "song-a", studioId: "studio-a", projectId: "project-a", kind: "song" });
  createStudioWork(db, { id: "album-a", studioId: "studio-a", projectId: "project-a", kind: "album" });
  createStudioWork(db, { id: "song-b", studioId: "studio-a", projectId: "project-b", kind: "song" });
  addWorkVersion(db, work);
  addWorkVersion(db, { ...work, workId: "song-b" });
  addWorkVersion(db, { ...work, workId: "album-a", kind: "album" });
  assert.throws(() => addAlbumTracks(db, "album-a", 1, [{ songId: "song-a", songVersion: 1, basisPoints: 5000 }, { songId: "song-b", songVersion: 1, basisPoints: 5000 }]));
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM studio_album_tracks").get() as { n: number }).n, 0);
  addAlbumTracks(db, "album-a", 1, [{ songId: "song-a", songVersion: 1, basisPoints: 10000 }]);
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM studio_album_tracks").get() as { n: number }).n, 1);
  db.close();
});

test("DOM-02 two reviewed songs form one version-bound album draft with escaped cover text", () => {
  const db = openDatabase(path());
  const media = new StudioMediaStore(join(mkdtempSync(join(tmpdir(), "studio-album-media-")), "media"));
  createStudio(db, "studio-a", "admin.testnet");
  createStudioProject(db, { id: "project-a", studioId: "studio-a", title: "Album" });
  addStudioAgent(db, { id: "lyricist", studioId: "studio-a", accountId: "lyricist.testnet", controllerAccountId: "admin.testnet", role: "lyricist", active: true });
  addStudioAgent(db, { id: "composer", studioId: "studio-a", accountId: "composer.testnet", controllerAccountId: "admin.testnet", role: "composer", active: true });
  for (const [songId, lyricBasisPoints] of [["song-a", 6000], ["song-b", 4000]] as const) {
    createStudioWork(db, { id: songId, studioId: "studio-a", projectId: "project-a", kind: "song" });
    const asset = media.put(new TextEncoder().encode(songId));
    addStudioAsset(db, { hash: asset.hash, provider: "test", model: "test", licenseRef: "test", storageKey: `${asset.hash}.bin`, mimeType: "audio/mpeg", sizeBytes: asset.sizeBytes });
    const song = { workId: songId, studioId: "studio-a", kind: "song" as const, state: "review" as const, title: songId, assetHash: asset.hash, metadataHash: "a".repeat(64), priceYocto: "100", split: [{ agentId: "lyricist", basisPoints: lyricBasisPoints }, { agentId: "composer", basisPoints: 10_000 - lyricBasisPoints }] };
    addWorkVersion(db, { ...song, version: 1 });
    if (songId === "song-b") addWorkVersion(db, { ...song, version: 2 });
  }
  const input = { studioId: "studio-a", projectId: "project-a", title: "River <Dawn>", songIds: ["song-a", "song-b"] as const };
  const album = createStudioAlbumDraft(db, media, input);
  assert.equal(createStudioAlbumDraft(db, media, input).workId, album.workId);
  assert.deepEqual(db.prepare("SELECT song_id, song_version, basis_points FROM studio_album_tracks WHERE album_id = ? ORDER BY track_number").all(album.workId).map((entry) => ({ ...entry })), [{ song_id: "song-a", song_version: 1, basis_points: 5000 }, { song_id: "song-b", song_version: 2, basis_points: 5000 }]);
  const row = db.prepare("SELECT split_json FROM studio_work_versions WHERE work_id = ?").get(album.workId) as { split_json: string };
  assert.deepEqual(JSON.parse(row.split_json), [{ agentId: "composer", basisPoints: 5000 }, { agentId: "lyricist", basisPoints: 5000 }]);
  assert.match(new TextDecoder().decode(media.get(album.assetHash)), /River &lt;Dawn&gt;/);
  assert.throws(() => createStudioAlbumDraft(db, media, { ...input, title: "Changed title" }), /VERSION_CHANGED/);
  db.close();
});

test("MED-05 permission record must cover every catalogue use and the studio account", () => {
  const file = join(mkdtempSync(join(tmpdir(), "studio-permission-")), "record.json");
  const record = { basis: "owner-confirmed-private-permission", reference: "owner-confirmation-2026-11-12", studioAccountId: "studio.testnet", testnetOnly: true, coveredUses: { musicLibrary: true, musicStreamingDistribution: true, publicPlayback: true, paidPurchases: true, tips: true, downloads: true } };
  writeFileSync(file, JSON.stringify(record));
  assert.equal(readStudioPermissionReference(file, "studio.testnet"), record.reference);
  assert.throws(() => readStudioPermissionReference(file, "other.testnet"), /STUDIO/);
  writeFileSync(file, JSON.stringify({ ...record, coveredUses: { ...record.coveredUses, downloads: false } }));
  assert.throws(() => readStudioPermissionReference(file, "studio.testnet"), /SCOPE/);
});

test("DOM-05 backup and restore preserves studio records", () => {
  const source = path();
  const db = openDatabase(source);
  createStudio(db, "studio-a", "admin.testnet");
  db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
  db.close();
  const target = path();
  copyFileSync(source, target);
  const restored = openDatabase(target);
  assert.equal((restored.prepare("SELECT COUNT(*) AS n FROM studios").get() as { n: number }).n, 1);
  assert.equal((restored.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as { n: number }).n, 1);
  assert.equal((restored.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name = 'release_memberships'").get() as { n: number }).n, 0);
  restored.close();
});

test("DOM-02 studio records reject cross-agent acceptance and duplicate operations", () => {
  const db = openDatabase(path());
  createStudio(db, "studio-a", "admin.testnet");
  addStudioPolicy(db, { studioId: "studio-a", version: 1, mode: "human_review", maxGenerationCalls: 10, maxPayoutYocto: "100", paused: false });
  addStudioAgent(db, { id: "agent-a", studioId: "studio-a", accountId: "agent-a.testnet", controllerAccountId: "admin.testnet", role: "producer", active: true });
  createStudioProject(db, { id: "project-a", studioId: "studio-a", title: "Album" });
  addStudioTask(db, { id: "task-a", projectId: "project-a", agentId: "agent-a", kind: "lyrics", payloadJson: "{}" });
  createStudioWork(db, { id: "song-a", studioId: "studio-a", projectId: "project-a", kind: "song" });
  addWorkVersion(db, { ...work, state: "accepted" });
  addStudioAsset(db, { hash: "a".repeat(64), provider: "test", model: "test", licenseRef: "permission-test", storageKey: "asset-a", mimeType: "audio/mpeg", sizeBytes: 100, durationMs: 1000 });
  addStudioContribution(db, { id: "contrib-a", workId: "song-a", workVersion: 1, agentId: "agent-a", kind: "lyrics", contentHash: "b".repeat(64) });
  assert.throws(() => acceptStudioSplit(db, { ...work, state: "accepted" }, "agent-a", "stranger.testnet"));
  const digest = acceptStudioSplit(db, { ...work, state: "accepted" }, "agent-a", "agent-a.testnet");
  assert.equal(digest.length, 64);
  assert.throws(() => addStudioPublication(db, { workId: "song-a", workVersion: 1, chainCommitment: "c".repeat(64), policyVersion: 1 }), /public rights/);
  attestStudioAssetRights(db, { assetHash: "a".repeat(64), studioId: "studio-a", adminAccountId: "admin.testnet", licenseRef: "permission-test", publicPlayback: true, paidPurchase: true, tips: true, downloads: true });
  reviewStudioAsset(db, { assetHash: "a".repeat(64), studioId: "studio-a", reviewerAgentId: "agent-a", decision: "accept", notesHash: "d".repeat(64) });
  addStudioPublication(db, { workId: "song-a", workVersion: 1, chainCommitment: "c".repeat(64), policyVersion: 1 });
  addStudioExternalOperation(db, { id: "op-a", logicalKey: "audio:work-a:1", operationType: "audio" });
  assert.throws(() => addStudioExternalOperation(db, { id: "op-b", logicalKey: "audio:work-a:1", operationType: "audio" }));
  const event = { id: "order-a", workId: "song-a", workVersion: 1, kind: "purchase" as const, buyerAccountId: "buyer.testnet", grossYocto: "100", feeYocto: "0", refundableYocto: "0", state: "finalized" as const };
  createRevenueEvent(db, event);
  addStudioEntitlement(db, { revenueId: "order-a", agentId: "agent-a", amountYocto: "100" });
  addStudioPayout(db, { id: "payout-a", revenueId: "order-a", agentId: "agent-a", amountYocto: "100", recipientAccountId: "agent-a.testnet" });
  assert.throws(() => addStudioPayout(db, { id: "payout-b", revenueId: "order-a", agentId: "agent-a", amountYocto: "100", recipientAccountId: "stranger.testnet" }));
  addStudioRefund(db, { id: "refund-a", revenueId: "order-a", amountYocto: "100", reason: "test correction" });
  assert.throws(() => addStudioRefund(db, { id: "refund-b", revenueId: "order-a", amountYocto: "101", reason: "exceeds payment" }));
  assert.equal((db.prepare("SELECT COUNT(*) AS n FROM studio_entitlements").get() as { n: number }).n, 1);
  db.close();
});

test("MED-05 public asset rights require the studio admin and every covered use", () => {
  const db = openDatabase(path());
  createStudio(db, "studio-rights", "admin.testnet");
  addStudioPolicy(db, { studioId: "studio-rights", version: 1, mode: "human_review", maxGenerationCalls: 2, maxPayoutYocto: "0", paused: false });
  addStudioAgent(db, { id: "rights-agent", studioId: "studio-rights", accountId: "agent.testnet", controllerAccountId: "admin.testnet", role: "reviewer", active: true, allowedTools: ["review"] });
  createStudioProject(db, { id: "rights-project", studioId: "studio-rights", title: "Rights" });
  createStudioWork(db, { id: "rights-song", studioId: "studio-rights", projectId: "rights-project", kind: "song" });
  const assetHash = "e".repeat(64);
  addStudioAsset(db, { hash: assetHash, provider: "stability-ai", model: "stable-audio-3", licenseRef: "stability-ai-api-terms", storageKey: "rights-asset", mimeType: "audio/mpeg", sizeBytes: 1000, durationMs: 4000 });
  addWorkVersion(db, { workId: "rights-song", studioId: "studio-rights", version: 1, kind: "song", state: "accepted", title: "Rights", assetHash, metadataHash: "f".repeat(64), priceYocto: "100", split: [{ agentId: "rights-agent", basisPoints: 10_000 }] });
  const grant = { assetHash, studioId: "studio-rights", adminAccountId: "admin.testnet", licenseRef: "stability-ai-api-terms", publicPlayback: true, paidPurchase: true, tips: true, downloads: true };
  assert.throws(() => attestStudioAssetRights(db, { ...grant, adminAccountId: "stranger.testnet" }), /scope mismatch/);
  attestStudioAssetRights(db, grant);
  reviewStudioAsset(db, { assetHash, studioId: "studio-rights", reviewerAgentId: "rights-agent", decision: "accept", notesHash: "a".repeat(64) });
  assert.throws(() => addStudioPublication(db, { workId: "rights-song", workVersion: 1, chainCommitment: "b".repeat(64), policyVersion: 1 }), /final sung recording/);
  db.close();
});

test("MED-05 ElevenLabs owner attestation cannot publish without a permission reference", () => {
  const db = openDatabase(path());
  try {
    createStudio(db, "studio-rights", "admin.testnet");
    addStudioPolicy(db, { studioId: "studio-rights", version: 1, mode: "autonomous", maxGenerationCalls: 2, maxPayoutYocto: "0", paused: false });
    addStudioAgent(db, { id: "reviewer", studioId: "studio-rights", accountId: "reviewer.testnet", controllerAccountId: "admin.testnet", role: "reviewer", active: true, allowedTools: ["review"] });
    createStudioProject(db, { id: "project", studioId: "studio-rights", title: "Album" });
    createStudioWork(db, { id: "song", studioId: "studio-rights", projectId: "project", kind: "song" });
    const assetHash = "c".repeat(64);
    addStudioAsset(db, { hash: assetHash, provider: "elevenlabs", model: "music_v2_5", licenseRef: "owner-attested-written-elevenlabs", storageKey: "music", mimeType: "audio/mpeg", sizeBytes: 1000, durationMs: 20_000 });
    addWorkVersion(db, { workId: "song", studioId: "studio-rights", version: 1, kind: "song", state: "accepted", title: "Song", assetHash, metadataHash: "d".repeat(64), priceYocto: "100", split: [{ agentId: "reviewer", basisPoints: 10_000 }] });
    attestStudioAssetRights(db, { assetHash, studioId: "studio-rights", adminAccountId: "admin.testnet", licenseRef: "owner-attested-written-elevenlabs", publicPlayback: true, paidPurchase: true, tips: true, downloads: true });
    reviewStudioAsset(db, { assetHash, studioId: "studio-rights", reviewerAgentId: "reviewer", decision: "accept", notesHash: "e".repeat(64) });
    const publication = { workId: "song", workVersion: 1, chainCommitment: "f".repeat(64), policyVersion: 1 };
    assert.throws(() => addStudioPublication(db, publication), /permission reference/);
    assert.throws(() => recordStudioProviderPermission(db, { assetHash, studioId: "studio-rights", adminAccountId: "stranger.testnet", reference: "agreement-123" }), /scope mismatch/);
    recordStudioProviderPermission(db, { assetHash, studioId: "studio-rights", adminAccountId: "admin.testnet", reference: "agreement-123" });
    addStudioPublication(db, publication);
    const coverHash = "1".repeat(64);
    createStudioWork(db, { id: "album", studioId: "studio-rights", projectId: "project", kind: "album" });
    addStudioAsset(db, { hash: coverHash, provider: "project-original", model: "svg", licenseRef: "owner-created", storageKey: "cover", mimeType: "image/svg+xml", sizeBytes: 1000 });
    addWorkVersion(db, { workId: "album", studioId: "studio-rights", version: 1, kind: "album", state: "accepted", title: "Album", assetHash: coverHash, metadataHash: "2".repeat(64), priceYocto: "100", split: [{ agentId: "reviewer", basisPoints: 10_000 }] });
    addAlbumTracks(db, "album", 1, [{ songId: "song", songVersion: 1, basisPoints: 10_000 }]);
    attestStudioAssetRights(db, { assetHash: coverHash, studioId: "studio-rights", adminAccountId: "admin.testnet", licenseRef: "owner-created", publicPlayback: true, paidPurchase: true, tips: true, downloads: true });
    reviewStudioAsset(db, { assetHash: coverHash, studioId: "studio-rights", reviewerAgentId: "reviewer", decision: "accept", notesHash: "3".repeat(64) });
    addStudioPublication(db, { workId: "album", workVersion: 1, chainCommitment: "4".repeat(64), policyVersion: 1 });
    createRevenueEvent(db, { id: "historic-order", workId: "song", workVersion: 1, kind: "purchase", buyerAccountId: "buyer.testnet", grossYocto: "100", feeYocto: "0", refundableYocto: "0", state: "finalized" });
    assert.throws(() => quarantineStudioAsset(db, { assetHash, studioId: "studio-rights", adminAccountId: "stranger.testnet", reasonHash: "a".repeat(64) }), /scope mismatch/);
    quarantineStudioAsset(db, { assetHash, studioId: "studio-rights", adminAccountId: "admin.testnet", reasonHash: "a".repeat(64) });
    assert.ok((db.prepare("SELECT unpublished_at_ms AS value FROM studio_publications WHERE work_id = 'song'").get() as { value: number | null }).value);
    assert.ok((db.prepare("SELECT unpublished_at_ms AS value FROM studio_publications WHERE work_id = 'album'").get() as { value: number | null }).value);
    assert.equal((db.prepare("SELECT COUNT(*) AS count FROM studio_revenue_events WHERE id = 'historic-order' AND state = 'finalized'").get() as { count: number }).count, 1);
    assert.throws(() => addStudioPublication(db, { ...publication, chainCommitment: "a".repeat(64) }), /quarantined/);
    assert.throws(() => addStudioPublication(db, { workId: "album", workVersion: 1, chainCommitment: "5".repeat(64), policyVersion: 1 }), /quarantined song/);
  } finally { db.close(); }
});

test("BASE-04 media survives copy/restore and rejects corruption", () => {
  const root = mkdtempSync(join(tmpdir(), "studio-media-"));
  const store = new StudioMediaStore(root);
  const bytes = new TextEncoder().encode("synthetic audio fixture");
  const saved = store.put(bytes);
  assert.deepEqual(store.get(saved.hash), bytes);
  assert.throws(() => store.get("../private"));
  const backup = mkdtempSync(join(tmpdir(), "studio-media-backup-"));
  mkdirSync(backup, { recursive: true });
  copyFileSync(join(root, `${saved.hash}.bin`), join(backup, `${saved.hash}.bin`));
  assert.deepEqual(new StudioMediaStore(backup).get(saved.hash), bytes);
  writeFileSync(join(backup, `${saved.hash}.bin`), "corrupted");
  assert.throws(() => new StudioMediaStore(backup).get(saved.hash), /hash mismatch/);
});

test("DOM-04 two connections serialize a competing economic ID", () => {
  const file = path();
  const first = openDatabase(file);
  createStudio(first, "studio-a", "admin.testnet");
  addStudioAgent(first, { id: "agent-a", studioId: "studio-a", accountId: "agent-a.testnet", controllerAccountId: "admin.testnet", role: "producer", active: true });
  createStudioProject(first, { id: "project-a", studioId: "studio-a", title: "Album" });
  createStudioWork(first, { id: "song-a", studioId: "studio-a", projectId: "project-a", kind: "song" });
  addWorkVersion(first, work);
  const second = openDatabase(file);
  second.exec("PRAGMA busy_timeout = 100");
  const event = { id: "same-order", workId: "song-a", workVersion: 1, kind: "purchase" as const, buyerAccountId: "buyer.testnet", grossYocto: "100", feeYocto: "0", refundableYocto: "0", state: "requested" as const };
  first.exec("BEGIN IMMEDIATE");
  try {
    createRevenueEvent(first, event);
    assert.throws(() => createRevenueEvent(second, event), /locked/);
    first.exec("COMMIT");
  } catch (error) {
    first.exec("ROLLBACK");
    throw error;
  }
  assert.throws(() => createRevenueEvent(second, event));
  assert.equal((second.prepare("SELECT COUNT(*) AS n FROM studio_revenue_events WHERE id = 'same-order'").get() as { n: number }).n, 1);
  second.close();
  first.close();
});

test("DOM-01 migrates version-14 data to the studio-only schema", () => {
  const file = path();
  const old = new DatabaseSync(file);
  old.exec(`
    CREATE TABLE schema_migrations (version INTEGER PRIMARY KEY, applied_at_ms INTEGER NOT NULL) STRICT;
    INSERT INTO schema_migrations VALUES (14, 1);
    CREATE TABLE studios (id TEXT PRIMARY KEY, admin_account_id TEXT NOT NULL, created_at_ms INTEGER NOT NULL) STRICT;
    INSERT INTO studios VALUES ('studio-a', 'admin.testnet', 1);
    CREATE TABLE studio_orders (payment_id TEXT PRIMARY KEY, work_id TEXT NOT NULL, work_version INTEGER NOT NULL, buyer_account_id TEXT NOT NULL, kind TEXT NOT NULL, amount_yocto TEXT NOT NULL, commitment TEXT NOT NULL, quote_expires_at_ms INTEGER NOT NULL, status TEXT NOT NULL, transaction_hash TEXT, created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL) STRICT;
    INSERT INTO studio_orders VALUES ('order-a', 'song-a', 1, 'buyer.testnet', 'purchase', '100', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 1, 'finalized', NULL, 1, 1);
    CREATE TABLE release_memberships (
      release_id TEXT NOT NULL, account_id TEXT NOT NULL, role TEXT NOT NULL,
      status TEXT NOT NULL, created_at_ms INTEGER NOT NULL, accepted_at_ms INTEGER,
      PRIMARY KEY(release_id, account_id, role)
    ) STRICT;
    INSERT INTO release_memberships VALUES ('legacy', 'owner.testnet', 'owner', 'accepted', 1, 1);
  `);
  old.close();
  assert.throws(() => openDatabase(file), /historical data/);
  const cleared = new DatabaseSync(file);
  cleared.exec("DELETE FROM release_memberships");
  cleared.close();
  const upgraded = openDatabase(file);
  assert.equal((upgraded.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }).version, CURRENT_SCHEMA_VERSION);
  assert.equal((upgraded.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get() as { n: number }).n, 1);
  assert.equal((upgraded.prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE name = 'release_memberships'").get() as { n: number }).n, 0);
  assert.equal((upgraded.prepare("SELECT COUNT(*) AS n FROM studios").get() as { n: number }).n, 1);
  assert.equal((upgraded.prepare("SELECT COUNT(*) AS n FROM studio_orders").get() as { n: number }).n, 1);
  upgraded.close();
});
