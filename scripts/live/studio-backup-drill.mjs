import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve, sep } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

const databasePath = resolve(process.env.STUDIO_CATALOGUE_DB_PATH ?? "private/studio-v2/phase05/studio.sqlite");
const mediaPath = resolve(process.env.STUDIO_MEDIA_PATH ?? "private/studio-media");
assert.ok(existsSync(databasePath), "Studio catalogue database is missing");
assert.ok(existsSync(mediaPath), "Studio media directory is missing");
const temporary = mkdtempSync(join(tmpdir(), "studio-backup-drill-"));
const backupPath = join(temporary, "catalogue.sqlite");
const copiedMedia = join(temporary, "media");
mkdirSync(copiedMedia);

function digest(bytes) { return createHash("sha256").update(bytes).digest("hex"); }
function inspect(database) {
  assert.equal(database.prepare("PRAGMA integrity_check").get().integrity_check, "ok", "SQLite integrity check failed");
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name LIKE 'studio_%' ORDER BY name").all().map((row) => row.name);
  const counts = Object.fromEntries(tables.map((table) => [table, database.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n]));
  const tableDigests = Object.fromEntries(tables.map((table) => {
    const rows = database.prepare(`SELECT * FROM "${table}"`).all().map((row) => JSON.stringify({ ...row })).sort();
    return [table, digest(JSON.stringify(rows))];
  }));
  const publications = database.prepare("SELECT work_id, work_version, chain_commitment, chain_tx_hash, unpublished_at_ms FROM studio_publications ORDER BY work_id, work_version").all().map((row) => ({ ...row }));
  const assets = database.prepare("SELECT hash FROM studio_assets ORDER BY hash").all().map((row) => row.hash);
  return { counts, tableDigests, publications, assets };
}

let source;
let restored;
try {
  source = new DatabaseSync(databasePath, { readOnly: true });
  const before = inspect(source);
  await backup(source, backupPath);
  source.close(); source = undefined;
  for (const hash of before.assets) {
    assert.match(hash, /^[a-f0-9]{64}$/);
    const file = `${hash}.bin`;
    const sourceFile = join(mediaPath, file);
    const copiedFile = join(copiedMedia, file);
    assert.equal(digest(readFileSync(sourceFile)), hash, `Corrupt source media ${hash}`);
    copyFileSync(sourceFile, copiedFile);
    assert.equal(digest(readFileSync(copiedFile)), hash, `Corrupt backup media ${hash}`);
  }
  restored = new DatabaseSync(backupPath, { readOnly: true });
  const after = inspect(restored);
  assert.deepEqual(after, before, "Restored studio projection differs from source");
  for (const hash of after.assets) assert.equal(digest(readFileSync(join(copiedMedia, `${hash}.bin`))), hash);
  console.log(JSON.stringify({ status: "pass", database: basename(databasePath), tablesChecked: Object.keys(before.counts).length, assetCount: before.assets.length, publicationCount: before.publications.length, publishedCount: before.publications.filter((entry) => entry.unpublished_at_ms === null).length, mediaHashesVerified: after.assets.length }));
} finally {
  restored?.close();
  source?.close();
  assert.ok(resolve(temporary).startsWith(resolve(tmpdir()) + sep), "Unsafe backup cleanup target");
  rmSync(temporary, { recursive: true, force: true });
}
