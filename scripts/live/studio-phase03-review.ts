import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { openDatabase, StudioMediaStore, reviewStudioAsset, attestStudioAssetRights, addWorkVersion, addAlbumTracks } from "@studio/persistence";
import { validateMusicMp3 } from "../../apps/worker/src/studio/media-validation.ts";

const root = resolve("private/studio-v2/phase03");
const database = openDatabase(resolve(root, "studio.sqlite"));
const media = new StudioMediaStore(resolve(process.env.STUDIO_MEDIA_PATH ?? "private/studio-media"));
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
const songs = ["song-phase03-1", "song-phase03-2"] as const;
const studioId = "studio-phase03";
const reviewDir = resolve(root, "review");
mkdirSync(reviewDir, { recursive: true });

try {
  const operation = database.prepare("SELECT COUNT(*) AS calls, COALESCE(SUM(requested_duration_ms), 0) AS duration FROM studio_external_operations WHERE operation_type = 'elevenlabs_music' AND status = 'finalized'").get() as { calls: number; duration: number };
  if (operation.calls !== 2 || operation.duration !== 40_000) throw new Error("Phase 03 paid-call ledger does not match the approved two-song budget");
  const accepted: { songId: string; version: number; assetHash: string; title: string }[] = [];
  for (const songId of songs) {
    const row = database.prepare("SELECT v.title, v.asset_hash, v.metadata_hash, v.price_yocto, v.split_json, a.license_ref, g.input_hash, g.prompt_hash, g.provider, g.model FROM studio_work_versions v JOIN studio_assets a ON a.hash = v.asset_hash JOIN studio_audio_generations g ON g.asset_hash = v.asset_hash WHERE v.work_id = ? AND v.version = 1").get(songId) as { title: string; asset_hash: string; metadata_hash: string; price_yocto: string; split_json: string; license_ref: string; input_hash: string; prompt_hash: string; provider: string; model: string } | undefined;
    if (!row || row.provider !== "elevenlabs" || row.model !== "music_v2_5") throw new Error(`Missing final generation: ${songId}`);
    const metadata = readFileSync(resolve(root, `${songId}.json`), "utf8");
    if (hash(JSON.stringify(JSON.parse(metadata))) !== row.metadata_hash) throw new Error(`Metadata hash mismatch: ${songId}`);
    const bytes = media.get(row.asset_hash);
    const checked = await validateMusicMp3(bytes, 20_000);
    const notes = {
      assetHash: row.asset_hash,
      songId,
      reviewMethod: "deterministic decoded-media inspection plus owner listening attestation",
      ownerListeningAttestation: "Owner listened to both generated songs and confirmed the vocals are clearly sung and both songs are acceptable for the demo album on 2026-11-12.",
      exactLyricTranscription: "not independently measured",
      technical: checked,
      generation: { provider: row.provider, model: row.model, inputHash: row.input_hash, planHash: row.prompt_hash },
      rightsBasis: "Owner attested written ElevenLabs permission for hackathon testnet catalogue playback, purchases, tips and downloads; agreement document was not inspected by this script."
    };
    const notesText = JSON.stringify(notes, null, 2);
    const notesHash = hash(notesText);
    const notesPath = resolve(reviewDir, `${songId}-review.json`);
    if (existsSync(notesPath) && hash(readFileSync(notesPath, "utf8")) !== notesHash) throw new Error(`Existing review notes differ: ${songId}`);
    if (!existsSync(notesPath)) writeFileSync(notesPath, notesText);
    if (!database.prepare("SELECT 1 FROM studio_media_reviews WHERE asset_hash = ? AND reviewer_agent_id = 'reviewer-phase03'").get(row.asset_hash)) {
      reviewStudioAsset(database, { assetHash: row.asset_hash, studioId, reviewerAgentId: "reviewer-phase03", decision: "accept", notesHash });
    }
    if (!database.prepare("SELECT 1 FROM studio_asset_rights WHERE asset_hash = ?").get(row.asset_hash)) {
      attestStudioAssetRights(database, { assetHash: row.asset_hash, studioId, adminAccountId: "admin.testnet", licenseRef: row.license_ref, publicPlayback: true, paidPurchase: true, tips: true, downloads: true });
    }
    if (!database.prepare("SELECT 1 FROM studio_work_versions WHERE work_id = ? AND version = 2").get(songId)) {
      addWorkVersion(database, { workId: songId, studioId, version: 2, kind: "song", state: "accepted", title: row.title, assetHash: row.asset_hash, metadataHash: row.metadata_hash, priceYocto: row.price_yocto, split: JSON.parse(row.split_json) });
    }
    accepted.push({ songId, version: 2, assetHash: row.asset_hash, title: row.title });
  }
  const album = database.prepare("SELECT v.asset_hash, v.title, v.price_yocto, v.split_json, a.license_ref FROM studio_work_versions v JOIN studio_assets a ON a.hash = v.asset_hash WHERE v.work_id = 'album-phase03' AND v.version = 1").get() as { asset_hash: string; title: string; price_yocto: string; split_json: string; license_ref: string } | undefined;
  if (!album) throw new Error("Album draft is missing");
  const cover = media.get(album.asset_hash);
  const coverText = new TextDecoder("utf-8", { fatal: true }).decode(cover);
  if (!coverText.startsWith("<svg ") || !coverText.includes("RIVER DAWN")) throw new Error("Album cover validation failed");
  const tracks = accepted.map((song, index) => ({ songId: song.songId, songVersion: 2, basisPoints: 5000, trackNumber: index + 1 }));
  const metadata = { title: album.title, tracks, coverHash: album.asset_hash };
  const albumNotes = JSON.stringify({ assetHash: album.asset_hash, reviewMethod: "content-addressed original SVG inspection", ownerListeningAttestation: "Owner accepted both album songs on 2026-11-12.", tracks }, null, 2);
  const albumNotesPath = resolve(reviewDir, "album-phase03-review.json");
  if (existsSync(albumNotesPath) && hash(readFileSync(albumNotesPath, "utf8")) !== hash(albumNotes)) throw new Error("Existing album review notes differ");
  if (!existsSync(albumNotesPath)) writeFileSync(albumNotesPath, albumNotes);
  if (!database.prepare("SELECT 1 FROM studio_media_reviews WHERE asset_hash = ? AND reviewer_agent_id = 'reviewer-phase03'").get(album.asset_hash)) reviewStudioAsset(database, { assetHash: album.asset_hash, studioId, reviewerAgentId: "reviewer-phase03", decision: "accept", notesHash: hash(albumNotes) });
  if (!database.prepare("SELECT 1 FROM studio_asset_rights WHERE asset_hash = ?").get(album.asset_hash)) attestStudioAssetRights(database, { assetHash: album.asset_hash, studioId, adminAccountId: "admin.testnet", licenseRef: album.license_ref, publicPlayback: true, paidPurchase: true, tips: true, downloads: true });
  if (!database.prepare("SELECT 1 FROM studio_work_versions WHERE work_id = 'album-phase03' AND version = 2").get()) {
    addWorkVersion(database, { workId: "album-phase03", studioId, version: 2, kind: "album", state: "accepted", title: album.title, assetHash: album.asset_hash, metadataHash: hash(JSON.stringify(metadata)), priceYocto: album.price_yocto, split: JSON.parse(album.split_json) });
    addAlbumTracks(database, "album-phase03", 2, tracks);
  }
  writeFileSync(resolve(root, "album-phase03.json"), JSON.stringify(metadata, null, 2));
  console.log(JSON.stringify({ status: "accepted_private_album", albumId: "album-phase03", albumVersion: 2, coverHash: album.asset_hash, tracks: accepted, paidCalls: operation.calls, requestedDurationMs: operation.duration }));
} finally { database.close(); }
