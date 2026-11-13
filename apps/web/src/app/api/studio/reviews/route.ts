import { resolve } from "node:path";
import { attestStudioAssetRights, readStudioPermissionReference, reviewStudioAsset, StudioMediaStore, transitionStudioWorkState } from "@studio/persistence";
import { requireOrigin } from "@/server/runtime";
import { requireStudioAdmin } from "@/server/studio-admin";
import { openStudioCatalogueDatabase, studioContractClient } from "@/server/studio-catalogue";

interface DraftRow { readonly asset_hash: string; readonly state: string; readonly kind: string; readonly provider: string; readonly license_ref: string; readonly current_version: number; }

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const { accountId, studioId } = await requireStudioAdmin();
    const body = await request.json() as { workId?: unknown; version?: unknown; reviewerId?: unknown; listened?: unknown; rightsConfirmed?: unknown };
    if (typeof body.workId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(body.workId) || !Number.isSafeInteger(body.version) || Number(body.version) < 1 || typeof body.reviewerId !== "string" || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(body.reviewerId) || body.listened !== true || body.rightsConfirmed !== true) return Response.json({ error: "ERR_REVIEW_INPUT" }, { status: 400 });
    const version = Number(body.version);
    const database = openStudioCatalogueDatabase();
    try {
      const row = database.prepare("SELECT v.asset_hash, v.state, w.kind, a.provider, a.license_ref, w.current_version FROM studio_work_versions v JOIN studio_works w ON w.id = v.work_id JOIN studio_assets a ON a.hash = v.asset_hash WHERE w.id = ? AND v.version = ? AND w.studio_id = ?").get(body.workId, version, studioId) as DraftRow | undefined;
      if (!row || row.current_version !== version || !["review", "accepted"].includes(row.state)) return Response.json({ error: "ERR_REVIEW_STALE_WORK" }, { status: 409 });
      const reviewer = database.prepare("SELECT 1 FROM studio_agents WHERE id = ? AND studio_id = ? AND role = 'reviewer' AND active = 1 AND revoked_at_ms IS NULL AND (expires_at_ms IS NULL OR expires_at_ms > ?)").get(body.reviewerId, studioId, Date.now());
      if (!reviewer) return Response.json({ error: "ERR_REVIEWER_SCOPE" }, { status: 409 });
      const media = new StudioMediaStore(resolve(/* turbopackIgnore: true */ process.cwd(), "../..", process.env.STUDIO_MEDIA_PATH ?? "private/studio-media"));
      const bytes = media.get(row.asset_hash);
      if (row.kind === "album" && (!new TextDecoder().decode(bytes.slice(0, 100)).startsWith("<svg") || (database.prepare("SELECT COUNT(*) AS n FROM studio_album_tracks WHERE album_id = ? AND album_version = ?").get(body.workId, version) as { n: number }).n < 2)) throw new Error("ERR_REVIEW_ALBUM_INVALID");
      const notes = { workId: body.workId, version, assetHash: row.asset_hash, reviewerAgentId: body.reviewerId, adminAccountId: accountId, humanListeningConfirmed: true, rightsConfirmed: true, reviewMethod: "admin inspected private draft media and confirmed the reviewer agent's creative approval" };
      const notesHash = media.put(new TextEncoder().encode(JSON.stringify(notes))).hash;
      if (!database.prepare("SELECT 1 FROM studio_media_reviews WHERE asset_hash = ? AND reviewer_agent_id = ? AND decision = 'accept'").get(row.asset_hash, body.reviewerId)) reviewStudioAsset(database, { assetHash: row.asset_hash, studioId, reviewerAgentId: body.reviewerId, decision: "accept", notesHash });
      const permissionRef = row.provider === "elevenlabs" ? readStudioPermissionReference(resolve(/* turbopackIgnore: true */ process.cwd(), "../..", "private/studio-v2/rights/elevenlabs-permission.json"), studioContractClient().contractId) : undefined;
      const rights = database.prepare("SELECT public_playback, paid_purchase, tips, downloads, provider_permission_ref FROM studio_asset_rights WHERE asset_hash = ?").get(row.asset_hash) as { public_playback: number; paid_purchase: number; tips: number; downloads: number; provider_permission_ref: string | null } | undefined;
      if (!rights) attestStudioAssetRights(database, { assetHash: row.asset_hash, studioId, adminAccountId: accountId, licenseRef: row.license_ref, publicPlayback: true, paidPurchase: true, tips: true, downloads: true, ...(permissionRef ? { providerPermissionRef: permissionRef } : {}) });
      else if (!rights.public_playback || !rights.paid_purchase || !rights.tips || !rights.downloads || (permissionRef && rights.provider_permission_ref !== permissionRef)) throw new Error("ERR_REVIEW_RIGHTS_MISMATCH");
      if (row.state === "review") transitionStudioWorkState(database, body.workId, version, "review", "accepted");
      return Response.json({ workId: body.workId, version, state: "accepted", assetHash: row.asset_hash }, { headers: { "cache-control": "no-store" } });
    } finally { database.close(); }
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERR_REVIEW_FAILED";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 409 });
  }
}
