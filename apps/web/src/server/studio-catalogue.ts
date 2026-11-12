import "server-only";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { JsonRpcProvider } from "near-api-js";
import { StudioContractClient, studioDigest, type StudioReleaseView } from "@royaltydesk/chain";
import { openDatabase, StudioMediaStore } from "@royaltydesk/persistence";

export interface CatalogueTrack { readonly workId: string; readonly version: number; readonly title: string; readonly assetHash: string; readonly basisPoints: number; }
export interface CatalogueItem { readonly workId: string; readonly version: number; readonly kind: "song" | "album"; readonly title: string; readonly assetHash: string; readonly metadataHash: string; readonly priceYocto: string; readonly commitment: string; readonly credits: readonly { readonly accountId: string; readonly basisPoints: number }[]; readonly tracks: readonly CatalogueTrack[]; }
interface LocalPublication { readonly work_id: string; readonly work_version: number; readonly chain_commitment: string; readonly title: string; readonly asset_hash: string; readonly metadata_hash: string; readonly price_yocto: string; readonly split_json: string; readonly kind: "song" | "album"; readonly mime_type: string; readonly provider: string; readonly permission_ref: string | null; }

const dbPath = resolve(/* turbopackIgnore: true */ process.cwd(), "../..", process.env.STUDIO_CATALOGUE_DB_PATH ?? "private/studio-v2/phase03/studio.sqlite");
const mediaPath = resolve(/* turbopackIgnore: true */ process.cwd(), "../..", process.env.STUDIO_MEDIA_PATH ?? "private/studio-media");

export function studioContractClient(): StudioContractClient {
  const id = process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID;
  if (!id || id === "studio.example.testnet") throw new Error("STUDIO_CONTRACT_NOT_CONFIGURED");
  return new StudioContractClient(id, new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" }));
}
export function openStudioCatalogueDatabase() {
  if (!existsSync(dbPath)) throw new Error("STUDIO_CATALOGUE_DB_MISSING");
  return openDatabase(dbPath);
}
function localRow(db: ReturnType<typeof openStudioCatalogueDatabase>, workId: string, version: number): LocalPublication | undefined {
  return db.prepare(`SELECT p.work_id, p.work_version, p.chain_commitment, v.title, v.asset_hash, v.metadata_hash, v.price_yocto, v.split_json, w.kind, a.mime_type, a.provider, r.provider_permission_ref AS permission_ref
    FROM studio_publications p JOIN studio_work_versions v ON v.work_id = p.work_id AND v.version = p.work_version
    JOIN studio_works w ON w.id = p.work_id JOIN studio_assets a ON a.hash = v.asset_hash
    JOIN studio_asset_rights r ON r.asset_hash = v.asset_hash
    WHERE p.work_id = ? AND p.work_version = ? AND p.unpublished_at_ms IS NULL
      AND r.public_playback = 1 AND r.paid_purchase = 1 AND r.tips = 1 AND r.downloads = 1
      AND (r.expires_at_ms IS NULL OR r.expires_at_ms > ?)
      AND EXISTS (SELECT 1 FROM studio_media_reviews mr WHERE mr.asset_hash = v.asset_hash AND mr.decision = 'accept')
      AND NOT EXISTS (SELECT 1 FROM studio_asset_quarantines q WHERE q.asset_hash = v.asset_hash AND q.cleared_at_ms IS NULL)`)
    .get(workId, version, Date.now()) as LocalPublication | undefined;
}
function credits(db: ReturnType<typeof openStudioCatalogueDatabase>, row: LocalPublication): { accountId: string; basisPoints: number }[] {
  const split = JSON.parse(row.split_json) as { agentId: string; basisPoints: number }[];
  return split.map((share) => {
    const agent = db.prepare("SELECT account_id FROM studio_agents WHERE id = ?").get(share.agentId) as { account_id: string } | undefined;
    if (!agent) throw new Error("CATALOGUE_AGENT_MISSING");
    return { accountId: agent.account_id, basisPoints: share.basisPoints };
  });
}
function releaseMatches(row: LocalPublication, chain: StudioReleaseView, contributors: readonly { accountId: string; basisPoints: number }[]): boolean {
  return chain.published && chain.work_id === row.work_id && chain.version === row.work_version && chain.kind === row.kind && chain.commitment === row.chain_commitment && chain.media_hash === row.asset_hash && chain.metadata_hash === row.metadata_hash && chain.price_yocto === row.price_yocto && chain.split_hash === studioDigest(chain.shares) && JSON.stringify(chain.shares) === JSON.stringify(contributors.map((share) => ({ account_id: share.accountId, basis_points: share.basisPoints })));
}
async function verifiedItem(db: ReturnType<typeof openStudioCatalogueDatabase>, chainClient: StudioContractClient, row: LocalPublication): Promise<CatalogueItem> {
  if (row.provider === "elevenlabs" && !row.permission_ref) throw new Error("CATALOGUE_PERMISSION_REF_MISSING");
  const contributors = credits(db, row);
  const chain = await chainClient.release(row.work_id, row.work_version);
  if (!chain || !releaseMatches(row, chain, contributors)) throw new Error("CATALOGUE_CHAIN_MISMATCH");
  const media = new StudioMediaStore(mediaPath);
  media.get(row.asset_hash);
  const localTracks = db.prepare("SELECT t.song_id, t.song_version, t.basis_points, v.title, v.asset_hash FROM studio_album_tracks t JOIN studio_work_versions v ON v.work_id = t.song_id AND v.version = t.song_version WHERE t.album_id = ? AND t.album_version = ? ORDER BY t.track_number").all(row.work_id, row.work_version) as unknown as { song_id: string; song_version: number; basis_points: number; title: string; asset_hash: string }[];
  const tracks: CatalogueTrack[] = [];
  if (row.kind === "album") {
    if (chain.tracks.length !== localTracks.length || localTracks.length < 2) throw new Error("CATALOGUE_TRACK_MISMATCH");
    for (let index = 0; index < localTracks.length; index += 1) {
      const local = localTracks[index];
      const committed = chain.tracks[index];
      if (!local || !committed || committed.song_id !== local.song_id || committed.song_version !== local.song_version || committed.basis_points !== local.basis_points) throw new Error("CATALOGUE_TRACK_MISMATCH");
      const song = localRow(db, local.song_id, local.song_version);
      if (!song || song.asset_hash !== local.asset_hash || (song.provider === "elevenlabs" && !song.permission_ref)) throw new Error("CATALOGUE_SONG_UNPUBLISHED");
      const songChain = await chainClient.release(local.song_id, local.song_version);
      if (!songChain || !releaseMatches(song, songChain, credits(db, song))) throw new Error("CATALOGUE_SONG_CHAIN_MISMATCH");
      media.get(local.asset_hash);
      tracks.push({ workId: local.song_id, version: local.song_version, title: local.title, assetHash: local.asset_hash, basisPoints: local.basis_points });
    }
  } else if (localTracks.length || chain.tracks.length) throw new Error("CATALOGUE_SONG_TRACK_MISMATCH");
  return { workId: row.work_id, version: row.work_version, kind: row.kind, title: row.title, assetHash: row.asset_hash, metadataHash: row.metadata_hash, priceYocto: row.price_yocto, commitment: row.chain_commitment, credits: contributors, tracks };
}

export async function catalogueSnapshot(query = ""): Promise<{ readonly items: readonly CatalogueItem[]; readonly staleCount: number }> {
  const db = openStudioCatalogueDatabase();
  try {
    const rows = db.prepare("SELECT work_id, work_version FROM studio_publications WHERE unpublished_at_ms IS NULL ORDER BY published_at_ms DESC LIMIT 50").all() as { work_id: string; work_version: number }[];
    if (!rows.length) return { items: [], staleCount: 0 };
    const chainClient = studioContractClient();
    const result: CatalogueItem[] = [];
    let staleCount = 0;
    for (const candidate of rows) {
      const row = localRow(db, candidate.work_id, candidate.work_version);
      if (!row) { staleCount += 1; continue; }
      if (query && !row.title.toLowerCase().includes(query.toLowerCase())) continue;
      try { result.push(await verifiedItem(db, chainClient, row)); } catch (error) { console.warn("Studio catalogue excluded stale release", { workId: row.work_id, version: row.work_version, reason: error instanceof Error ? error.message : "unknown" }); staleCount += 1; }
    }
    return { items: result, staleCount };
  } finally { db.close(); }
}
export async function listCatalogue(query = ""): Promise<readonly CatalogueItem[]> { return (await catalogueSnapshot(query)).items; }

export async function publishedMedia(assetHash: string): Promise<{ readonly bytes: Uint8Array; readonly mimeType: string } | null> {
  if (!/^[0-9a-f]{64}$/.test(assetHash)) return null;
  const db = openStudioCatalogueDatabase();
  try {
    const matches = db.prepare("SELECT work_id, version AS work_version FROM studio_work_versions WHERE asset_hash = ? LIMIT 20").all(assetHash) as { work_id: string; work_version: number }[];
    for (const match of matches) {
      const row = localRow(db, match.work_id, match.work_version);
      if (!row) continue;
      try {
        await verifiedItem(db, studioContractClient(), row);
        return { bytes: new StudioMediaStore(mediaPath).get(assetHash), mimeType: row.mime_type };
      } catch { /* Continue only if another published version safely references the blob. */ }
    }
    return null;
  } finally { db.close(); }
}
