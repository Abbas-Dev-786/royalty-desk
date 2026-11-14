import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

function inspectDatabase(path) {
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    if (database.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") throw new Error(`Invalid SQLite snapshot: ${path}`);
    return database.prepare("SELECT hash FROM studio_assets").all().map((row) => String(row.hash));
  } finally { database.close(); }
}

function hasRows(path, table) {
  if (!existsSync(path)) return false;
  const database = new DatabaseSync(path, { readOnly: true });
  try {
    const present = database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
    return Boolean(present && database.prepare(`SELECT 1 FROM ${table} LIMIT 1`).get());
  } finally { database.close(); }
}

export function importRenderSeed(dataDir, appPath, cataloguePath, mediaPath, archivePath = join(dataDir, "archive")) {
  const sourceDir = join(dataDir, "import");
  const sourceApp = join(sourceDir, "app.sqlite");
  const sourceCatalogue = join(sourceDir, "catalogue.sqlite");
  const marker = join(dataDir, ".seed-imported");
  if (existsSync(marker)) return false;
  if (!existsSync(sourceApp) && !existsSync(sourceCatalogue)) return false;
  if (!existsSync(sourceApp) || !existsSync(sourceCatalogue)) throw new Error("Render import requires both SQLite snapshots");
  if (hasRows(appPath, "users") || hasRows(appPath, "studio_orders") || hasRows(cataloguePath, "studio_projects") || hasRows(cataloguePath, "studio_publications")) throw new Error("Refusing to replace a studio with existing users, projects, or payments");
  const assetHashes = inspectDatabase(sourceCatalogue);
  const appDatabase = new DatabaseSync(sourceApp, { readOnly: true });
  try { if (appDatabase.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") throw new Error("Invalid app SQLite snapshot"); }
  finally { appDatabase.close(); }
  for (const hash of assetHashes) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("Invalid media hash in snapshot");
    const file = join(sourceDir, "media", `${hash}.bin`);
    if (!existsSync(file) || createHash("sha256").update(readFileSync(file)).digest("hex") !== hash) throw new Error(`Missing or corrupt media ${hash}`);
  }
  const archives = ["song-1.sqlite", "song-2.sqlite"].filter((name) => existsSync(join(sourceDir, "archive", name)));
  for (const name of archives) {
    const database = new DatabaseSync(join(sourceDir, "archive", name), { readOnly: true });
    try { if (database.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") throw new Error(`Invalid archived SQLite snapshot ${name}`); }
    finally { database.close(); }
  }
  mkdirSync(mediaPath, { recursive: true });
  mkdirSync(archivePath, { recursive: true });
  copyFileSync(sourceApp, appPath);
  copyFileSync(sourceCatalogue, cataloguePath);
  for (const hash of assetHashes) copyFileSync(join(sourceDir, "media", `${hash}.bin`), join(mediaPath, `${hash}.bin`));
  for (const name of archives) copyFileSync(join(sourceDir, "archive", name), join(archivePath, name));
  writeFileSync(marker, new Date().toISOString(), { flag: "wx" });
  console.log(`Imported studio snapshots, ${assetHashes.length} verified media assets, and ${archives.length} archived agent records`);
  return true;
}
