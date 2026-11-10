import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const CURRENT_SCHEMA_VERSION = 1;

export function openDatabase(path: string): DatabaseSync {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path, { timeout: 5_000 });
  database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at_ms INTEGER NOT NULL
    ) STRICT;
  `);
  const versionRow = database.prepare("SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations").get() as { version?: number } | undefined;
  const version = versionRow?.version ?? 0;
  if (version < 1) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        network_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        public_key TEXT NOT NULL,
        display_name TEXT,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        UNIQUE(network_id, account_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS auth_challenges (
        nonce TEXT PRIMARY KEY,
        account_id TEXT,
        public_key TEXT,
        domain TEXT NOT NULL,
        network_id TEXT NOT NULL,
        message TEXT NOT NULL,
        issued_at_ms INTEGER NOT NULL,
        expires_at_ms INTEGER NOT NULL,
        consumed_at_ms INTEGER
      ) STRICT;
      CREATE INDEX IF NOT EXISTS auth_challenges_expiry ON auth_challenges(expires_at_ms);
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at_ms INTEGER NOT NULL,
        expires_at_ms INTEGER NOT NULL,
        revoked_at_ms INTEGER
      ) STRICT;
      CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
      CREATE TABLE IF NOT EXISTS release_memberships (
        release_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('administrator','owner','funder')),
        status TEXT NOT NULL CHECK(status IN ('invited','accepted','revoked')),
        created_at_ms INTEGER NOT NULL,
        accepted_at_ms INTEGER,
        PRIMARY KEY(release_id, account_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS agent_profiles (
        release_id TEXT NOT NULL,
        owner_account_id TEXT NOT NULL,
        agent_account_id TEXT,
        encrypted_instructions BLOB,
        key_reference TEXT,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY(release_id, owner_account_id)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        release_id TEXT NOT NULL,
        owner_account_id TEXT NOT NULL,
        storage_key TEXT NOT NULL UNIQUE,
        content_hash TEXT NOT NULL,
        content_type TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        created_at_ms INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS agreement_drafts (
        release_id TEXT NOT NULL,
        version TEXT NOT NULL,
        rules_json TEXT NOT NULL,
        document_bytes BLOB NOT NULL,
        document_hash TEXT NOT NULL,
        rules_hash TEXT NOT NULL,
        approval_digest TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('draft','frozen','active','superseded')),
        created_by TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        PRIMARY KEY(release_id, version)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS statement_imports (
        release_id TEXT NOT NULL,
        period TEXT NOT NULL,
        revision TEXT NOT NULL,
        statement_id TEXT NOT NULL,
        recording_id TEXT NOT NULL,
        raw_hash TEXT NOT NULL,
        normalized_hash TEXT NOT NULL,
        gross_yocto TEXT NOT NULL,
        validation_json TEXT NOT NULL,
        storage_key TEXT NOT NULL,
        imported_by TEXT NOT NULL,
        created_at_ms INTEGER NOT NULL,
        PRIMARY KEY(release_id, period, revision),
        UNIQUE(release_id, period, normalized_hash)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS settlement_projections (
        release_id TEXT NOT NULL,
        period TEXT NOT NULL,
        revision TEXT NOT NULL,
        agreement_version TEXT NOT NULL,
        normalized_statement_hash TEXT NOT NULL,
        status TEXT NOT NULL,
        chain_json TEXT NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        PRIMARY KEY(release_id, period, revision)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        logical_key TEXT NOT NULL UNIQUE,
        release_id TEXT NOT NULL,
        participant_id TEXT,
        input_digest TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('queued','leased','running','awaiting_human','succeeded','failed','cancelled')),
        lease_owner TEXT,
        lease_expires_at_ms INTEGER,
        attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
        result_json TEXT,
        error_code TEXT,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS jobs_claimable ON jobs(state, lease_expires_at_ms);
      CREATE TABLE IF NOT EXISTS job_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        from_state TEXT,
        to_state TEXT NOT NULL,
        actor TEXT NOT NULL,
        detail_json TEXT,
        created_at_ms INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS agent_actions (
        id TEXT PRIMARY KEY,
        job_id TEXT NOT NULL REFERENCES jobs(id),
        actor_account_id TEXT NOT NULL,
        action_json TEXT NOT NULL,
        rationale TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        chain_operation_id TEXT,
        created_at_ms INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS chain_operations (
        id TEXT PRIMARY KEY,
        logical_key TEXT NOT NULL UNIQUE,
        release_id TEXT NOT NULL,
        operation_type TEXT NOT NULL,
        intent_json TEXT NOT NULL,
        signed_identity TEXT,
        transaction_hash TEXT,
        status TEXT NOT NULL CHECK(status IN ('requested','signed','broadcast','success','failure','unknown','reconciling')),
        last_error TEXT,
        updated_at_ms INTEGER NOT NULL
      ) STRICT;
      INSERT INTO schema_migrations(version, applied_at_ms) VALUES (1, strftime('%s','now') * 1000);
    `);
    const columns = database.prepare("PRAGMA table_info(jobs)").all() as readonly { name?: unknown }[];
    const names = new Set(columns.map((column) => typeof column.name === "string" ? column.name : ""));
    if (!names.has("logical_key")) database.exec("ALTER TABLE jobs ADD COLUMN logical_key TEXT NOT NULL DEFAULT '';");
    if (!names.has("participant_id")) database.exec("ALTER TABLE jobs ADD COLUMN participant_id TEXT;");
    if (!names.has("result_json")) database.exec("ALTER TABLE jobs ADD COLUMN result_json TEXT;");
    if (!names.has("error_code")) database.exec("ALTER TABLE jobs ADD COLUMN error_code TEXT;");
    if (!names.has("updated_at_ms")) database.exec("ALTER TABLE jobs ADD COLUMN updated_at_ms INTEGER NOT NULL DEFAULT 0;");
    database.exec("UPDATE jobs SET logical_key = release_id || ':' || input_digest WHERE logical_key = ''; UPDATE jobs SET updated_at_ms = created_at_ms WHERE updated_at_ms = 0;");
    database.exec("CREATE UNIQUE INDEX IF NOT EXISTS jobs_logical_key ON jobs(logical_key);");
  }
  if (version > CURRENT_SCHEMA_VERSION) throw new Error("Database schema is newer than this application");
  return database;
}
