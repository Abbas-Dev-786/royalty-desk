import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";
import { addStudioAgent, addStudioContribution, addStudioPolicy, addWorkVersion, createStudio, createStudioProject, createStudioWork, openDatabase, StudioMediaStore } from "@royaltydesk/persistence";
import { createStabilityMusicProvider } from "../../apps/worker/src/studio/music-provider.ts";
import { generateDraftMusic } from "../../apps/worker/src/studio/music-service.ts";

const apiKey = process.env.STABILITY_API_KEY;
if (!apiKey || /replace|placeholder|your-key/i.test(apiKey)) throw new Error("STABILITY_API_KEY is not configured");
const sources = process.argv.slice(2);
if (sources.length !== 2) throw new Error("Provide two Phase 02 source database paths");
const databasePath = resolve("private/studio-v2/studio.sqlite");
const mediaPath = resolve(process.env.STUDIO_MEDIA_PATH ?? "private/studio-media");
const database = openDatabase(databasePath);
const media = new StudioMediaStore(mediaPath);
const provider = createStabilityMusicProvider({ apiKey, timeoutMs: 120_000 });
const digest = (value: string) => createHash("sha256").update(value, "utf8").digest("hex");
const studioId = "studio-live-music";
const projectId = "project-live-album";

function sourceOutput(path: string, role: "lyrics" | "composition"): { content: string; hash: string } {
  const source = new DatabaseSync(resolve(path), { readOnly: true });
  try {
    const row = source.prepare("SELECT output_json, output_hash FROM studio_model_outputs WHERE role = ? AND provider_mode = 'live' ORDER BY created_at_ms DESC LIMIT 1").get(role) as { output_json: string; output_hash: string } | undefined;
    if (!row) throw new Error(`Missing live ${role} output in source`);
    const content = (JSON.parse(row.output_json) as { content?: unknown }).content;
    if (typeof content !== "string" || !content.trim()) throw new Error(`Invalid live ${role} output`);
    return { content, hash: row.output_hash };
  } finally { source.close(); }
}

try {
  if (!database.prepare("SELECT 1 FROM studios WHERE id = ?").get(studioId)) {
    createStudio(database, studioId, "admin.testnet");
    createStudioProject(database, { id: projectId, studioId, title: "River Dawn: private album drafts" });
    addStudioAgent(database, { id: "lyricist-live", studioId, accountId: "lyricist.testnet", controllerAccountId: "admin.testnet", role: "lyricist", active: true, allowedTools: ["lyrics", "review", "split_proposal"] });
    addStudioAgent(database, { id: "composer-live", studioId, accountId: "composer.testnet", controllerAccountId: "admin.testnet", role: "composer", active: true, allowedTools: ["composition", "review", "split_response", "music_generation"] });
    addStudioPolicy(database, { studioId, version: 1, mode: "human_review", maxGenerationCalls: 2, maxPayoutYocto: "0", paused: false });
    for (let index = 1; index <= 2; index += 1) createStudioWork(database, { id: `song-live-${index}`, studioId, projectId, kind: "song" });
  }
  for (const [index, sourcePath] of sources.entries()) {
    const songNumber = index + 1;
    const workId = `song-live-${songNumber}`;
    const lyrics = sourceOutput(sourcePath, "lyrics");
    const composition = sourceOutput(sourcePath, "composition");
    const title = songNumber === 1 ? "The River Carries the Sun" : "First Light on the Water";
    const prompt = `TrackType: Music. An original instrumental acoustic composition titled ${title}. Gentle sunrise over a quiet river; expressive fingerstyle guitar, warm low strings, soft brushed percussion. No intelligible vocals, no singing, no imitation of any named artist or existing song. Arrangement direction from the composer agent: ${composition.content.slice(0, 1800)}. The lyricist agent contributed the companion poem with SHA-256 ${lyrics.hash}; express its sunrise and river imagery instrumentally.`;
    const result = await generateDraftMusic(database, media, provider, { projectId, workId, workVersion: 1, revision: 0, agentId: "composer-live", prompt, durationMs: 10_000, model: "stable-audio-3", licenseRef: "stability-ai-api-terms-2026-09-30-stable-audio-commercial-guide" });
    if (!database.prepare("SELECT 1 FROM studio_work_versions WHERE work_id = ? AND version = 1").get(workId)) {
      const metadataHash = digest(JSON.stringify({ title, credits: ["lyricist-live", "composer-live"], lyricHash: lyrics.hash, compositionHash: composition.hash, assetHash: result.assetHash }));
      addWorkVersion(database, { workId, studioId, version: 1, kind: "song", state: "draft", title, assetHash: result.assetHash, metadataHash, priceYocto: "10000000000000000000000", split: [{ agentId: "lyricist-live", basisPoints: 5000 }, { agentId: "composer-live", basisPoints: 5000 }] });
      addStudioContribution(database, { id: `contrib-${workId}-lyrics`, workId, workVersion: 1, agentId: "lyricist-live", kind: "lyrics", contentHash: lyrics.hash });
      addStudioContribution(database, { id: `contrib-${workId}-composition`, workId, workVersion: 1, agentId: "composer-live", kind: "composition", contentHash: composition.hash });
    }
    console.log(JSON.stringify({ songNumber, title, assetHash: result.assetHash, durationMs: result.durationMs, providerRequestId: result.providerRequestId, sourceLyricsHash: lyrics.hash, sourceCompositionHash: composition.hash, status: "private_draft" }));
  }
} finally { database.close(); }
