import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join, dirname, basename } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CURRENT_SCHEMA_VERSION } from "../../../packages/persistence/src/database.ts";

for (const scenario of ["unavailable", "fallback"]) test(`production catalogue: ${scenario === "fallback" ? "rate-limited primary uses verified backup releases and media" : "unresponsive RPC renders an unavailable notice"}`, { timeout: 40_000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), "studio-catalogue-timeout-"));
  const databasePath = join(directory, "catalogue.sqlite");
  const db = new DatabaseSync(databasePath);
  // Only the read-side fixture tables touched before chain verification are needed.
  db.exec(`
    CREATE TABLE schema_migrations(version INTEGER); INSERT INTO schema_migrations VALUES (${CURRENT_SCHEMA_VERSION});
    CREATE TABLE studio_publications(work_id TEXT,work_version INTEGER,chain_commitment TEXT,unpublished_at_ms INTEGER,published_at_ms INTEGER);
    CREATE TABLE studio_work_versions(work_id TEXT,version INTEGER,title TEXT,asset_hash TEXT,metadata_hash TEXT,price_yocto TEXT,split_json TEXT);
    CREATE TABLE studio_works(id TEXT,kind TEXT);
    CREATE TABLE studio_assets(hash TEXT,mime_type TEXT,provider TEXT);
    CREATE TABLE studio_asset_rights(asset_hash TEXT,provider_permission_ref TEXT,public_playback INTEGER,paid_purchase INTEGER,tips INTEGER,downloads INTEGER,expires_at_ms INTEGER);
    CREATE TABLE studio_media_reviews(asset_hash TEXT,decision TEXT);
    CREATE TABLE studio_asset_quarantines(asset_hash TEXT,cleared_at_ms INTEGER);
    CREATE TABLE studio_agents(id TEXT,account_id TEXT);
    CREATE TABLE studio_album_tracks(album_id TEXT,album_version INTEGER,song_id TEXT,song_version INTEGER,basis_points INTEGER,track_number INTEGER);
    INSERT INTO studio_agents VALUES ('writer','writer.testnet');
  `);
  const releases = new Map();
  const shares = [{ account_id: "writer.testnet", basis_points: 10000 }];
  for (let i = 0; i < 4; i += 1) {
    const bytes = Buffer.from(`test recording ${i}`);
    const id = `song-${i}`, hash = createHash("sha256").update(bytes).digest("hex");
    writeFileSync(join(directory, `${hash}.bin`), bytes);
    releases.set(id, { work_id: id, version: 1, kind: "song", published: true, commitment: hash, media_hash: hash, metadata_hash: hash, price_yocto: "1", shares, tracks: [], split_hash: createHash("sha256").update(JSON.stringify(shares)).digest("hex") });
    db.prepare("INSERT INTO studio_publications VALUES (?,1,?,NULL,1)").run(id, hash);
    db.prepare("INSERT INTO studio_work_versions VALUES (?,1,'Test song',?,?,'1',?)").run(id, hash, hash, JSON.stringify([{agentId:"writer",basisPoints:10000}]));
    db.prepare("INSERT INTO studio_works VALUES (?,'song')").run(id);
    db.prepare("INSERT INTO studio_assets VALUES (?,'audio/mpeg','fixture')").run(hash);
    db.prepare("INSERT INTO studio_asset_rights VALUES (?,NULL,1,1,1,1,NULL)").run(hash);
    db.prepare("INSERT INTO studio_media_reviews VALUES (?,'accept')").run(hash);
  }
  db.close();
  const rpc = createServer((_request, response) => {
    if (scenario === "fallback") { response.writeHead(429); response.end("Rate limit exceeded, retry after 47 seconds"); }
    // Otherwise deliberately never answer.
  });
  await new Promise((resolve) => rpc.listen(0, "127.0.0.1", resolve));
  let backupCalls = 0;
  const backup = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      backupCalls += 1;
      const { params } = JSON.parse(body);
      const args = JSON.parse(Buffer.from(params.args_base64, "base64").toString());
      const release = releases.get(args.work_id) ?? null;
      response.setHeader("content-type", "application/json");
      response.end(JSON.stringify({ result: { result: [...Buffer.from(JSON.stringify(release))], logs: [] } }));
    });
  });
  await new Promise((resolve) => backup.listen(0, "127.0.0.1", resolve));
  const root = resolve(import.meta.dirname, "../../..");
  const child = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", "0"], {
    cwd: resolve(root, "apps/web"),
    env: { ...process.env, NODE_ENV: "production", STUDIO_CATALOGUE_DB_PATH: databasePath, STUDIO_MEDIA_PATH: directory, NEAR_RPC_URL: `http://127.0.0.1:${rpc.address().port}`, NEAR_RPC_FALLBACK_URLS: scenario === "fallback" ? `http://127.0.0.1:${backup.address().port}` : "", NEXT_PUBLIC_STUDIO_CONTRACT_ID: "studio-regression.testnet" },
    stdio: ["ignore", "pipe", "pipe"]
  });
  try {
    const origin = await new Promise((resolve, reject) => {
      let output = "";
      const timer = setTimeout(() => reject(new Error(`Next startup timed out: ${output}`)), 15_000);
      child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Next exited ${code}: ${output}`)); });
      const collect = (data) => {
        output += data.toString();
        const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
        if (url && output.includes("Ready in")) { clearTimeout(timer); resolve(url); }
      };
      child.stdout.on("data", collect); child.stderr.on("data", collect);
    });
    const started = Date.now();
    const response = await fetch(`${origin}/studio`, { signal: AbortSignal.timeout(12_000) });
    const html = await response.text();
    assert.equal(response.status, 200);
    if (scenario === "unavailable") {
      assert.match(html, /The listening room is temporarily unavailable/);
      assert.equal(backupCalls, 0);
    } else {
      assert.doesNotMatch(html, /The listening room is temporarily unavailable/);
      assert.match(html, /Test song/);
      assert.equal(backupCalls, 4);
      const catalogue = await fetch(`${origin}/api/studio/catalogue`).then((result) => result.json());
      assert.equal(catalogue.items.length, 4);
      assert.equal(catalogue.staleCount, 0);
      const media = await fetch(`${origin}/api/studio/media/${releases.get("song-0").media_hash}`);
      assert.equal(media.status, 200);
      assert.equal(await media.text(), "test recording 0");
    }
    assert.ok(Date.now() - started < 12_000, "Page must finish before the gateway timeout");
  } finally {
    child.kill();
    await new Promise((resolve) => child.exitCode !== null ? resolve() : child.once("exit", resolve));
    rpc.closeAllConnections(); await new Promise((resolve) => rpc.close(resolve));
    backup.closeAllConnections(); await new Promise((resolve) => backup.close(resolve));
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith("studio-catalogue-timeout-"));
    rmSync(directory, { recursive: true, force: true });
  }
});
