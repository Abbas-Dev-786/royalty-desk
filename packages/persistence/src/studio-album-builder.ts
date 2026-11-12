import { createHash } from "node:crypto";
import type { DatabaseSync } from "node:sqlite";
import { addAlbumTracks, addWorkVersion, createStudioWork } from "./studio-store.ts";
import { addStudioAsset } from "./studio-records.ts";
import { StudioMediaStore } from "./studio-media-store.ts";
import { requireStudioId, validateShares, type ContributionShare } from "@royaltydesk/domain";

const digest = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
const xml = (value: string): string => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export interface AlbumDraftInput { readonly studioId: string; readonly projectId: string; readonly title: string; readonly songIds: readonly [string, string]; }
export interface AlbumDraftResult { readonly workId: string; readonly version: 1; readonly assetHash: string; readonly metadataHash: string; readonly state: "review"; }

interface SongRow { readonly id: string; readonly studio_id: string; readonly project_id: string; readonly current_version: number; readonly state: string; readonly split_json: string; readonly asset_hash: string; }

export function createStudioAlbumDraft(database: DatabaseSync, media: StudioMediaStore, input: AlbumDraftInput): AlbumDraftResult {
  requireStudioId(input.studioId);
  requireStudioId(input.projectId);
  if (!input.title.trim() || input.title.length > 160 || input.songIds.length !== 2 || input.songIds[0] === input.songIds[1]) throw new Error("ERR_ALBUM_INPUT");
  const songs = input.songIds.map((id) => {
    requireStudioId(id);
    const song = database.prepare("SELECT w.id, w.studio_id, w.project_id, w.current_version, v.state, v.split_json, v.asset_hash FROM studio_works w JOIN studio_work_versions v ON v.work_id = w.id AND v.version = w.current_version WHERE w.id = ? AND w.kind = 'song'").get(id) as SongRow | undefined;
    if (!song || song.studio_id !== input.studioId || song.project_id !== input.projectId || !["review", "accepted"].includes(song.state)) throw new Error("ERR_ALBUM_SONG_SCOPE_OR_STATE");
    if (!database.prepare("SELECT 1 FROM studio_assets WHERE hash = ?").get(song.asset_hash)) throw new Error("ERR_ALBUM_SONG_ASSET_MISSING");
    return song;
  });
  const totals = new Map<string, number>();
  for (const song of songs) {
    const shares = JSON.parse(song.split_json) as ContributionShare[];
    validateShares(shares);
    for (const share of shares) totals.set(share.agentId, (totals.get(share.agentId) ?? 0) + share.basisPoints);
  }
  const split = [...totals].sort(([left], [right]) => left.localeCompare(right)).map(([agentId, total]) => ({ agentId, basisPoints: Math.floor(total / 2) }));
  split[split.length - 1]!.basisPoints += 10_000 - split.reduce((sum, entry) => sum + entry.basisPoints, 0);
  validateShares(split);
  const workId = `album-${digest(`${input.projectId}:${input.songIds.join(":")}`).slice(0, 24)}`;
  const cover = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200"><rect width="1200" height="1200" fill="#172d39"/><circle cx="855" cy="345" r="205" fill="#f2be7b"/><path d="M0 690 Q300 560 610 690 T1200 690 V1200 H0Z" fill="#326b78"/><path d="M0 815 Q300 685 610 815 T1200 815 V1200 H0Z" fill="#214d60"/><text x="85" y="1030" fill="#fff4df" font-family="Georgia,serif" font-size="72">${xml(input.title.trim().slice(0, 28))}</text><text x="90" y="1100" fill="#fff4df" font-family="Arial,sans-serif" font-size="28">TWO ORIGINAL SONGS</text></svg>`;
  const assetHash = media.put(new TextEncoder().encode(cover)).hash;
  const tracks = songs.map((song) => ({ songId: song.id, songVersion: song.current_version, basisPoints: 5000 })) as [{ songId: string; songVersion: number; basisPoints: number }, { songId: string; songVersion: number; basisPoints: number }];
  const metadataHash = media.put(new TextEncoder().encode(JSON.stringify({ title: input.title.trim(), tracks, coverHash: assetHash, split }))).hash;
  if (!database.prepare("SELECT 1 FROM studio_assets WHERE hash = ?").get(assetHash)) addStudioAsset(database, { hash: assetHash, provider: "project-original", model: "vector-cover-v1", licenseRef: "owner-created-cover-artwork", storageKey: `${assetHash}.bin`, mimeType: "image/svg+xml", sizeBytes: media.get(assetHash).byteLength });
  const existingWork = database.prepare("SELECT studio_id, project_id, kind FROM studio_works WHERE id = ?").get(workId) as { studio_id: string; project_id: string; kind: string } | undefined;
  if (existingWork && (existingWork.studio_id !== input.studioId || existingWork.project_id !== input.projectId || existingWork.kind !== "album")) throw new Error("ERR_ALBUM_WORK_COLLISION");
  if (!existingWork) createStudioWork(database, { id: workId, studioId: input.studioId, projectId: input.projectId, kind: "album" });
  const version = database.prepare("SELECT title, asset_hash, metadata_hash FROM studio_work_versions WHERE work_id = ? AND version = 1").get(workId) as { title: string; asset_hash: string; metadata_hash: string } | undefined;
  if (version && (version.title !== input.title.trim() || version.asset_hash !== assetHash || version.metadata_hash !== metadataHash)) throw new Error("ERR_ALBUM_VERSION_CHANGED");
  if (!version) addWorkVersion(database, { workId, studioId: input.studioId, version: 1, kind: "album", state: "review", title: input.title.trim(), assetHash, metadataHash, priceYocto: "15000000000000000000000", split });
  if (!database.prepare("SELECT 1 FROM studio_album_tracks WHERE album_id = ? AND album_version = 1").get(workId)) addAlbumTracks(database, workId, 1, tracks);
  return { workId, version: 1, assetHash, metadataHash, state: "review" };
}
