import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const databasePath = resolve(process.env.STUDIO_CATALOGUE_DB_PATH ?? "private/studio-v2/phase03/studio.sqlite");
const manifestPath = resolve("private/studio-v2/testnet/bootstrap.json");
const commitJournalPath = resolve("private/studio-v2/phase05/chain-commit-journal.json");
const blockers = [];
if (!existsSync(databasePath)) blockers.push("PHASE03_DATABASE_MISSING");
if (!existsSync(manifestPath)) blockers.push("STUDIO_TESTNET_DEPLOYMENT_MISSING");
const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : null;
const commitJournal = existsSync(commitJournalPath) ? JSON.parse(readFileSync(commitJournalPath, "utf8")) : null;
const expectedContract = process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID;
if (manifest && expectedContract && expectedContract !== manifest.accountId) blockers.push("WEB_CONTRACT_ID_DIFFERS_FROM_DEPLOYMENT");
const works = [];
if (existsSync(databasePath)) {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const rows = database.prepare(`SELECT w.id, w.kind, w.studio_id, v.version, v.state, v.asset_hash, v.metadata_hash, v.price_yocto,
        a.provider, r.provider_permission_ref, s.admin_account_id
      FROM studio_works w JOIN studio_work_versions v ON v.work_id = w.id
      JOIN studio_assets a ON a.hash = v.asset_hash
      LEFT JOIN studio_asset_rights r ON r.asset_hash = v.asset_hash
      JOIN studios s ON s.id = w.studio_id
      WHERE v.state = 'accepted' ORDER BY w.kind DESC, w.id, v.version DESC`).all();
    for (const row of rows) {
      const agents = database.prepare(`SELECT DISTINCT a.account_id FROM studio_work_versions v,
        json_each(v.split_json) share JOIN studio_agents a ON a.id = json_extract(share.value, '$.agentId')
        WHERE v.work_id = ? AND v.version = ?`).all(row.id, row.version).map((agent) => agent.account_id);
      const tracks = row.kind === "album" ? database.prepare("SELECT song_id, song_version FROM studio_album_tracks WHERE album_id = ? AND album_version = ? ORDER BY track_number").all(row.id, row.version) : [];
      const publication = database.prepare("SELECT chain_commitment, chain_tx_hash FROM studio_publications WHERE work_id = ? AND work_version = ? AND unpublished_at_ms IS NULL").get(row.id, row.version);
      const splitAcceptances = database.prepare("SELECT COUNT(*) AS count FROM studio_split_acceptances WHERE work_id = ? AND work_version = ?").get(row.id, row.version).count;
      const chainDraftCommitted = Boolean(commitJournal && manifest && commitJournal.contractId === manifest.accountId && commitJournal.operations?.[`create:${row.id}:v${row.version}`]?.status === "final");
      works.push({ id: row.id, version: row.version, kind: row.kind, assetHash: row.asset_hash, metadataHash: row.metadata_hash, priceYocto: row.price_yocto, adminAccountId: row.admin_account_id, agentAccounts: agents, trackOrder: tracks, chainDraftCommitted, splitAcceptances, publication: publication ? { commitment: publication.chain_commitment, transactionHash: publication.chain_tx_hash } : null });
      if (row.provider === "elevenlabs" && !row.provider_permission_ref) blockers.push(`PROVIDER_PERMISSION_REF_MISSING:${row.id}:v${row.version}`);
      if (manifest && row.admin_account_id !== manifest.accountId) blockers.push(`ADMIN_IDENTITY_MIGRATION_REQUIRED:${row.id}:v${row.version}`);
      if (agents.some((accountId) => accountId === "lyricist.testnet" || accountId === "composer.testnet" || accountId === "reviewer.testnet")) blockers.push(`AGENT_IDENTITY_MIGRATION_REQUIRED:${row.id}:v${row.version}`);
      if (!publication) blockers.push(`CHAIN_PUBLICATION_MISSING:${row.id}:v${row.version}`);
    }
  } finally { database.close(); }
}
console.log(JSON.stringify({ ready: blockers.length === 0, contractId: manifest?.accountId ?? null, works, blockers }, null, 2));
if (blockers.length) process.exitCode = 1;
