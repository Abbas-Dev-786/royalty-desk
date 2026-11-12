import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { addAlbumTracks, addStudioAgent, addStudioAsset, addStudioContribution, addStudioPolicy, addWorkVersion, createStudio, createStudioProject, createStudioWork, openDatabase, StudioMediaStore } from "@royaltydesk/persistence";
import { createElevenLabsMusicProvider, musicPlanHash, type ElevenLabsSongRequest } from "../../apps/worker/src/studio/elevenlabs-music-provider.ts";
import { generateElevenLabsSong } from "../../apps/worker/src/studio/elevenlabs-music-service.ts";

const digest = (input: string) => createHash("sha256").update(input, "utf8").digest("hex");
const root = resolve("private/studio-v2/phase03");
const databasePath = resolve(root, "studio.sqlite");
const media = new StudioMediaStore(resolve(process.env.STUDIO_MEDIA_PATH ?? "private/studio-media"));
const studioId = "studio-phase03";
const projectId = "project-phase03-river";
const licenseRef = "owner-attested-written-elevenlabs-hackathon-testnet-2026-11-11";
const split = [{ agentId: "lyricist-phase03", basisPoints: 5000 }, { agentId: "composer-phase03", basisPoints: 5000 }] as const;

interface SongInput { readonly id: string; readonly title: string; readonly source: string; readonly lines: readonly string[]; readonly styles: readonly string[] }
const songs: readonly SongInput[] = [
  {
    id: "song-phase03-1", title: "River of First Light", source: "private/studio-v2/sources/song-1.sqlite",
    lines: ["Soft light wakes on the water's skin,", "mist unwinds where the reeds begin,", "one slow oar dips, the ripples sigh,", "and the river carries morning by."],
    styles: ["intimate acoustic folk", "clear English sung vocals", "gentle fingerpicked guitar", "warm low strings", "soft brushed percussion", "D major", "72 BPM", "quiet river sunrise", "polished natural recording"]
  },
  {
    id: "song-phase03-2", title: "Riverlight", source: "private/studio-v2/sources/song-2.sqlite",
    lines: ["Gold spills slow where the river bends,", "Mist unwinds as the dark ascends,", "Herons wake where the reeds begin,", "Morning hums and the light drifts in."],
    styles: ["hushed indie folk", "clear English sung vocals", "fingerpicked acoustic guitar", "airy cello", "swaying 6/8 pulse", "G major", "68 BPM", "warm morning light", "polished intimate recording"]
  }
];

function sourceOutput(path: string, role: "lyrics" | "composition"): { readonly content: string; readonly hash: string } {
  const source = new DatabaseSync(resolve(path), { readOnly: true });
  try {
    const row = source.prepare("SELECT output_json, output_hash FROM studio_model_outputs WHERE role = ? AND provider_mode = 'live' ORDER BY created_at_ms DESC LIMIT 1").get(role) as { output_json: string; output_hash: string } | undefined;
    if (!row) throw new Error(`Missing live ${role} source: ${path}`);
    const content = (JSON.parse(row.output_json) as { content?: unknown }).content;
    if (typeof content !== "string" || !content.trim()) throw new Error(`Invalid ${role} source`);
    return { content, hash: row.output_hash };
  } finally { source.close(); }
}

function planFor(song: SongInput, lyricSource: { readonly content: string }): ElevenLabsSongRequest {
  for (const line of song.lines) if (!lyricSource.content.includes(line)) throw new Error(`Source lyric mismatch for ${song.id}: ${line}`);
  return { model: "music_v2_5", chunks: [{ text: `[Verse]\n${song.lines.join("\n")}`, durationMs: 20_000, positiveStyles: song.styles, negativeStyles: ["spoken word", "a cappella", "named artist imitation", "existing song melody"], contextAdherence: "high" }] };
}

const prepared = songs.map((song) => {
  const lyrics = sourceOutput(song.source, "lyrics");
  const composition = sourceOutput(song.source, "composition");
  const plan = planFor(song, lyrics);
  return { song, lyrics, composition, plan };
});

if (!process.argv.includes("--execute")) {
  console.log(JSON.stringify({ status: "dry_run", provider: "elevenlabs", model: "music_v2_5", plannedPaidCalls: 2, totalRequestedDurationMs: 40_000, songs: prepared.map(({ song, lyrics, composition, plan }) => ({ title: song.title, workId: song.id, lyricsHash: lyrics.hash, compositionHash: composition.hash, planHash: musicPlanHash(plan), durationMs: 20_000 })) }));
  process.exit(0);
}
const apiKey = process.env.ELEVENLABS_API_KEY;
if (!apiKey || /replace|placeholder|your-key/i.test(apiKey)) throw new Error("ELEVENLABS_API_KEY is not configured");
mkdirSync(root, { recursive: true });
const database = openDatabase(databasePath);
try {
  if (!database.prepare("SELECT 1 FROM studios WHERE id = ?").get(studioId)) {
    createStudio(database, studioId, "admin.testnet");
    createStudioProject(database, { id: projectId, studioId, title: "River Dawn" });
    addStudioAgent(database, { id: "lyricist-phase03", studioId, accountId: "lyricist.testnet", controllerAccountId: "admin.testnet", role: "lyricist", active: true, allowedTools: ["lyrics", "split_proposal"] });
    addStudioAgent(database, { id: "composer-phase03", studioId, accountId: "composer.testnet", controllerAccountId: "admin.testnet", role: "composer", active: true, allowedTools: ["composition", "music_generation", "split_response"] });
    addStudioAgent(database, { id: "reviewer-phase03", studioId, accountId: "reviewer.testnet", controllerAccountId: "admin.testnet", role: "reviewer", active: true, allowedTools: ["review"] });
    addStudioPolicy(database, { studioId, version: 1, mode: "autonomous", maxGenerationCalls: 2, maxMusicRequestDurationMs: 20_000, maxMusicTotalDurationMs: 40_000, maxPayoutYocto: "0", paused: false });
    for (const { song } of prepared) createStudioWork(database, { id: song.id, studioId, projectId, kind: "song" });
    createStudioWork(database, { id: "album-phase03", studioId, projectId, kind: "album" });
  }
  const provider = createElevenLabsMusicProvider({ apiKey });
  for (const { song, lyrics, composition, plan } of prepared) {
    const result = await generateElevenLabsSong(database, media, provider, { projectId, workId: song.id, workVersion: 1, revision: 0, agentId: "composer-phase03", plan, licenseRef });
    const metadata = { title: song.title, lyrics: song.lines, credits: [{ agentId: "lyricist-phase03", role: "lyrics" }, { agentId: "composer-phase03", role: "composition and generation" }], lyricSourceHash: lyrics.hash, compositionSourceHash: composition.hash, planHash: result.planHash, assetHash: result.assetHash };
    const metadataHash = digest(JSON.stringify(metadata));
    writeFileSync(resolve(root, `${song.id}.json`), JSON.stringify(metadata, null, 2), { encoding: "utf8" });
    if (!database.prepare("SELECT 1 FROM studio_work_versions WHERE work_id = ? AND version = 1").get(song.id)) {
      addWorkVersion(database, { workId: song.id, studioId, version: 1, kind: "song", state: "review", title: song.title, assetHash: result.assetHash, metadataHash, priceYocto: "10000000000000000000000", split });
      addStudioContribution(database, { id: `${song.id}-lyrics`, workId: song.id, workVersion: 1, agentId: "lyricist-phase03", kind: "lyrics", contentHash: lyrics.hash });
      addStudioContribution(database, { id: `${song.id}-composition`, workId: song.id, workVersion: 1, agentId: "composer-phase03", kind: "composition", contentHash: composition.hash });
    }
    console.log(JSON.stringify({ status: "private_review", title: song.title, assetHash: result.assetHash, durationMs: result.durationMs, operationId: result.operationId, providerRequestId: result.providerRequestId }));
  }
  if (!database.prepare("SELECT 1 FROM studio_work_versions WHERE work_id = 'album-phase03' AND version = 1").get()) {
    const cover = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="1200" viewBox="0 0 1200 1200"><rect width="1200" height="1200" fill="#152b36"/><circle cx="820" cy="360" r="190" fill="#edb975"/><path d="M0 670 C260 590 390 770 650 675 S990 580 1200 670 V1200 H0Z" fill="#2f6773"/><path d="M0 795 C260 715 390 895 650 800 S990 705 1200 795 V1200 H0Z" fill="#204c5e"/><text x="90" y="1020" fill="#fff2d9" font-family="Georgia,serif" font-size="104">RIVER DAWN</text><text x="95" y="1080" fill="#fff2d9" font-family="Arial,sans-serif" font-size="28" letter-spacing="10">TWO SONGS · ONE SUNRISE</text></svg>`;
    const coverBytes = new TextEncoder().encode(cover);
    const stored = media.put(coverBytes);
    addStudioAsset(database, { hash: stored.hash, provider: "project-original", model: "vector-cover-v1", licenseRef: "owner-created-cover-artwork", storageKey: `${stored.hash}.bin`, mimeType: "image/svg+xml", sizeBytes: stored.sizeBytes });
    const trackList = prepared.map(({ song }, index) => ({ songId: song.id, songVersion: 1, basisPoints: 5000, trackNumber: index + 1 }));
    const metadataHash = digest(JSON.stringify({ title: "River Dawn", tracks: trackList, coverHash: stored.hash }));
    addWorkVersion(database, { workId: "album-phase03", studioId, version: 1, kind: "album", state: "draft", title: "River Dawn", assetHash: stored.hash, metadataHash, priceYocto: "15000000000000000000000", split });
    addAlbumTracks(database, "album-phase03", 1, trackList);
    console.log(JSON.stringify({ status: "album_draft", coverHash: stored.hash, tracks: trackList }));
  }
} finally { database.close(); }
