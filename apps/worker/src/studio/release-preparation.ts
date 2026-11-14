import { resolve } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { attestStudioAssetRights, readStudioPermissionReference, reviewStudioAsset, StudioMediaStore, transitionStudioWorkState } from "@studio/persistence";

interface DraftRow { readonly studio_id: string; readonly admin_account_id: string; readonly project_id: string; readonly kind: "song" | "album"; readonly state: string; readonly asset_hash: string; readonly license_ref: string; readonly provider: string; readonly metadata_hash: string; }

export function prepareAgentReviewedSong(database: DatabaseSync, media: StudioMediaStore, contractId: string, workId: string, version: number, reviewerId: string, permissionPath = process.env.STUDIO_PROVIDER_PERMISSION_PATH ?? resolve(process.cwd(), "../..", "private/studio-v2/rights/elevenlabs-permission.json")): void {
  const row = database.prepare("SELECT w.studio_id, s.admin_account_id, w.project_id, w.kind, v.state, v.asset_hash, v.metadata_hash, a.license_ref, a.provider FROM studio_work_versions v JOIN studio_works w ON w.id = v.work_id JOIN studios s ON s.id = w.studio_id JOIN studio_assets a ON a.hash = v.asset_hash WHERE v.work_id = ? AND v.version = ?").get(workId, version) as DraftRow | undefined;
  if (!row || row.kind !== "song" || !["review", "accepted"].includes(row.state)) throw new Error("ERR_RELEASE_DRAFT_MISSING");
  const reviewer = database.prepare("SELECT 1 FROM studio_agents WHERE id = ? AND studio_id = ? AND role = 'reviewer' AND active = 1 AND revoked_at_ms IS NULL AND (expires_at_ms IS NULL OR expires_at_ms > ?)").get(reviewerId, row.studio_id, Date.now());
  const modelReview = database.prepare("SELECT output_hash, output_json FROM studio_model_outputs WHERE project_id = ? AND agent_id = ? AND role = 'review' AND provider_mode = 'live' ORDER BY created_at_ms DESC LIMIT 1").get(row.project_id, reviewerId) as { output_hash: string; output_json: string } | undefined;
  const reviewContent = modelReview ? JSON.parse(modelReview.output_json) as { content?: unknown } : null;
  if (!reviewer || !modelReview || typeof reviewContent?.content !== "string" || !reviewContent.content.startsWith("ACCEPT:")) throw new Error("ERR_RELEASE_REVIEWER_APPROVAL_MISSING");
  media.get(row.asset_hash);
  media.get(row.metadata_hash);
  if (!database.prepare("SELECT 1 FROM studio_audio_generations WHERE work_id = ? AND work_version = ? AND asset_hash = ?").get(workId, version, row.asset_hash)) throw new Error("ERR_RELEASE_AUDIO_PROVENANCE");
  if (row.state === "accepted") return;
  const permissionRef = row.provider === "elevenlabs" ? readStudioPermissionReference(permissionPath, contractId) : undefined;
  const rights = database.prepare("SELECT public_playback, paid_purchase, tips, downloads, provider_permission_ref FROM studio_asset_rights WHERE asset_hash = ?").get(row.asset_hash) as { public_playback: number; paid_purchase: number; tips: number; downloads: number; provider_permission_ref: string | null } | undefined;
  if (rights && (!rights.public_playback || !rights.paid_purchase || !rights.tips || !rights.downloads || permissionRef && rights.provider_permission_ref !== permissionRef)) throw new Error("ERR_RELEASE_RIGHTS_MISMATCH");
  if (!database.prepare("SELECT 1 FROM studio_media_reviews WHERE asset_hash = ? AND reviewer_agent_id = ? AND decision = 'accept'").get(row.asset_hash, reviewerId)) {
    const notes = { method: "automated media integrity and saved agent creative review", assetHash: row.asset_hash, metadataHash: row.metadata_hash, reviewerAgentId: reviewerId, reviewOutputHash: modelReview.output_hash, humanListeningConfirmed: false };
    const notesHash = media.put(new TextEncoder().encode(JSON.stringify(notes))).hash;
    reviewStudioAsset(database, { assetHash: row.asset_hash, studioId: row.studio_id, reviewerAgentId: reviewerId, decision: "accept", notesHash });
  }
  if (!rights) attestStudioAssetRights(database, { assetHash: row.asset_hash, studioId: row.studio_id, adminAccountId: row.admin_account_id, licenseRef: row.license_ref, publicPlayback: true, paidPurchase: true, tips: true, downloads: true, ...(permissionRef ? { providerPermissionRef: permissionRef } : {}) });
  transitionStudioWorkState(database, workId, version, "review", "accepted");
}
