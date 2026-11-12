import type { DatabaseSync } from "node:sqlite";
import { parseYocto, requireAccountId, requireStudioId, studioSplitDigest } from "@royaltydesk/domain";
import type { WorkVersion } from "@royaltydesk/domain";

const hashPattern = /^[0-9a-f]{64}$/;

export interface StudioAssetInput {
  readonly hash: string;
  readonly provider: string;
  readonly model: string;
  readonly licenseRef: string;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly durationMs?: number;
}

export function addStudioAsset(database: DatabaseSync, asset: StudioAssetInput, nowMs = Date.now()): void {
  if (!hashPattern.test(asset.hash)) throw new Error("Invalid asset hash");
  for (const value of [asset.provider, asset.model, asset.licenseRef, asset.storageKey, asset.mimeType]) {
    if (!value.trim() || value.length > 512) throw new Error("Invalid asset metadata");
  }
  if (!Number.isSafeInteger(asset.sizeBytes) || asset.sizeBytes < 1 || asset.sizeBytes > 500_000_000) throw new Error("Invalid asset size");
  if (asset.durationMs !== undefined && (!Number.isSafeInteger(asset.durationMs) || asset.durationMs < 1 || asset.durationMs > 3_600_000)) throw new Error("Invalid asset duration");
  database.prepare("INSERT INTO studio_assets(hash, provider, model, license_ref, storage_key, mime_type, size_bytes, duration_ms, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(asset.hash, asset.provider, asset.model, asset.licenseRef, asset.storageKey, asset.mimeType, asset.sizeBytes, asset.durationMs ?? null, nowMs);
}

export function addStudioTask(database: DatabaseSync, input: { readonly id: string; readonly projectId: string; readonly agentId: string; readonly kind: string; readonly payloadJson: string }, nowMs = Date.now()): void {
  requireStudioId(input.id);
  requireStudioId(input.projectId);
  requireStudioId(input.agentId);
  if (!input.kind.trim() || input.kind.length > 80 || input.payloadJson.length > 64_000) throw new Error("Invalid task payload");
  JSON.parse(input.payloadJson);
  const match = database.prepare("SELECT 1 FROM studio_projects p JOIN studio_agents a ON a.studio_id = p.studio_id WHERE p.id = ? AND a.id = ? AND a.active = 1").get(input.projectId, input.agentId);
  if (!match) throw new Error("Task agent belongs to another studio or is inactive");
  database.prepare("INSERT INTO studio_tasks(id, project_id, agent_id, kind, status, payload_json, created_at_ms) VALUES (?, ?, ?, ?, 'queued', ?, ?)").run(input.id, input.projectId, input.agentId, input.kind, input.payloadJson, nowMs);
}

export function addStudioContribution(database: DatabaseSync, input: { readonly id: string; readonly workId: string; readonly workVersion: number; readonly agentId: string; readonly kind: string; readonly contentHash: string }): void {
  requireStudioId(input.id);
  if (!hashPattern.test(input.contentHash) || !input.kind.trim() || input.kind.length > 80) throw new Error("Invalid contribution");
  const match = database.prepare("SELECT 1 FROM studio_works w JOIN studio_work_versions v ON v.work_id = w.id JOIN studio_agents a ON a.studio_id = w.studio_id WHERE w.id = ? AND v.version = ? AND a.id = ? AND a.active = 1").get(input.workId, input.workVersion, input.agentId);
  if (!match) throw new Error("Contribution references another studio or missing version");
  database.prepare("INSERT INTO studio_contributions(id, work_id, work_version, agent_id, kind, content_hash, accepted_at_ms) VALUES (?, ?, ?, ?, ?, ?, NULL)").run(input.id, input.workId, input.workVersion, input.agentId, input.kind, input.contentHash);
}

export function acceptStudioSplit(database: DatabaseSync, work: WorkVersion, agentId: string, signerAccountId: string, nowMs = Date.now()): string {
  requireAccountId(signerAccountId);
  const agent = database.prepare("SELECT account_id FROM studio_agents WHERE id = ? AND studio_id = ? AND active = 1").get(agentId, work.studioId) as { account_id: string } | undefined;
  if (!agent || agent.account_id !== signerAccountId || !work.split.some((share) => share.agentId === agentId)) throw new Error("Agent cannot accept this split");
  const saved = database.prepare("SELECT split_json FROM studio_work_versions WHERE work_id = ? AND version = ?").get(work.workId, work.version) as { split_json: string } | undefined;
  const digest = studioSplitDigest(work.split);
  if (!saved || studioSplitDigest(JSON.parse(saved.split_json) as WorkVersion["split"]) !== digest) throw new Error("Stale split version");
  database.prepare("INSERT INTO studio_split_acceptances(work_id, work_version, agent_id, split_hash, accepted_at_ms) VALUES (?, ?, ?, ?, ?)").run(work.workId, work.version, agentId, digest, nowMs);
  return digest;
}

export function attestStudioAssetRights(database: DatabaseSync, input: { readonly assetHash: string; readonly studioId: string; readonly adminAccountId: string; readonly licenseRef: string; readonly publicPlayback: boolean; readonly paidPurchase: boolean; readonly tips: boolean; readonly downloads: boolean; readonly providerPermissionRef?: string; readonly expiresAtMs?: number }, nowMs = Date.now()): void {
  if (!hashPattern.test(input.assetHash) || !input.licenseRef.trim()) throw new Error("Invalid rights attestation");
  const studio = database.prepare("SELECT admin_account_id FROM studios WHERE id = ?").get(input.studioId) as { admin_account_id: string } | undefined;
  const asset = database.prepare("SELECT license_ref FROM studio_assets WHERE hash = ?").get(input.assetHash) as { license_ref: string } | undefined;
  const linked = database.prepare("SELECT 1 FROM studio_works w JOIN studio_work_versions v ON v.work_id = w.id WHERE w.studio_id = ? AND v.asset_hash = ?").get(input.studioId, input.assetHash);
  if (!studio || studio.admin_account_id !== input.adminAccountId || !asset || asset.license_ref !== input.licenseRef || !linked) throw new Error("Rights attestation scope mismatch");
  if (input.providerPermissionRef !== undefined && (!input.providerPermissionRef.trim() || input.providerPermissionRef.length > 512 || input.providerPermissionRef.startsWith("owner-attested"))) throw new Error("Invalid provider permission reference");
  if (input.expiresAtMs !== undefined && (!Number.isSafeInteger(input.expiresAtMs) || input.expiresAtMs <= nowMs)) throw new Error("Invalid rights expiry");
  database.prepare("INSERT INTO studio_asset_rights(asset_hash, license_ref, attested_by_account_id, public_playback, paid_purchase, tips, downloads, expires_at_ms, attested_at_ms, provider_permission_ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").run(input.assetHash, input.licenseRef, input.adminAccountId, input.publicPlayback ? 1 : 0, input.paidPurchase ? 1 : 0, input.tips ? 1 : 0, input.downloads ? 1 : 0, input.expiresAtMs ?? null, nowMs, input.providerPermissionRef ?? null);
}

export function recordStudioProviderPermission(database: DatabaseSync, input: { readonly assetHash: string; readonly studioId: string; readonly adminAccountId: string; readonly reference: string }): void {
  if (!hashPattern.test(input.assetHash) || !input.reference.trim() || input.reference.length > 512 || input.reference.startsWith("owner-attested")) throw new Error("Invalid provider permission reference");
  const scoped = database.prepare("SELECT 1 FROM studios s JOIN studio_works w ON w.studio_id = s.id JOIN studio_work_versions v ON v.work_id = w.id JOIN studio_asset_rights r ON r.asset_hash = v.asset_hash WHERE s.id = ? AND s.admin_account_id = ? AND v.asset_hash = ?").get(input.studioId, input.adminAccountId, input.assetHash);
  if (!scoped) throw new Error("Provider permission scope mismatch");
  database.prepare("UPDATE studio_asset_rights SET provider_permission_ref = ? WHERE asset_hash = ?").run(input.reference, input.assetHash);
}

/** Quarantine prevents future publication and hides active versions without touching revenue. */
export function quarantineStudioAsset(database: DatabaseSync, input: { readonly assetHash: string; readonly studioId: string; readonly adminAccountId: string; readonly reasonHash: string }, nowMs = Date.now()): void {
  if (!hashPattern.test(input.assetHash) || !hashPattern.test(input.reasonHash)) throw new Error("Invalid asset quarantine");
  const scoped = database.prepare("SELECT 1 FROM studios s JOIN studio_works w ON w.studio_id = s.id JOIN studio_work_versions v ON v.work_id = w.id WHERE s.id = ? AND s.admin_account_id = ? AND v.asset_hash = ?").get(input.studioId, input.adminAccountId, input.assetHash);
  if (!scoped) throw new Error("Asset quarantine scope mismatch");
  database.exec("BEGIN IMMEDIATE");
  try {
    database.prepare("INSERT INTO studio_asset_quarantines(asset_hash, studio_id, reason_hash, flagged_by_account_id, flagged_at_ms) VALUES (?, ?, ?, ?, ?) ON CONFLICT(asset_hash) DO UPDATE SET reason_hash = excluded.reason_hash, flagged_by_account_id = excluded.flagged_by_account_id, flagged_at_ms = excluded.flagged_at_ms, cleared_by_account_id = NULL, cleared_at_ms = NULL").run(input.assetHash, input.studioId, input.reasonHash, input.adminAccountId, nowMs);
    database.prepare("UPDATE studio_publications SET unpublished_at_ms = ? WHERE unpublished_at_ms IS NULL AND EXISTS (SELECT 1 FROM studio_work_versions v WHERE v.work_id = studio_publications.work_id AND v.version = studio_publications.work_version AND v.asset_hash = ?)").run(nowMs, input.assetHash);
    database.prepare("UPDATE studio_publications SET unpublished_at_ms = ? WHERE unpublished_at_ms IS NULL AND EXISTS (SELECT 1 FROM studio_album_tracks t JOIN studio_work_versions song ON song.work_id = t.song_id AND song.version = t.song_version WHERE t.album_id = studio_publications.work_id AND t.album_version = studio_publications.work_version AND song.asset_hash = ?)").run(nowMs, input.assetHash);
    database.exec("COMMIT");
  } catch (error) { database.exec("ROLLBACK"); throw error; }
}

export function reviewStudioAsset(database: DatabaseSync, input: { readonly assetHash: string; readonly studioId: string; readonly reviewerAgentId: string; readonly decision: "accept" | "reject"; readonly notesHash: string }, nowMs = Date.now()): void {
  if (!hashPattern.test(input.assetHash) || !hashPattern.test(input.notesHash)) throw new Error("Invalid media review");
  const reviewer = database.prepare("SELECT allowed_tools_json FROM studio_agents WHERE id = ? AND studio_id = ? AND active = 1 AND revoked_at_ms IS NULL AND (expires_at_ms IS NULL OR expires_at_ms > ?)").get(input.reviewerAgentId, input.studioId, nowMs) as { allowed_tools_json: string } | undefined;
  const linked = database.prepare("SELECT 1 FROM studio_works w JOIN studio_work_versions v ON v.work_id = w.id WHERE w.studio_id = ? AND v.asset_hash = ?").get(input.studioId, input.assetHash);
  const generation = database.prepare("SELECT agent_id FROM studio_audio_generations WHERE asset_hash = ?").get(input.assetHash) as { agent_id: string } | undefined;
  if (!reviewer || !(JSON.parse(reviewer.allowed_tools_json) as unknown[]).includes("review") || !linked || generation?.agent_id === input.reviewerAgentId) throw new Error("Media reviewer scope mismatch");
  database.prepare("INSERT INTO studio_media_reviews(asset_hash, reviewer_agent_id, decision, notes_hash, reviewed_at_ms) VALUES (?, ?, ?, ?, ?)").run(input.assetHash, input.reviewerAgentId, input.decision, input.notesHash, nowMs);
}

export function addStudioPublication(database: DatabaseSync, input: { readonly workId: string; readonly workVersion: number; readonly chainCommitment: string; readonly policyVersion: number }, nowMs = Date.now()): void {
  if (!hashPattern.test(input.chainCommitment)) throw new Error("Invalid publication commitment");
  const work = database.prepare("SELECT w.studio_id, v.state FROM studio_works w JOIN studio_work_versions v ON v.work_id = w.id WHERE w.id = ? AND v.version = ?").get(input.workId, input.workVersion) as { studio_id: string; state: string } | undefined;
  if (!work || work.state !== "accepted") throw new Error("Only accepted versions can be published");
  const policy = database.prepare("SELECT 1 FROM studio_policies WHERE studio_id = ? AND version = ? AND paused = 0").get(work.studio_id, input.policyVersion);
  if (!policy) throw new Error("Publication policy is missing or paused");
  const version = database.prepare("SELECT v.asset_hash, w.kind, a.provider, a.model FROM studio_work_versions v JOIN studio_works w ON w.id = v.work_id JOIN studio_assets a ON a.hash = v.asset_hash WHERE v.work_id = ? AND v.version = ?").get(input.workId, input.workVersion) as { asset_hash: string; kind: string; provider: string; model: string } | undefined;
  if (!version) throw new Error("Publication asset is missing");
  if (database.prepare("SELECT 1 FROM studio_asset_quarantines WHERE asset_hash = ? AND cleared_at_ms IS NULL").get(version.asset_hash)) throw new Error("Publication asset is quarantined");
  if (version.kind === "album" && database.prepare("SELECT 1 FROM studio_album_tracks t JOIN studio_work_versions song ON song.work_id = t.song_id AND song.version = t.song_version JOIN studio_asset_quarantines q ON q.asset_hash = song.asset_hash AND q.cleared_at_ms IS NULL WHERE t.album_id = ? AND t.album_version = ? LIMIT 1").get(input.workId, input.workVersion)) throw new Error("Album contains a quarantined song");
  if (version.kind === "song" && version.provider === "stability-ai" && version.model === "stable-audio-3") throw new Error("Publication requires a final sung recording");
  const rights = database.prepare("SELECT public_playback, paid_purchase, tips, downloads, expires_at_ms, provider_permission_ref FROM studio_asset_rights WHERE asset_hash = ?").get(version.asset_hash) as { public_playback: number; paid_purchase: number; tips: number; downloads: number; expires_at_ms: number | null; provider_permission_ref: string | null } | undefined;
  const review = database.prepare("SELECT 1 FROM studio_media_reviews WHERE asset_hash = ? AND decision = 'accept' LIMIT 1").get(version.asset_hash);
  if (!rights || !rights.public_playback || !rights.paid_purchase || !rights.tips || !rights.downloads || (rights.expires_at_ms !== null && rights.expires_at_ms <= nowMs) || !review) throw new Error("Publication requires reviewed media and public rights");
  if (version.provider === "elevenlabs" && !rights.provider_permission_ref) throw new Error("ElevenLabs publication requires a recorded provider permission reference");
  database.prepare("INSERT INTO studio_publications(work_id, work_version, chain_commitment, policy_version, published_at_ms) VALUES (?, ?, ?, ?, ?)").run(input.workId, input.workVersion, input.chainCommitment, input.policyVersion, nowMs);
}

export function addStudioEntitlement(database: DatabaseSync, input: { readonly revenueId: string; readonly agentId: string; readonly amountYocto: string }): void {
  parseYocto(input.amountYocto);
  const match = database.prepare("SELECT 1 FROM studio_revenue_events r JOIN studio_works w ON w.id = r.work_id JOIN studio_agents a ON a.studio_id = w.studio_id WHERE r.id = ? AND r.state = 'finalized' AND a.id = ?").get(input.revenueId, input.agentId);
  if (!match) throw new Error("Entitlement requires finalized revenue and studio agent");
  database.prepare("INSERT INTO studio_entitlements(revenue_id, agent_id, amount_yocto, status) VALUES (?, ?, ?, 'owed')").run(input.revenueId, input.agentId, input.amountYocto);
}

export function addStudioExternalOperation(database: DatabaseSync, input: { readonly id: string; readonly logicalKey: string; readonly operationType: string }, nowMs = Date.now()): void {
  requireStudioId(input.id);
  if (!input.logicalKey.trim() || input.logicalKey.length > 256 || !input.operationType.trim()) throw new Error("Invalid external operation");
  database.prepare("INSERT INTO studio_external_operations(id, logical_key, operation_type, status, created_at_ms, updated_at_ms) VALUES (?, ?, ?, 'requested', ?, ?)").run(input.id, input.logicalKey, input.operationType, nowMs, nowMs);
}

/** Stores a refund intent. Contract receipts remain the financial source of truth. */
export function addStudioRefund(database: DatabaseSync, input: { readonly id: string; readonly revenueId: string; readonly amountYocto: string; readonly reason: string }, nowMs = Date.now()): void {
  requireStudioId(input.id);
  const amount = parseYocto(input.amountYocto);
  if (amount === 0n || !input.reason.trim() || input.reason.length > 500) throw new Error("Invalid refund intent");
  const revenue = database.prepare("SELECT gross_yocto FROM studio_revenue_events WHERE id = ?").get(input.revenueId) as { gross_yocto: string } | undefined;
  if (!revenue || amount > parseYocto(revenue.gross_yocto)) throw new Error("Refund exceeds known revenue");
  const prior = database.prepare("SELECT amount_yocto FROM studio_refunds WHERE revenue_id = ? AND status NOT IN ('failed')").all(input.revenueId);
  if (prior.reduce((sum, row) => sum + parseYocto(String(row.amount_yocto)), 0n) + amount > parseYocto(revenue.gross_yocto)) throw new Error("Cumulative refunds exceed revenue");
  database.prepare("INSERT INTO studio_refunds(id, revenue_id, amount_yocto, reason, status, created_at_ms) VALUES (?, ?, ?, ?, 'requested', ?)").run(input.id, input.revenueId, input.amountYocto, input.reason, nowMs);
}

/** Stores a proposed payout attempt after an entitlement has been calculated. */
export function addStudioPayout(database: DatabaseSync, input: { readonly id: string; readonly revenueId: string; readonly agentId: string; readonly amountYocto: string; readonly recipientAccountId: string }, nowMs = Date.now()): void {
  requireStudioId(input.id);
  requireAccountId(input.recipientAccountId);
  const amount = parseYocto(input.amountYocto);
  const entitlement = database.prepare("SELECT e.amount_yocto, e.status, a.account_id FROM studio_entitlements e JOIN studio_agents a ON a.id = e.agent_id WHERE e.revenue_id = ? AND e.agent_id = ?").get(input.revenueId, input.agentId) as { amount_yocto: string; status: string; account_id: string } | undefined;
  if (!entitlement || entitlement.account_id !== input.recipientAccountId || entitlement.status !== "owed" || amount !== parseYocto(entitlement.amount_yocto)) throw new Error("Payout does not match owed entitlement");
  if (database.prepare("SELECT 1 FROM studio_payouts WHERE revenue_id = ? AND agent_id = ? AND status IN ('requested','pending','paid','unknown')").get(input.revenueId, input.agentId)) throw new Error("Payout attempt already active or paid");
  database.prepare("INSERT INTO studio_payouts(id, revenue_id, agent_id, amount_yocto, recipient_account_id, status, created_at_ms) VALUES (?, ?, ?, ?, ?, 'requested', ?)").run(input.id, input.revenueId, input.agentId, input.amountYocto, input.recipientAccountId, nowMs);
}
