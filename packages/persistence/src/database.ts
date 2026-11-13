import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const CURRENT_SCHEMA_VERSION = 14;

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
  if (version < 2) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS agent_sessions (
        id TEXT PRIMARY KEY,
        release_id TEXT NOT NULL,
        owner_account_id TEXT NOT NULL,
        mode TEXT NOT NULL CHECK(mode IN ('live','fixture')),
        status TEXT NOT NULL CHECK(status IN ('negotiating','reviewing','awaiting_human','succeeded','failed','paused')),
        round INTEGER NOT NULL CHECK(round >= 0),
        max_rounds INTEGER NOT NULL CHECK(max_rounds BETWEEN 1 AND 3),
        input_digest TEXT NOT NULL CHECK(length(input_digest) = 64),
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS agent_sessions_release ON agent_sessions(release_id, owner_account_id);
      CREATE TABLE IF NOT EXISTS agent_budgets (
        session_id TEXT PRIMARY KEY REFERENCES agent_sessions(id) ON DELETE CASCADE,
        max_calls INTEGER NOT NULL CHECK(max_calls BETWEEN 1 AND 2),
        calls_used INTEGER NOT NULL DEFAULT 0 CHECK(calls_used >= 0),
        max_output_tokens INTEGER NOT NULL CHECK(max_output_tokens > 0),
        output_tokens_used INTEGER NOT NULL DEFAULT 0 CHECK(output_tokens_used >= 0),
        reserved_calls INTEGER NOT NULL DEFAULT 0 CHECK(reserved_calls >= 0)
      ) STRICT;
      CREATE TABLE IF NOT EXISTS agent_proposals (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
        parent_id TEXT,
        owner_account_id TEXT NOT NULL,
        action_json TEXT NOT NULL,
        rationale TEXT NOT NULL,
        evidence_json TEXT NOT NULL,
        input_digest TEXT NOT NULL CHECK(length(input_digest) = 64),
        status TEXT NOT NULL CHECK(status IN ('proposed','validated','rejected','accepted','superseded')),
        created_at_ms INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS agent_proposals_session ON agent_proposals(session_id, created_at_ms);
      CREATE TABLE IF NOT EXISTS agent_runs (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES agent_sessions(id) ON DELETE CASCADE,
        attempt INTEGER NOT NULL CHECK(attempt BETWEEN 1 AND 2),
        provider_mode TEXT NOT NULL CHECK(provider_mode IN ('live','fixture')),
        model TEXT NOT NULL,
        input_digest TEXT NOT NULL CHECK(length(input_digest) = 64),
        output_digest TEXT,
        status TEXT NOT NULL CHECK(status IN ('started','succeeded','failed','timed_out')),
        usage_json TEXT,
        error_code TEXT,
        created_at_ms INTEGER NOT NULL
      ) STRICT;
      INSERT INTO schema_migrations(version, applied_at_ms) VALUES (2, strftime('%s','now') * 1000);
    `);
  }
  if (version < 3) {
    const projectionColumns = database.prepare("PRAGMA table_info(settlement_projections)").all() as readonly { name?: unknown }[];
    if (!projectionColumns.some((column) => column.name === "allocation_preview_hash")) database.exec("ALTER TABLE settlement_projections ADD COLUMN allocation_preview_hash TEXT NOT NULL DEFAULT '';");
    database.exec("INSERT INTO schema_migrations(version, applied_at_ms) VALUES (3, strftime('%s','now') * 1000);");
  }
  if (version < 4) {
    database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE release_memberships_v4 (
        release_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('administrator','owner','funder')),
        status TEXT NOT NULL CHECK(status IN ('invited','accepted','revoked')),
        created_at_ms INTEGER NOT NULL,
        accepted_at_ms INTEGER,
        PRIMARY KEY(release_id, account_id, role)
      ) STRICT;
      INSERT INTO release_memberships_v4 SELECT * FROM release_memberships;
      DROP TABLE release_memberships;
      ALTER TABLE release_memberships_v4 RENAME TO release_memberships;
      CREATE INDEX release_memberships_account ON release_memberships(release_id, account_id, status);
      INSERT INTO schema_migrations(version, applied_at_ms) VALUES (4, strftime('%s','now') * 1000);
      COMMIT;
    `);
  }
  if (version < 5) {
    database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE studios (
        id TEXT PRIMARY KEY, admin_account_id TEXT NOT NULL, created_at_ms INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE studio_agents (
        id TEXT PRIMARY KEY, studio_id TEXT NOT NULL REFERENCES studios(id), account_id TEXT NOT NULL,
        controller_account_id TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)),
        created_at_ms INTEGER NOT NULL, UNIQUE(studio_id, account_id), UNIQUE(studio_id, id)
      ) STRICT;
      CREATE TABLE studio_policies (
        studio_id TEXT NOT NULL REFERENCES studios(id), version INTEGER NOT NULL CHECK(version > 0),
        mode TEXT NOT NULL CHECK(mode IN ('human_review','autonomous')),
        max_generation_calls INTEGER NOT NULL CHECK(max_generation_calls > 0),
        max_payout_yocto TEXT NOT NULL, paused INTEGER NOT NULL CHECK(paused IN (0,1)),
        effective_at_ms INTEGER NOT NULL, PRIMARY KEY(studio_id, version)
      ) STRICT;
      CREATE TABLE studio_projects (
        id TEXT PRIMARY KEY, studio_id TEXT NOT NULL REFERENCES studios(id), title TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('draft','active','completed','cancelled')),
        created_at_ms INTEGER NOT NULL, UNIQUE(studio_id, id)
      ) STRICT;
      CREATE TABLE studio_tasks (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES studio_projects(id), agent_id TEXT NOT NULL REFERENCES studio_agents(id),
        kind TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('queued','running','review','accepted','rejected','disputed','timed_out','cancelled')),
        payload_json TEXT NOT NULL, created_at_ms INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX studio_tasks_agent ON studio_tasks(agent_id, status);
      CREATE TABLE studio_works (
        id TEXT PRIMARY KEY, studio_id TEXT NOT NULL REFERENCES studios(id), project_id TEXT NOT NULL REFERENCES studio_projects(id),
        kind TEXT NOT NULL CHECK(kind IN ('song','album')), current_version INTEGER NOT NULL CHECK(current_version > 0),
        UNIQUE(studio_id, id)
      ) STRICT;
      CREATE TABLE studio_work_versions (
        work_id TEXT NOT NULL REFERENCES studio_works(id), version INTEGER NOT NULL CHECK(version > 0),
        state TEXT NOT NULL CHECK(state IN ('draft','review','accepted','published','unpublished')),
        title TEXT NOT NULL, asset_hash TEXT NOT NULL, metadata_hash TEXT NOT NULL, price_yocto TEXT NOT NULL,
        split_json TEXT NOT NULL, created_at_ms INTEGER NOT NULL, PRIMARY KEY(work_id, version)
      ) STRICT;
      CREATE TABLE studio_contributions (
        id TEXT PRIMARY KEY, work_id TEXT NOT NULL, work_version INTEGER NOT NULL,
        agent_id TEXT NOT NULL REFERENCES studio_agents(id), kind TEXT NOT NULL, content_hash TEXT NOT NULL,
        accepted_at_ms INTEGER, FOREIGN KEY(work_id, work_version) REFERENCES studio_work_versions(work_id, version)
      ) STRICT;
      CREATE TABLE studio_album_tracks (
        album_id TEXT NOT NULL, album_version INTEGER NOT NULL, track_number INTEGER NOT NULL CHECK(track_number > 0),
        song_id TEXT NOT NULL, song_version INTEGER NOT NULL, basis_points INTEGER NOT NULL CHECK(basis_points BETWEEN 0 AND 10000),
        PRIMARY KEY(album_id, album_version, track_number), UNIQUE(album_id, album_version, song_id),
        FOREIGN KEY(album_id, album_version) REFERENCES studio_work_versions(work_id, version),
        FOREIGN KEY(song_id, song_version) REFERENCES studio_work_versions(work_id, version)
      ) STRICT;
      CREATE TABLE studio_assets (
        hash TEXT PRIMARY KEY, provider TEXT NOT NULL, model TEXT NOT NULL, license_ref TEXT NOT NULL,
        storage_key TEXT NOT NULL UNIQUE, mime_type TEXT NOT NULL, size_bytes INTEGER NOT NULL CHECK(size_bytes > 0),
        duration_ms INTEGER, created_at_ms INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE studio_publications (
        work_id TEXT NOT NULL, work_version INTEGER NOT NULL, chain_commitment TEXT NOT NULL,
        policy_version INTEGER NOT NULL, published_at_ms INTEGER NOT NULL, unpublished_at_ms INTEGER,
        PRIMARY KEY(work_id, work_version), FOREIGN KEY(work_id, work_version) REFERENCES studio_work_versions(work_id, version)
      ) STRICT;
      CREATE TABLE studio_revenue_events (
        id TEXT PRIMARY KEY, work_id TEXT NOT NULL, work_version INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('purchase','tip')), buyer_account_id TEXT NOT NULL,
        gross_yocto TEXT NOT NULL, fee_yocto TEXT NOT NULL, refundable_yocto TEXT NOT NULL,
        state TEXT NOT NULL CHECK(state IN ('requested','finalized','refunded')),
        chain_tx_hash TEXT, created_at_ms INTEGER NOT NULL,
        FOREIGN KEY(work_id, work_version) REFERENCES studio_work_versions(work_id, version)
      ) STRICT;
      CREATE INDEX studio_revenue_work ON studio_revenue_events(work_id, work_version, state);
      CREATE TABLE studio_entitlements (
        revenue_id TEXT NOT NULL REFERENCES studio_revenue_events(id), agent_id TEXT NOT NULL REFERENCES studio_agents(id),
        amount_yocto TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('owed','pending','paid','unknown')),
        payout_attempt_id TEXT, PRIMARY KEY(revenue_id, agent_id)
      ) STRICT;
      CREATE TABLE studio_split_acceptances (
        work_id TEXT NOT NULL, work_version INTEGER NOT NULL, agent_id TEXT NOT NULL REFERENCES studio_agents(id),
        split_hash TEXT NOT NULL, accepted_at_ms INTEGER NOT NULL,
        PRIMARY KEY(work_id, work_version, agent_id),
        FOREIGN KEY(work_id, work_version) REFERENCES studio_work_versions(work_id, version)
      ) STRICT;
      CREATE TABLE studio_refunds (
        id TEXT PRIMARY KEY, revenue_id TEXT NOT NULL REFERENCES studio_revenue_events(id),
        amount_yocto TEXT NOT NULL, reason TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('requested','pending','completed','failed','unknown')),
        chain_operation_id TEXT, created_at_ms INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE studio_payouts (
        id TEXT PRIMARY KEY, revenue_id TEXT NOT NULL, agent_id TEXT NOT NULL,
        amount_yocto TEXT NOT NULL, recipient_account_id TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('requested','pending','paid','failed','unknown')),
        chain_operation_id TEXT UNIQUE, created_at_ms INTEGER NOT NULL,
        FOREIGN KEY(revenue_id, agent_id) REFERENCES studio_entitlements(revenue_id, agent_id)
      ) STRICT;
      CREATE UNIQUE INDEX studio_payout_active ON studio_payouts(revenue_id, agent_id)
        WHERE status IN ('requested','pending','paid','unknown');
      CREATE TABLE studio_external_operations (
        id TEXT PRIMARY KEY, logical_key TEXT NOT NULL UNIQUE, operation_type TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('requested','submitted','finalized','failed','unknown')),
        provider_request_id TEXT, result_hash TEXT, created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL
      ) STRICT;
      INSERT INTO schema_migrations(version, applied_at_ms) VALUES (5, strftime('%s','now') * 1000);
      COMMIT;
    `);
  }
  if (version < 6) {
    database.exec(`
      BEGIN IMMEDIATE;
      ALTER TABLE studio_agents ADD COLUMN allowed_tools_json TEXT NOT NULL DEFAULT '["lyrics","composition","review","revision","split_proposal","split_response"]';
      ALTER TABLE studio_agents ADD COLUMN max_calls INTEGER NOT NULL DEFAULT 10 CHECK(max_calls BETWEEN 1 AND 100);
      ALTER TABLE studio_agents ADD COLUMN expires_at_ms INTEGER;
      ALTER TABLE studio_agents ADD COLUMN revoked_at_ms INTEGER;
      ALTER TABLE studio_agents ADD COLUMN key_reference TEXT;
      CREATE TABLE studio_model_outputs (
        operation_id TEXT PRIMARY KEY REFERENCES studio_external_operations(id),
        project_id TEXT NOT NULL REFERENCES studio_projects(id),
        agent_id TEXT NOT NULL REFERENCES studio_agents(id),
        role TEXT NOT NULL, model TEXT NOT NULL, provider_mode TEXT NOT NULL CHECK(provider_mode IN ('live','fixture')),
        input_hash TEXT NOT NULL, output_hash TEXT NOT NULL, output_json TEXT NOT NULL,
        response_id TEXT, input_tokens INTEGER, output_tokens INTEGER, created_at_ms INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX studio_model_outputs_project ON studio_model_outputs(project_id, agent_id);
      INSERT INTO schema_migrations(version, applied_at_ms) VALUES (6, strftime('%s','now') * 1000);
      COMMIT;
    `);
  }
  if (version < 7) {
    database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE studio_audio_generations (
        operation_id TEXT PRIMARY KEY REFERENCES studio_external_operations(id),
        project_id TEXT NOT NULL REFERENCES studio_projects(id),
        agent_id TEXT NOT NULL REFERENCES studio_agents(id),
        work_id TEXT NOT NULL REFERENCES studio_works(id),
        work_version INTEGER NOT NULL CHECK(work_version > 0),
        revision INTEGER NOT NULL CHECK(revision BETWEEN 0 AND 2),
        input_hash TEXT NOT NULL CHECK(length(input_hash) = 64),
        prompt_hash TEXT NOT NULL CHECK(length(prompt_hash) = 64),
        asset_hash TEXT NOT NULL REFERENCES studio_assets(hash),
        provider TEXT NOT NULL, model TEXT NOT NULL,
        provider_request_id TEXT, cost_units TEXT,
        license_ref TEXT NOT NULL,
        duration_ms INTEGER NOT NULL CHECK(duration_ms > 0),
        created_at_ms INTEGER NOT NULL,
        UNIQUE(work_id, work_version, revision)
      ) STRICT;
      CREATE INDEX studio_audio_generations_project ON studio_audio_generations(project_id, work_id);
      INSERT INTO schema_migrations(version, applied_at_ms) VALUES (7, strftime('%s','now') * 1000);
      COMMIT;
    `);
  }
  if (version < 8) {
    database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE studio_asset_rights (
        asset_hash TEXT PRIMARY KEY REFERENCES studio_assets(hash),
        license_ref TEXT NOT NULL,
        attested_by_account_id TEXT NOT NULL,
        public_playback INTEGER NOT NULL CHECK(public_playback IN (0,1)),
        paid_purchase INTEGER NOT NULL CHECK(paid_purchase IN (0,1)),
        tips INTEGER NOT NULL CHECK(tips IN (0,1)),
        downloads INTEGER NOT NULL CHECK(downloads IN (0,1)),
        expires_at_ms INTEGER,
        attested_at_ms INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE studio_media_reviews (
        asset_hash TEXT NOT NULL REFERENCES studio_assets(hash),
        reviewer_agent_id TEXT NOT NULL REFERENCES studio_agents(id),
        decision TEXT NOT NULL CHECK(decision IN ('accept','reject')),
        notes_hash TEXT NOT NULL CHECK(length(notes_hash) = 64),
        reviewed_at_ms INTEGER NOT NULL,
        PRIMARY KEY(asset_hash, reviewer_agent_id)
      ) STRICT;
      INSERT INTO schema_migrations(version, applied_at_ms) VALUES (8, strftime('%s','now') * 1000);
      COMMIT;
    `);
  }
  if (version < 9) {
    database.exec(`
      BEGIN IMMEDIATE;
      ALTER TABLE studio_policies ADD COLUMN max_music_request_duration_ms INTEGER NOT NULL DEFAULT 30000 CHECK(max_music_request_duration_ms BETWEEN 3000 AND 600000);
      ALTER TABLE studio_policies ADD COLUMN max_music_total_duration_ms INTEGER NOT NULL DEFAULT 120000 CHECK(max_music_total_duration_ms >= max_music_request_duration_ms);
      ALTER TABLE studio_external_operations ADD COLUMN requested_duration_ms INTEGER CHECK(requested_duration_ms BETWEEN 3000 AND 600000);
      UPDATE studio_external_operations
      SET requested_duration_ms = COALESCE((SELECT duration_ms FROM studio_audio_generations WHERE operation_id = studio_external_operations.id), 30000)
      WHERE operation_type = 'stability_music';
      INSERT INTO schema_migrations(version, applied_at_ms) VALUES (9, strftime('%s','now') * 1000);
      COMMIT;
    `);
  }
  if (version < 10) {
    database.exec(`
      BEGIN IMMEDIATE;
      ALTER TABLE studio_asset_rights ADD COLUMN provider_permission_ref TEXT;
      INSERT INTO schema_migrations(version, applied_at_ms) VALUES (10, strftime('%s','now') * 1000);
      COMMIT;
    `);
  }
  if (version < 11) {
    database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE studio_asset_quarantines (
        asset_hash TEXT PRIMARY KEY REFERENCES studio_assets(hash),
        studio_id TEXT NOT NULL REFERENCES studios(id),
        reason_hash TEXT NOT NULL CHECK(length(reason_hash) = 64),
        flagged_by_account_id TEXT NOT NULL,
        flagged_at_ms INTEGER NOT NULL,
        cleared_by_account_id TEXT,
        cleared_at_ms INTEGER
      ) STRICT;
      INSERT INTO schema_migrations(version, applied_at_ms) VALUES (11, strftime('%s','now') * 1000);
      COMMIT;
    `);
  }
  if (version < 12) {
    database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE studio_orders (
        payment_id TEXT PRIMARY KEY,
        work_id TEXT NOT NULL,
        work_version INTEGER NOT NULL,
        buyer_account_id TEXT NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('purchase','tip')),
        amount_yocto TEXT NOT NULL,
        commitment TEXT NOT NULL CHECK(length(commitment) = 64),
        quote_expires_at_ms INTEGER NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('requested','submitted','unknown','finalized','refunded','failed','expired')),
        transaction_hash TEXT,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX studio_orders_buyer_active ON studio_orders(buyer_account_id, work_id, work_version, kind, status);
      INSERT INTO schema_migrations(version, applied_at_ms) VALUES (12, strftime('%s','now') * 1000);
      COMMIT;
    `);
  }
  if (version < 13) {
    database.exec(`
      BEGIN IMMEDIATE;
      ALTER TABLE studio_publications ADD COLUMN chain_tx_hash TEXT;
      ALTER TABLE studio_publications ADD COLUMN published_by_account_id TEXT;
      INSERT INTO schema_migrations(version, applied_at_ms) VALUES (13, strftime('%s','now') * 1000);
      COMMIT;
    `);
  }
  if (version < 14) {
    database.exec(`
      BEGIN IMMEDIATE;
      CREATE TABLE studio_guest_songs (
        account_id TEXT PRIMARY KEY,
        studio_id TEXT NOT NULL REFERENCES studios(id),
        project_id TEXT NOT NULL UNIQUE REFERENCES studio_projects(id),
        brief TEXT NOT NULL CHECK(length(brief) BETWEEN 20 AND 2000),
        title TEXT NOT NULL CHECK(length(title) BETWEEN 1 AND 160),
        lyricist_id TEXT NOT NULL REFERENCES studio_agents(id),
        composer_id TEXT NOT NULL REFERENCES studio_agents(id),
        reviewer_id TEXT NOT NULL REFERENCES studio_agents(id),
        deadline_at_ms INTEGER NOT NULL,
        session_id TEXT,
        work_id TEXT UNIQUE,
        created_at_ms INTEGER NOT NULL
      ) STRICT;
      INSERT INTO schema_migrations(version, applied_at_ms) VALUES (14, strftime('%s','now') * 1000);
      COMMIT;
    `);
  }
  if (version > CURRENT_SCHEMA_VERSION) throw new Error("Database schema is newer than this application");
  return database;
}
