import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { addStudioAgent, addStudioAsset, addWorkVersion, createSession, createStudio, createStudioProject, createStudioWork, JobStore, openDatabase, StudioMediaStore, upsertUser } from "../../../packages/persistence/src/index.ts";

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await new Promise<void>((done) => server.close(() => done()));
  return address.port;
}

test("CAT-02/PAY-04 built web app hides drafts and rejects anonymous downloads", { timeout: 45_000 }, async () => {
  const root = mkdtempSync(join(tmpdir(), "studio-web-e2e-"));
  const dbPath = join(root, "catalogue.sqlite");
  const db = openDatabase(dbPath);
  createStudio(db, "studio-e2e", "admin.testnet");
  addStudioAgent(db, { id: "agent-e2e", studioId: "studio-e2e", accountId: "agent-e2e.testnet", controllerAccountId: "admin.testnet", role: "composer", active: true });
  createStudioProject(db, { id: "project-e2e", studioId: "studio-e2e", title: "Draft project" });
  createStudioWork(db, { id: "draft-song", studioId: "studio-e2e", projectId: "project-e2e", kind: "song" });
  addWorkVersion(db, { workId: "draft-song", studioId: "studio-e2e", version: 1, kind: "song", state: "draft", title: "Private draft", assetHash: "a".repeat(64), metadataHash: "b".repeat(64), priceYocto: "10000000000000000000000", split: [{ agentId: "agent-e2e", basisPoints: 10000 }] });
  createStudioProject(db, { id: "project-guest-e2e", studioId: "studio-e2e", title: "Guest project" });
  const guestAudio = new StudioMediaStore(join(root, "media")).put(new Uint8Array([73, 68, 51, 1, 2, 3, 4, 5]));
  addStudioAsset(db, { hash: guestAudio.hash, provider: "test", model: "test", licenseRef: "test", storageKey: `${guestAudio.hash}.bin`, mimeType: "audio/mpeg", sizeBytes: 8, durationMs: 1000 });
  createStudioWork(db, { id: "guest-song-e2e", studioId: "studio-e2e", projectId: "project-guest-e2e", kind: "song" });
  addWorkVersion(db, { workId: "guest-song-e2e", studioId: "studio-e2e", version: 1, kind: "song", state: "review", title: "Alice private song", assetHash: guestAudio.hash, metadataHash: "c".repeat(64), priceYocto: "10000000000000000000000", split: [{ agentId: "agent-e2e", basisPoints: 10000 }] });
  db.prepare("INSERT INTO studio_guest_songs(account_id,studio_id,project_id,brief,title,lyricist_id,composer_id,reviewer_id,deadline_at_ms,work_id,created_at_ms) VALUES (?,?,?,?,?,?,?,?,?,?,?)").run("alice.testnet", "studio-e2e", "project-guest-e2e", "An original dawn song with a gentle melody", "Alice private song", "agent-e2e", "agent-e2e", "agent-e2e", Date.now() + 600_000, "guest-song-e2e", Date.now());
  db.prepare("INSERT INTO studio_external_operations(id,logical_key,operation_type,status,created_at_ms,updated_at_ms) VALUES (?,?, 'near_ai_creative','requested',?,?)").run("d".repeat(64), "creative:project-guest-e2e:lyrics", Date.now(), Date.now());
  db.close();
  const jobs = new JobStore(dbPath);
  jobs.enqueue({ id: "e".repeat(64), releaseId: "project-guest-e2e", inputDigest: "f".repeat(64) });
  jobs.close();
  const guestFailure = openDatabase(dbPath);
  guestFailure.prepare("UPDATE jobs SET state='failed',error_code='Multiple errors occurred during superstep 3' WHERE id=?").run("e".repeat(64));
  guestFailure.prepare("UPDATE studio_guest_songs SET session_id=? WHERE account_id='alice.testnet'").run("e".repeat(64));
  guestFailure.close();
  const app = openDatabase(join(root, "app.sqlite"));
  const alice = upsertUser(app, { networkId: "testnet", accountId: "alice.testnet", publicKey: "ed25519:alice" });
  const bob = upsertUser(app, { networkId: "testnet", accountId: "bob.testnet", publicKey: "ed25519:bob" });
  const aliceSession = createSession(app, alice.id).token;
  const bobSession = createSession(app, bob.id).token;
  app.close();
  const port = await unusedPort();
  const webRoot = resolve("apps/web");
  const child = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: webRoot,
    env: { ...process.env, STUDIO_CATALOGUE_DB_PATH: dbPath, STUDIO_MEDIA_PATH: join(root, "media"), STUDIO_APP_DB_PATH: join(root, "app.sqlite"), NEXT_PUBLIC_STUDIO_CONTRACT_ID: "studio.example.testnet" },
    stdio: "ignore"
  });
  try {
    const base = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let attempt = 0; attempt < 80; attempt += 1) {
      if (child.exitCode !== null) throw new Error(`Built web app exited with ${child.exitCode}`);
      try { const response = await fetch(`${base}/api/studio/catalogue`); if (response.ok) { ready = true; break; } }
      catch { /* The HTTP listener is still starting. */ }
      await new Promise((done) => setTimeout(done, 250));
    }
    assert.equal(ready, true, "Built web app did not start");
    const page = await fetch(`${base}/studio`);
    assert.equal(page.status, 200);
    const html = await page.text();
    assert.match(html, /No music is published yet/);
    assert.doesNotMatch(html, /Private draft/);
    assert.doesNotMatch(html, /Legacy royalty workspace|All royalty releases/);
    assert.equal((await fetch(`${base}/royalty`)).status, 404);
    assert.equal((await fetch(`${base}/api/releases`)).status, 404);
    const home = await fetch(base, { redirect: "manual" });
    assert.equal(home.status, 307);
    assert.equal(new URL(home.headers.get("location") ?? "", base).pathname, "/studio");
    const operations = await fetch(`${base}/studio/operations`);
    assert.equal(operations.status, 200);
    const operationsHtml = await operations.text();
    assert.match(operationsHtml, /choose the guardian testnet account/);
    assert.doesNotMatch(operationsHtml, /Private draft/);
    const payout = await fetch(`${base}/api/studio/payouts/web-test`);
    assert.equal(payout.status, 401);
    const privateProject = await fetch(`${base}/api/studio/projects`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Unauthorized" }) });
    assert.equal(privateProject.status, 401);
    const privateCreative = await fetch(`${base}/api/studio/creative`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
    assert.equal(privateCreative.status, 401);
    const privateSong = await fetch(`${base}/api/studio/songs`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
    assert.equal(privateSong.status, 401);
    const privateAlbum = await fetch(`${base}/api/studio/albums`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
    assert.equal(privateAlbum.status, 401);
    const privateReview = await fetch(`${base}/api/studio/reviews`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
    assert.equal(privateReview.status, 401);
    const privateDraftMedia = await fetch(`${base}/api/studio/drafts/draft-song/media?version=1`);
    assert.equal(privateDraftMedia.status, 401);
    const privateCommit = await fetch(`${base}/api/studio/releases/drafts`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
    assert.equal(privateCommit.status, 401);
    const privateAcceptance = await fetch(`${base}/api/studio/releases/accept`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
    assert.equal(privateAcceptance.status, 401);
    const privatePolicy = await fetch(`${base}/api/studio/policy/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
    assert.equal(privatePolicy.status, 401);
    const guestPage = await fetch(`${base}/studio/create`);
    assert.equal(guestPage.status, 200);
    assert.match(await guestPage.text(), /Make a song with the agents/);
    const guestStatus = await fetch(`${base}/api/studio/guest`);
    assert.equal(guestStatus.status, 401);
    const ownGuestStatus = await fetch(`${base}/api/studio/guest`, { headers: { cookie: `studio_session=${aliceSession}` } });
    assert.equal(ownGuestStatus.status, 200);
    const ownGuest = await ownGuestStatus.json() as { demo: { title: string; error: string } };
    assert.equal(ownGuest.demo.title, "Alice private song");
    assert.equal(ownGuest.demo.error, "ERR_CREATIVE_OUTCOME_UNKNOWN");
    const otherGuestStatus = await fetch(`${base}/api/studio/guest`, { headers: { cookie: `studio_session=${bobSession}` } });
    assert.equal(otherGuestStatus.status, 200);
    assert.deepEqual(await otherGuestStatus.json(), { demo: null });
    const ownGuestMedia = await fetch(`${base}/api/studio/guest/song/media`, { headers: { cookie: `studio_session=${aliceSession}` } });
    assert.equal(ownGuestMedia.status, 200);
    assert.equal(ownGuestMedia.headers.get("content-type"), "audio/mpeg");
    assert.equal((await ownGuestMedia.arrayBuffer()).byteLength, 8);
    const otherGuestMedia = await fetch(`${base}/api/studio/guest/song/media`, { headers: { cookie: `studio_session=${bobSession}` } });
    assert.equal(otherGuestMedia.status, 404);
    const guestStart = await fetch(`${base}/api/studio/guest`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Unauthorized", brief: "A new original song about dawn" }) });
    assert.equal(guestStart.status, 401);
    const guestAudio = await fetch(`${base}/api/studio/guest/song`, { method: "POST" });
    assert.equal(guestAudio.status, 401);
    const guestMedia = await fetch(`${base}/api/studio/guest/song/media`);
    assert.equal(guestMedia.status, 401);
    const catalogue = await fetch(`${base}/api/studio/catalogue`);
    assert.equal(catalogue.status, 200);
    assert.deepEqual(await catalogue.json(), { items: [], staleCount: 0 });
    const media = await fetch(`${base}/api/studio/media/${"a".repeat(64)}`);
    assert.equal(media.status, 404);
    const draftCollaboration = await fetch(`${base}/studio/draft-song/collaboration?version=1`);
    assert.equal(draftCollaboration.status, 404);
    assert.doesNotMatch(await draftCollaboration.text(), /Private draft/);
    const download = await fetch(`${base}/api/studio/download/draft-song?version=1`);
    assert.equal(download.status, 401);
  } finally {
    child.kill();
    await new Promise<void>((done) => { if (child.exitCode !== null) done(); else child.once("close", () => done()); });
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep));
    rmSync(root, { recursive: true, force: true });
  }
});
