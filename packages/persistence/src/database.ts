import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { STUDIO_SCHEMA_SQL } from "./studio-schema.ts";

export const CURRENT_SCHEMA_VERSION = 17;

const retiredTables = [
  "agent_budgets",
  "agent_proposals",
  "agent_runs",
  "agent_sessions",
  "agent_actions",
  "agreement_drafts",
  "statement_imports",
  "settlement_projections",
  "documents",
  "agent_profiles",
  "release_memberships"
] as const;

function runTransaction(database: DatabaseSync, operation: () => void): void {
  database.exec("BEGIN IMMEDIATE");
  try {
    operation();
    const violations = database.prepare("PRAGMA foreign_key_check").all();
    if (violations.length > 0) throw new Error("Database has broken foreign keys");
    database.exec("COMMIT");
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

function initialize(database: DatabaseSync): void {
  const tables = database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as { name: string }[];
  if (tables.length > 0) throw new Error("Unversioned database is not empty");
  runTransaction(database, () => {
    database.exec(STUDIO_SCHEMA_SQL);
    database.prepare("INSERT INTO schema_migrations(version, applied_at_ms) VALUES (?, ?)").run(CURRENT_SCHEMA_VERSION, Date.now());
  });
}

function migrate(database: DatabaseSync, version: number): void {
  if (version > CURRENT_SCHEMA_VERSION) throw new Error("Database schema is newer than this application");
  if (version === CURRENT_SCHEMA_VERSION) return;
  if (version < 14) throw new Error("Upgrade to schema version 14 before migrating to the studio-only schema");
  if (version === 14) {
    for (const table of retiredTables) {
      const exists = database.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?").get(table);
      if (!exists) continue;
      const count = (database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count;
      if (count > 0) throw new Error(`Export or remove historical data in ${table} before studio-only migration`);
    }
    runTransaction(database, () => {
      for (const table of retiredTables) database.exec(`DROP TABLE IF EXISTS ${table}`);
    });
  }
  if (version === 16) {
    runTransaction(database, () => {
      const current = (database.prepare("SELECT MAX(version) AS version FROM schema_migrations").get() as { version: number }).version;
      if (current === CURRENT_SCHEMA_VERSION) return;
      if (current !== 16) throw new Error("Unsupported studio schema migration");
      database.exec("ALTER TABLE studio_guest_songs ADD COLUMN auto_generate INTEGER NOT NULL DEFAULT 0 CHECK(auto_generate IN (0,1))");
      database.exec("DELETE FROM schema_migrations");
      database.prepare("INSERT INTO schema_migrations(version, applied_at_ms) VALUES (?, ?)").run(CURRENT_SCHEMA_VERSION, Date.now());
    });
    return;
  }
  if (version !== 14 && version !== 15) throw new Error("Unsupported studio schema migration");
  const hasGuestSongsTable = Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'studio_guest_songs'").get());
  runTransaction(database, () => {
    database.exec(`CREATE TABLE ${hasGuestSongsTable ? "studio_guest_songs_next" : "studio_guest_songs"} (
      project_id TEXT PRIMARY KEY REFERENCES studio_projects(id),
      account_id TEXT NOT NULL,
      studio_id TEXT NOT NULL REFERENCES studios(id),
      brief TEXT NOT NULL CHECK(length(brief) BETWEEN 20 AND 2000),
      title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
      lyricist_id TEXT NOT NULL REFERENCES studio_agents(id),
      composer_id TEXT NOT NULL REFERENCES studio_agents(id),
      reviewer_id TEXT NOT NULL REFERENCES studio_agents(id),
      deadline_at_ms INTEGER NOT NULL,
      session_id TEXT,
      work_id TEXT UNIQUE,
      auto_generate INTEGER NOT NULL DEFAULT 0 CHECK(auto_generate IN (0,1)),
      created_at_ms INTEGER NOT NULL
    ) STRICT;`);
    if (hasGuestSongsTable) database.exec(`INSERT INTO studio_guest_songs_next(project_id,account_id,studio_id,brief,title,lyricist_id,composer_id,reviewer_id,deadline_at_ms,session_id,work_id,created_at_ms)
      SELECT project_id,account_id,studio_id,brief,title,lyricist_id,composer_id,reviewer_id,deadline_at_ms,session_id,work_id,created_at_ms FROM studio_guest_songs;
      DROP TABLE studio_guest_songs;
      ALTER TABLE studio_guest_songs_next RENAME TO studio_guest_songs;`);
    database.exec("CREATE INDEX studio_guest_songs_account_created ON studio_guest_songs(account_id, created_at_ms DESC)");
    database.exec("DELETE FROM schema_migrations");
    database.prepare("INSERT INTO schema_migrations(version, applied_at_ms) VALUES (?, ?)").run(CURRENT_SCHEMA_VERSION, Date.now());
  });
}

export function openDatabase(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path, { timeout: 5_000 });
  try {
    database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
    const hasVersionTable = database.prepare("SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'").get();
    if (!hasVersionTable) initialize(database);
    else {
      const version = (database.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as { version: number }).version;
      migrate(database, version);
    }
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
