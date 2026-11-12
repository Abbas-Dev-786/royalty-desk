import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync, backup } from "node:sqlite";
import { addStudioAgent, openDatabase } from "@royaltydesk/persistence";

const sourcePath = resolve("private/studio-v2/phase03/studio.sqlite");
const destinationRoot = resolve("private/studio-v2/phase05");
const destinationPath = resolve(destinationRoot, "studio.sqlite");
const migrationPath = resolve(destinationRoot, "identity-migration.json");
const testnetRoot = resolve("private/studio-v2/testnet");
const deployment = JSON.parse(readFileSync(resolve(testnetRoot, "bootstrap.json"), "utf8"));
const journey = JSON.parse(readFileSync(resolve(testnetRoot, "journey.json"), "utf8"));
const mapping = {
  "admin.testnet": deployment.accountId,
  "lyricist.testnet": journey.accounts.lyricist.accountId,
  "composer.testnet": journey.accounts.composer.accountId
};
const producerAccountId = journey.accounts.producer.accountId;
assert.ok(existsSync(sourcePath), "Accepted Phase 03 database is missing");
assert.ok(new Set([...Object.values(mapping), producerAccountId]).size === 4, "Live identity mapping is not distinct");
const sourceMainFileHash = createHash("sha256").update(readFileSync(sourcePath)).digest("hex");
if (!process.argv.includes("--execute")) {
  console.log(JSON.stringify({ status: "dry_run", sourcePath, destinationPath, mapping, producerAccountId, sourceMainFileHash, changes: "consistent SQLite backup, update current account mapping, clear inherited split acceptances, add scoped producer, retain original Phase 03 snapshot" }, null, 2));
  process.exit(0);
}
if (existsSync(destinationPath) || existsSync(migrationPath)) {
  assert.ok(existsSync(destinationPath) && existsSync(migrationPath), "Incomplete Phase 05 migration; inspect before retrying");
  const previous = JSON.parse(readFileSync(migrationPath, "utf8"));
  assert.deepEqual(previous.mapping, mapping, "Existing identity migration differs from the live accounts");
  assert.equal(previous.sourceMainFileHash, sourceMainFileHash, "Phase 03 source changed after migration");
  const database = new DatabaseSync(destinationPath, { readOnly: true });
  try {
    const admin = database.prepare("SELECT admin_account_id FROM studios WHERE id = 'studio-phase03'").get();
    assert.equal(admin?.admin_account_id, deployment.accountId);
  } finally { database.close(); }
  console.log(JSON.stringify({ status: "already_prepared", destinationPath, migrationPath, mapping }, null, 2));
  process.exit(0);
}
mkdirSync(destinationRoot, { recursive: true });
const source = new DatabaseSync(sourcePath, { readOnly: true });
try { await backup(source, destinationPath); }
finally { source.close(); }
const database = openDatabase(destinationPath);
let inheritedAcceptances = 0;
try {
  database.exec("BEGIN IMMEDIATE");
  const studio = database.prepare("SELECT admin_account_id FROM studios WHERE id = 'studio-phase03'").get();
  assert.equal(studio?.admin_account_id, "admin.testnet", "Unexpected Phase 03 administrator identity");
  database.prepare("UPDATE studios SET admin_account_id = ? WHERE id = 'studio-phase03'").run(deployment.accountId);
  for (const [oldAccountId, newAccountId] of Object.entries(mapping)) {
    if (oldAccountId === "admin.testnet") continue;
    const result = database.prepare("UPDATE studio_agents SET account_id = ?, controller_account_id = ? WHERE studio_id = 'studio-phase03' AND account_id = ?").run(newAccountId, deployment.accountId, oldAccountId);
    assert.equal(result.changes, 1, `Expected exactly one ${oldAccountId} agent`);
  }
  database.prepare("UPDATE studio_agents SET controller_account_id = ? WHERE studio_id = 'studio-phase03' AND controller_account_id = 'admin.testnet'").run(deployment.accountId);
  addStudioAgent(database, { id: "producer-phase05", studioId: "studio-phase03", accountId: producerAccountId, controllerAccountId: deployment.accountId, role: "producer", active: true, allowedTools: ["review", "split_response"], maxCalls: 100 });
  inheritedAcceptances = database.prepare("SELECT COUNT(*) AS count FROM studio_split_acceptances").get().count;
  database.prepare("DELETE FROM studio_split_acceptances").run();
  database.exec(`CREATE TABLE studio_identity_migrations (
    id TEXT PRIMARY KEY, source_main_file_sha256 TEXT NOT NULL, mapping_json TEXT NOT NULL,
    inherited_acceptances_cleared INTEGER NOT NULL, migrated_at_ms INTEGER NOT NULL
  ) STRICT`);
  database.prepare("INSERT INTO studio_identity_migrations VALUES (?, ?, ?, ?, ?)").run("phase03-to-phase05", sourceMainFileHash, JSON.stringify(mapping), inheritedAcceptances, Date.now());
  database.exec("COMMIT");
} catch (error) {
  database.exec("ROLLBACK");
  throw error;
} finally { database.close(); }
const migration = { sourcePath, destinationPath, sourceMainFileHash, mapping, producerAccountId, inheritedAcceptancesCleared: inheritedAcceptances, destinationMainFileHash: createHash("sha256").update(readFileSync(destinationPath)).digest("hex") };
writeFileSync(migrationPath, JSON.stringify(migration, null, 2), { flag: "wx" });
console.log(JSON.stringify({ status: "prepared", destinationPath, migrationPath, mapping, inheritedAcceptancesCleared: inheritedAcceptances, sourceMainFileHash }, null, 2));
