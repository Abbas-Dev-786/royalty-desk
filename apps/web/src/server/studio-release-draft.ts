import "server-only";
import { validateStudioReleaseInput, studioDigest, type StudioReleaseInput } from "@studio/chain";
import { StudioMediaStore } from "@studio/persistence";
import { resolve } from "node:path";
import { openStudioCatalogueDatabase } from "./studio-catalogue";

interface VersionRow { readonly studio_id: string; readonly kind: "song" | "album"; readonly state: string; readonly asset_hash: string; readonly metadata_hash: string; readonly price_yocto: string; readonly split_json: string; readonly provider: string; readonly expires_at_ms: number | null; readonly public_playback: number; readonly paid_purchase: number; readonly tips: number; readonly downloads: number; readonly provider_permission_ref: string | null; }

export function acceptedStudioReleaseInput(studioId: string, workId: string, version: number, policyEpoch: number): StudioReleaseInput {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(workId) || !Number.isSafeInteger(version) || version < 1) throw new Error("ERR_RELEASE_INPUT");
  const database = openStudioCatalogueDatabase();
  try {
    const row = database.prepare("SELECT w.studio_id, w.kind, v.state, v.asset_hash, v.metadata_hash, v.price_yocto, v.split_json, a.provider, r.expires_at_ms, r.public_playback, r.paid_purchase, r.tips, r.downloads, r.provider_permission_ref FROM studio_work_versions v JOIN studio_works w ON w.id = v.work_id JOIN studio_assets a ON a.hash = v.asset_hash JOIN studio_asset_rights r ON r.asset_hash = v.asset_hash WHERE v.work_id = ? AND v.version = ?").get(workId, version) as VersionRow | undefined;
    if (!row || row.studio_id !== studioId || row.state !== "accepted") throw new Error("ERR_RELEASE_NOT_ACCEPTED");
    if (!row.public_playback || !row.paid_purchase || !row.tips || !row.downloads || row.expires_at_ms !== null && row.expires_at_ms <= Date.now() || row.provider === "elevenlabs" && !row.provider_permission_ref) throw new Error("ERR_RELEASE_RIGHTS");
    if (!database.prepare("SELECT 1 FROM studio_media_reviews WHERE asset_hash = ? AND decision = 'accept'").get(row.asset_hash) || database.prepare("SELECT 1 FROM studio_asset_quarantines WHERE asset_hash = ? AND cleared_at_ms IS NULL").get(row.asset_hash)) throw new Error("ERR_RELEASE_MEDIA_REVIEW");
    new StudioMediaStore(resolve(/* turbopackIgnore: true */ process.cwd(), "../..", process.env.STUDIO_MEDIA_PATH ?? "private/studio-media")).get(row.asset_hash);
    const split = JSON.parse(row.split_json) as { agentId: string; basisPoints: number }[];
    const shares = split.map((share) => {
      const agent = database.prepare("SELECT account_id FROM studio_agents WHERE id = ? AND studio_id = ? AND active = 1 AND revoked_at_ms IS NULL AND (expires_at_ms IS NULL OR expires_at_ms > ?)").get(share.agentId, studioId, Date.now()) as { account_id: string } | undefined;
      if (!agent) throw new Error("ERR_RELEASE_AGENT_SCOPE");
      return { account_id: agent.account_id, basis_points: share.basisPoints };
    });
    const tracks = row.kind === "album" ? database.prepare("SELECT song_id, song_version, basis_points FROM studio_album_tracks WHERE album_id = ? AND album_version = ? ORDER BY track_number").all(workId, version).map((track) => ({ song_id: String(track.song_id), song_version: Number(track.song_version), basis_points: Number(track.basis_points) })) : [];
    if (row.kind === "album" && tracks.length < 2) throw new Error("ERR_RELEASE_ALBUM_TRACKS");
    const input: StudioReleaseInput = { work_id: workId, version, kind: row.kind, media_hash: row.asset_hash, metadata_hash: row.metadata_hash, split_hash: studioDigest(shares), track_order_hash: studioDigest(tracks), price_yocto: row.price_yocto, shares, tracks, policy_epoch: policyEpoch };
    validateStudioReleaseInput(input);
    return input;
  } finally { database.close(); }
}
