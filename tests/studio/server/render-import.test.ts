import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { importRenderSeed } from "../../../scripts/render/import-seed.mjs";

test("DEPLOY-01 imports verified snapshots once and rejects existing data", () => {
  const directory = mkdtempSync(join(tmpdir(), "studio-render-import-"));
  const previousContractId = process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID;
  process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID = "studio.testnet";
  try {
    const staged = join(directory, "import");
    mkdirSync(join(staged, "media"), { recursive: true });
    const asset = Buffer.from("media fixture");
    const hash = createHash("sha256").update(asset).digest("hex");
    writeFileSync(join(staged, "media", `${hash}.bin`), asset);
    const app = new DatabaseSync(join(staged, "app.sqlite"));
    app.exec("CREATE TABLE users (id TEXT); CREATE TABLE studio_orders (id TEXT)");
    app.close();
    const catalogue = new DatabaseSync(join(staged, "catalogue.sqlite"));
    catalogue.exec("CREATE TABLE studio_assets (hash TEXT); CREATE TABLE studio_projects (id TEXT); CREATE TABLE studio_publications (id TEXT)");
    catalogue.prepare("INSERT INTO studio_assets (hash) VALUES (?)").run(hash);
    catalogue.close();
    mkdirSync(join(staged, "archive"));
    const archive = new DatabaseSync(join(staged, "archive", "song-1.sqlite"));
    archive.exec("CREATE TABLE studio_model_outputs (id TEXT)");
    archive.close();
    mkdirSync(join(staged, "keys"));
    writeFileSync(join(staged, "keys", "journey.json"), JSON.stringify({ accounts: { producerScoped: {} } }));
    mkdirSync(join(staged, "rights"));
    writeFileSync(join(staged, "rights", "elevenlabs-permission.json"), JSON.stringify({ basis: "owner-confirmed-private-permission", reference: "owner-confirmation-2026-11-12", studioAccountId: "studio.testnet", testnetOnly: true, coveredUses: { musicLibrary: true, musicStreamingDistribution: true, publicPlayback: true, paidPurchases: true, tips: true, downloads: true } }));
    const appPath = join(directory, "app.sqlite");
    const cataloguePath = join(directory, "catalogue.sqlite");
    const mediaPath = join(directory, "media");
    assert.equal(importRenderSeed(directory, appPath, cataloguePath, mediaPath), true);
    assert.equal(readFileSync(join(mediaPath, `${hash}.bin`)).toString(), "media fixture");
    assert.ok(existsSync(join(directory, "archive", "song-1.sqlite")));
    assert.ok(existsSync(join(directory, "keys", "journey.json")));
    assert.equal(existsSync(join(staged, "keys", "journey.json")), false);
    assert.ok(existsSync(join(directory, "rights", "elevenlabs-permission.json")));
    assert.equal(existsSync(join(staged, "rights", "elevenlabs-permission.json")), false);
    assert.equal(importRenderSeed(directory, appPath, cataloguePath, mediaPath), false);
    assert.ok(existsSync(join(directory, ".seed-imported")));
    const second = mkdtempSync(join(tmpdir(), "studio-render-import-reject-"));
    try {
      mkdirSync(join(second, "import", "media"), { recursive: true });
      for (const name of ["app.sqlite", "catalogue.sqlite"]) writeFileSync(join(second, "import", name), readFileSync(join(staged, name)));
      writeFileSync(join(second, "import", "media", `${hash}.bin`), asset);
      const existing = new DatabaseSync(join(second, "app.sqlite"));
      existing.exec("CREATE TABLE users (id TEXT)");
      existing.prepare("INSERT INTO users (id) VALUES ('existing')").run();
      existing.close();
      assert.throws(() => importRenderSeed(second, join(second, "app.sqlite"), join(second, "catalogue.sqlite"), join(second, "media")), /Refusing to replace/);
    } finally {
      assert.ok(resolve(second).startsWith(resolve(tmpdir()) + sep));
      rmSync(second, { recursive: true, force: true });
    }
  } finally {
    if (previousContractId === undefined) delete process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID;
    else process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID = previousContractId;
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    rmSync(directory, { recursive: true, force: true });
  }
});
