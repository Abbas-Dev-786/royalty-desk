export const STUDIO_SCHEMA_SQL = `
CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at_ms INTEGER NOT NULL
    ) STRICT;

CREATE TABLE users (
        id TEXT PRIMARY KEY,
        network_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        public_key TEXT NOT NULL,
        display_name TEXT,
        created_at_ms INTEGER NOT NULL,
        updated_at_ms INTEGER NOT NULL,
        UNIQUE(network_id, account_id)
      ) STRICT;

CREATE TABLE auth_challenges (
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

CREATE TABLE sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at_ms INTEGER NOT NULL,
        expires_at_ms INTEGER NOT NULL,
        revoked_at_ms INTEGER
      ) STRICT;

CREATE TABLE jobs (
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

CREATE TABLE job_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
        from_state TEXT,
        to_state TEXT NOT NULL,
        actor TEXT NOT NULL,
        detail_json TEXT,
        created_at_ms INTEGER NOT NULL
      ) STRICT;

CREATE TABLE chain_operations (
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

CREATE TABLE studios (
        id TEXT PRIMARY KEY, admin_account_id TEXT NOT NULL, created_at_ms INTEGER NOT NULL
      ) STRICT;

CREATE TABLE studio_agents (
        id TEXT PRIMARY KEY, studio_id TEXT NOT NULL REFERENCES studios(id), account_id TEXT NOT NULL,
        controller_account_id TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL CHECK(active IN (0,1)),
        created_at_ms INTEGER NOT NULL, allowed_tools_json TEXT NOT NULL DEFAULT '["lyrics","composition","review","revision","split_proposal","split_response"]', max_calls INTEGER NOT NULL DEFAULT 10 CHECK(max_calls BETWEEN 1 AND 100), expires_at_ms INTEGER, revoked_at_ms INTEGER, key_reference TEXT, UNIQUE(studio_id, account_id), UNIQUE(studio_id, id)
      ) STRICT;

CREATE TABLE studio_policies (
        studio_id TEXT NOT NULL REFERENCES studios(id), version INTEGER NOT NULL CHECK(version > 0),
        mode TEXT NOT NULL CHECK(mode IN ('human_review','autonomous')),
        max_generation_calls INTEGER NOT NULL CHECK(max_generation_calls > 0),
        max_payout_yocto TEXT NOT NULL, paused INTEGER NOT NULL CHECK(paused IN (0,1)),
        effective_at_ms INTEGER NOT NULL, max_music_request_duration_ms INTEGER NOT NULL DEFAULT 600000 CHECK(max_music_request_duration_ms BETWEEN 3000 AND 600000), max_music_total_duration_ms INTEGER NOT NULL DEFAULT 600000 CHECK(max_music_total_duration_ms >= max_music_request_duration_ms), PRIMARY KEY(studio_id, version)
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
        policy_version INTEGER NOT NULL, published_at_ms INTEGER NOT NULL, unpublished_at_ms INTEGER, chain_tx_hash TEXT, published_by_account_id TEXT,
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

CREATE TABLE studio_external_operations (
        id TEXT PRIMARY KEY, logical_key TEXT NOT NULL UNIQUE, operation_type TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('requested','submitted','finalized','failed','unknown')),
        provider_request_id TEXT, result_hash TEXT, created_at_ms INTEGER NOT NULL, updated_at_ms INTEGER NOT NULL
      , requested_duration_ms INTEGER CHECK(requested_duration_ms BETWEEN 3000 AND 600000)) STRICT;

CREATE TABLE studio_model_outputs (
        operation_id TEXT PRIMARY KEY REFERENCES studio_external_operations(id),
        project_id TEXT NOT NULL REFERENCES studio_projects(id),
        agent_id TEXT NOT NULL REFERENCES studio_agents(id),
        role TEXT NOT NULL, model TEXT NOT NULL, provider_mode TEXT NOT NULL CHECK(provider_mode IN ('live','fixture')),
        input_hash TEXT NOT NULL, output_hash TEXT NOT NULL, output_json TEXT NOT NULL,
        response_id TEXT, input_tokens INTEGER, output_tokens INTEGER, created_at_ms INTEGER NOT NULL
      ) STRICT;

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
      , provider_permission_ref TEXT) STRICT;

CREATE TABLE studio_media_reviews (
        asset_hash TEXT NOT NULL REFERENCES studio_assets(hash),
        reviewer_agent_id TEXT NOT NULL REFERENCES studio_agents(id),
        decision TEXT NOT NULL CHECK(decision IN ('accept','reject')),
        notes_hash TEXT NOT NULL CHECK(length(notes_hash) = 64),
        reviewed_at_ms INTEGER NOT NULL,
        PRIMARY KEY(asset_hash, reviewer_agent_id)
      ) STRICT;

CREATE TABLE studio_asset_quarantines (
        asset_hash TEXT PRIMARY KEY REFERENCES studio_assets(hash),
        studio_id TEXT NOT NULL REFERENCES studios(id),
        reason_hash TEXT NOT NULL CHECK(length(reason_hash) = 64),
        flagged_by_account_id TEXT NOT NULL,
        flagged_at_ms INTEGER NOT NULL,
        cleared_by_account_id TEXT,
        cleared_at_ms INTEGER
      ) STRICT;

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

CREATE TABLE studio_guest_songs (
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
        created_at_ms INTEGER NOT NULL
      ) STRICT;

CREATE INDEX auth_challenges_expiry ON auth_challenges(expires_at_ms);

CREATE INDEX sessions_user ON sessions(user_id);

CREATE INDEX jobs_claimable ON jobs(state, lease_expires_at_ms);

CREATE UNIQUE INDEX jobs_logical_key ON jobs(logical_key);

CREATE INDEX studio_tasks_agent ON studio_tasks(agent_id, status);

CREATE INDEX studio_revenue_work ON studio_revenue_events(work_id, work_version, state);

CREATE UNIQUE INDEX studio_payout_active ON studio_payouts(revenue_id, agent_id)
        WHERE status IN ('requested','pending','paid','unknown');

CREATE INDEX studio_model_outputs_project ON studio_model_outputs(project_id, agent_id);

CREATE INDEX studio_audio_generations_project ON studio_audio_generations(project_id, work_id);

CREATE INDEX studio_orders_buyer_active ON studio_orders(buyer_account_id, work_id, work_version, kind, status);

CREATE INDEX studio_guest_songs_account_created ON studio_guest_songs(account_id, created_at_ms DESC);
`;
