import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import test from "node:test";
import { addStudioAgent, addWorkVersion, createStudio, createStudioProject, createStudioWork, openDatabase } from "../../../packages/persistence/src/index.ts";

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
  db.close();
  const port = await unusedPort();
  const webRoot = resolve("apps/web");
  const child = spawn(process.execPath, [resolve("node_modules/next/dist/bin/next"), "start", "-p", String(port), "-H", "127.0.0.1"], {
    cwd: webRoot,
    env: { ...process.env, STUDIO_CATALOGUE_DB_PATH: dbPath, STUDIO_MEDIA_PATH: join(root, "media"), ROYALTYDESK_DB_PATH: join(root, "app.sqlite"), NEXT_PUBLIC_STUDIO_CONTRACT_ID: "studio.example.testnet" },
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
    const catalogue = await fetch(`${base}/api/studio/catalogue`);
    assert.equal(catalogue.status, 200);
    assert.deepEqual(await catalogue.json(), { items: [], staleCount: 0 });
    const media = await fetch(`${base}/api/studio/media/${"a".repeat(64)}`);
    assert.equal(media.status, 404);
    const download = await fetch(`${base}/api/studio/download/draft-song?version=1`);
    assert.equal(download.status, 401);
  } finally {
    child.kill();
    await new Promise<void>((done) => { if (child.exitCode !== null) done(); else child.once("close", () => done()); });
    assert.ok(resolve(root).startsWith(resolve(tmpdir()) + sep));
    rmSync(root, { recursive: true, force: true });
  }
});
