import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { backup, DatabaseSync } from "node:sqlite";

const root = resolve(import.meta.dirname, "../..");
const sourceApp = resolve(root, process.env.STUDIO_APP_DB_PATH ?? "data/studio-app.sqlite");
const sourceCatalogue = resolve(root, process.env.STUDIO_CATALOGUE_DB_PATH ?? "private/studio-v2/phase05/studio.sqlite");
const sourceMedia = resolve(root, process.env.STUDIO_MEDIA_PATH ?? "private/studio-media");
const sourceArchives = resolve(root, process.env.STUDIO_ARCHIVE_PATH ?? "private/studio-v2/sources");
const destination = resolve(root, "private/render-seed");
const archiveOnly = process.argv.includes("--archive-only");
if (existsSync(destination) && !archiveOnly) throw new Error("A private Render seed already exists; move it aside before creating another snapshot");
if (!existsSync(destination) && archiveOnly) throw new Error("Create the main private Render seed before adding archive snapshots");
if (!archiveOnly && ![sourceApp, sourceCatalogue, sourceMedia].every(existsSync)) throw new Error("Source app database, catalogue database, or media directory is missing");
if (!archiveOnly) mkdirSync(join(destination, "media"), { recursive: true, mode: 0o700 });

async function snapshot(sourcePath, targetName) {
  const database = new DatabaseSync(sourcePath, { readOnly: true });
  try {
    if (database.prepare("PRAGMA integrity_check").get().integrity_check !== "ok") throw new Error("Source SQLite integrity check failed");
    await backup(database, join(destination, targetName));
  } finally { database.close(); }
}

let hashes = [];
if (!archiveOnly) {
  await snapshot(sourceApp, "app.sqlite");
  await snapshot(sourceCatalogue, "catalogue.sqlite");
  const catalogue = new DatabaseSync(join(destination, "catalogue.sqlite"), { readOnly: true });
  try { hashes = catalogue.prepare("SELECT hash FROM studio_assets").all().map((row) => String(row.hash)); }
  finally { catalogue.close(); }
  for (const hash of hashes) {
    if (!/^[a-f0-9]{64}$/.test(hash)) throw new Error("Invalid asset hash in catalogue");
    const source = join(sourceMedia, `${hash}.bin`);
    if (!existsSync(source) || createHash("sha256").update(readFileSync(source)).digest("hex") !== hash) throw new Error(`Missing or corrupt asset ${hash}`);
    copyFileSync(source, join(destination, "media", `${hash}.bin`));
  }
}
let archivedRecords = 0;
for (const name of ["song-1.sqlite", "song-2.sqlite"]) {
  const source = join(sourceArchives, name);
  if (!existsSync(source)) continue;
  if (existsSync(join(destination, "archive", name))) throw new Error(`Archived seed snapshot already exists: ${name}`);
  mkdirSync(join(destination, "archive"), { recursive: true, mode: 0o700 });
  await snapshot(source, join("archive", name));
  archivedRecords += 1;
}
console.log(JSON.stringify({ status: "ready", mediaAssets: hashes.length, archivedRecords, destination: "private/render-seed" }));
