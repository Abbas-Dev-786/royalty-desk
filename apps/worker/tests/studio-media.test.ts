import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Mp3Encoder } from "@breezystack/lamejs";
import { addStudioAgent, addStudioPolicy, createStudio, createStudioProject, createStudioWork, openDatabase, StudioMediaStore } from "@studio/persistence";
import { validateMusicMp3 } from "../src/studio/media-validation.ts";
import { MusicProviderHttpError, createStabilityMusicProvider, type MusicProvider } from "../src/studio/music-provider.ts";
import { generateDraftMusic } from "../src/studio/music-service.ts";
import { createElevenLabsMusicProvider, ElevenLabsMusicHttpError, musicPlanHash, validateMusicPlan, type ElevenLabsMusicProvider, type ElevenLabsSongRequest } from "../src/studio/elevenlabs-music-provider.ts";
import { generateElevenLabsSong } from "../src/studio/elevenlabs-music-service.ts";
import { selectSongPreviewLyrics } from "../src/studio/song-preview.ts";
import { StudioSongProductionService } from "../src/studio/song-production.ts";
import { runCreativeModelStep } from "../src/studio/creative-model.ts";
import type { AgentModel } from "../src/near-ai/model.ts";

function synthesizeMp3(frequency = 440, amplitude = 4000, seconds = 4): Uint8Array {
  const encoder = new Mp3Encoder(1, 44_100, 128);
  const parts: Uint8Array[] = [];
  for (let offset = 0; offset < 44_100 * seconds; offset += 1152) {
    const pcm = new Int16Array(Math.min(1152, 44_100 * seconds - offset));
    for (let index = 0; index < pcm.length; index += 1) pcm[index] = Math.round(amplitude * Math.sin(2 * Math.PI * frequency * (offset + index) / 44_100));
    const part = encoder.encodeBuffer(pcm);
    if (part.length) parts.push(Uint8Array.from(part));
  }
  parts.push(Uint8Array.from(encoder.flush()));
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}

function setup(maxGenerationCalls = 2, maxMusicTotalDurationMs = 120_000, maxMusicRequestDurationMs = 30_000) {
  const root = mkdtempSync(join(tmpdir(), "studio-stability-"));
  const databasePath = join(root, "studio.sqlite");
  const database = openDatabase(databasePath);
  const media = new StudioMediaStore(join(root, "media"));
  createStudio(database, "studio-a", "admin.testnet");
  createStudioProject(database, { id: "project-a", studioId: "studio-a", title: "Original song" });
  createStudioWork(database, { id: "song-a", studioId: "studio-a", projectId: "project-a", kind: "song" });
  addStudioAgent(database, { id: "composer", studioId: "studio-a", accountId: "composer.testnet", controllerAccountId: "admin.testnet", role: "composer", active: true, allowedTools: ["music_generation"] });
  addStudioPolicy(database, { studioId: "studio-a", version: 1, mode: "autonomous", maxGenerationCalls, maxMusicRequestDurationMs, maxMusicTotalDurationMs, maxPayoutYocto: "0", paused: false });
  return { database, databasePath, media };
}

const draft = { projectId: "project-a", workId: "song-a", workVersion: 1, revision: 0, agentId: "composer", prompt: "Original instrumental acoustic river song", durationMs: 4000, model: "stable-audio-3" as const, licenseRef: "stability-ai-api-commercial" };
const generationId = "b".repeat(64);
const vocalPlan: ElevenLabsSongRequest = { model: "music_v2_5", chunks: [{ text: "[Verse]\nRiver light begins to glow", durationMs: 4000, positiveStyles: ["acoustic folk", "clear sung English vocals", "fingerpicked guitar", "warm strings", "gentle 6/8", "soft delivery", "polished recording"], negativeStyles: ["spoken word", "a cappella"], contextAdherence: "high" }] };

test("MED-02 short previews fit ElevenLabs chunk limits even when agents write a full song", () => {
  const longLyrics = `Verse 1:\n${Array.from({ length: 32 }, (_, index) => `Verse lyric ${index + 1}`).join("\n")}\n\nChorus:\nMoon knows my sorrow\nIt hums in a minor key\nEvery raga of the evening\nYou loved and left me\n\nBridge:\nAnother life`;
  assert.throws(() => validateMusicPlan({ ...vocalPlan, chunks: [{ ...vocalPlan.chunks[0]!, text: `[Verse]\n${longLyrics}` }] }), /LYRICS_FORMAT/);
  const text = selectSongPreviewLyrics(longLyrics);
  assert.equal(text, "[Chorus]\nMoon knows my sorrow\nIt hums in a minor key\nEvery raga of the evening\nYou loved and left me");
  assert.equal(validateMusicPlan({ ...vocalPlan, chunks: [{ ...vocalPlan.chunks[0]!, text }] }), 4000);
});

test("MED-02 Stability AI adapter starts and polls an async MP3 generation", async () => {
  const bytes = synthesizeMp3();
  const requests: string[] = [];
  const provider = createStabilityMusicProvider({ apiKey: "test-key", fetchImpl: async (url, init) => {
    requests.push(String(url));
    assert.equal((init?.headers as Record<string, string>).authorization, "Bearer test-key");
    if (init?.method === "POST") {
      const body = init.body as FormData;
      assert.equal(body.get("prompt"), draft.prompt);
      assert.equal(body.get("model"), "stable-audio-3");
      assert.equal(body.get("duration"), "4");
      assert.equal(body.get("output_format"), "mp3");
      return Response.json({ id: generationId }, { status: 202 });
    }
    return new Response(bytes, { status: 200, headers: { "content-type": "audio/mpeg", "finish-reason": "SUCCESS", seed: "42" } });
  } });
  const started = await provider.start({ prompt: draft.prompt, durationMs: draft.durationMs, model: draft.model, operationId: "a".repeat(64) });
  assert.equal(started.generationId, generationId);
  assert.equal(started.promptHash, createHash("sha256").update(draft.prompt).digest("hex"));
  const result = await provider.poll(generationId);
  assert.equal(result.status, "complete");
  assert.deepEqual(requests, ["https://api.stability.ai/v2beta/audio/stable-audio/text-to-audio", `https://api.stability.ai/v2beta/audio/results/${generationId}`]);
});

test("MED-03 Stability adapter rejects bad input and non-audio results", async () => {
  const provider = createStabilityMusicProvider({ apiKey: "test-key", fetchImpl: async (_url, init) => init?.method === "POST" ? Response.json({ id: generationId }, { status: 202 }) : Response.json({ error: "bad" }, { status: 200 }) });
  await assert.rejects(() => provider.start({ prompt: "", durationMs: 4000, model: "stable-audio-3", operationId: "a".repeat(64) }), /REQUEST/);
  await assert.rejects(() => provider.poll("wrong"), /GENERATION_ID/);
  await assert.rejects(() => provider.poll(generationId), /CONTENT_TYPE/);
  await assert.rejects(() => validateMusicMp3(new Uint8Array(8192).fill(0x55)), /CORRUPT|UNSUPPORTED_CODEC|INVALID_FORMAT/);
  await assert.rejects(() => validateMusicMp3(synthesizeMp3(440, 0), 4000), /SILENT/);
  assert.equal((await validateMusicMp3(synthesizeMp3(), 4000)).sampleRate, 44_100);
});

test("MED-02/04/06 submitted generation resumes by polling without a second paid POST", async () => {
  const env = setup();
  let starts = 0;
  let polls = 0;
  const provider: MusicProvider = {
    start: async (input) => { starts += 1; return { generationId, operationId: input.operationId, provider: "stability-ai", model: input.model, promptHash: createHash("sha256").update(input.prompt).digest("hex") }; },
    poll: async () => { polls += 1; return polls === 1 ? { status: "processing" } : { status: "complete", bytes: synthesizeMp3(polls === 2 ? 440 : 554), contentType: "audio/mpeg", outputFormat: "mp3", finishReason: "SUCCESS", seed: null }; }
  };
  try {
    await assert.rejects(() => generateDraftMusic(env.database, env.media, provider, draft, { maxPolls: 1, pollIntervalMs: 0 }), /STILL_PROCESSING/);
    const pending = env.database.prepare("SELECT status, provider_request_id FROM studio_external_operations WHERE operation_type = 'stability_music'").get() as { status: string; provider_request_id: string };
    assert.equal(pending.status, "submitted");
    assert.equal(pending.provider_request_id, generationId);
    const first = await generateDraftMusic(env.database, env.media, provider, draft, { maxPolls: 1, pollIntervalMs: 0 });
    assert.equal(starts, 1);
    assert.equal((await generateDraftMusic(env.database, env.media, provider, draft)).assetHash, first.assetHash);
    assert.equal(starts, 1);
    await assert.rejects(() => generateDraftMusic(env.database, env.media, provider, { ...draft, prompt: "Changed prompt" }), /INPUT_CHANGED/);
    const second = await generateDraftMusic(env.database, env.media, provider, { ...draft, workVersion: 2, revision: 1, prompt: "Revised instrumental river song" });
    assert.notEqual(first.assetHash, second.assetHash);
    assert.equal(starts, 2);
    assert.ok(env.media.get(first.assetHash).length > 4096);
  } finally { env.database.close(); }
  const reopened = openDatabase(env.databasePath);
  try { assert.equal((reopened.prepare("SELECT COUNT(*) AS n FROM studio_audio_generations").get() as { n: number }).n, 2); }
  finally { reopened.close(); }
});

test("MED-03 definitive 402 can retry; unknown submit reserves budget", async () => {
  const env = setup(1);
  let starts = 0;
  const provider: MusicProvider = {
    start: async (input) => { starts += 1; if (starts === 1) throw new MusicProviderHttpError(402); return { generationId, operationId: input.operationId, provider: "stability-ai", model: input.model, promptHash: createHash("sha256").update(input.prompt).digest("hex") }; },
    poll: async () => ({ status: "complete", bytes: synthesizeMp3(), contentType: "audio/mpeg", outputFormat: "mp3", finishReason: "SUCCESS", seed: null })
  };
  try {
    await assert.rejects(() => generateDraftMusic(env.database, env.media, provider, draft), /HTTP_402/);
    assert.equal((env.database.prepare("SELECT status FROM studio_external_operations").get() as { status: string }).status, "failed");
    assert.equal((env.database.prepare("SELECT COALESCE(SUM(requested_duration_ms), 0) AS ms FROM studio_external_operations WHERE status != 'failed'").get() as { ms: number }).ms, 0);
    await generateDraftMusic(env.database, env.media, provider, draft);
    assert.equal(starts, 2);
  } finally { env.database.close(); }
  const second = setup(1);
  let unknownCalls = 0;
  const unknownProvider: MusicProvider = { start: async () => { unknownCalls += 1; throw new Error("lost response"); }, poll: async () => ({ status: "processing" }) };
  try {
    await assert.rejects(() => generateDraftMusic(second.database, second.media, unknownProvider, draft), /lost response/);
    await assert.rejects(() => generateDraftMusic(second.database, second.media, unknownProvider, draft), /OUTCOME_UNKNOWN/);
    await assert.rejects(() => generateDraftMusic(second.database, second.media, unknownProvider, { ...draft, revision: 1 }), /BUDGET/);
    assert.equal(unknownCalls, 1);
    assert.equal((second.database.prepare("SELECT requested_duration_ms AS ms FROM studio_external_operations WHERE status = 'unknown'").get() as { ms: number }).ms, 4_000);
  } finally { second.database.close(); }
});

test("MED-07 project duration budget blocks paid calls before submission", async () => {
  const env = setup(3, 8_000, 5_000);
  let starts = 0;
  const provider: MusicProvider = {
    start: async (input) => { starts += 1; return { generationId, operationId: input.operationId, provider: "stability-ai", model: input.model, promptHash: createHash("sha256").update(input.prompt).digest("hex") }; },
    poll: async () => ({ status: "complete", bytes: synthesizeMp3(starts === 1 ? 440 : 554), contentType: "audio/mpeg", outputFormat: "mp3", finishReason: "SUCCESS", seed: null })
  };
  try {
    await assert.rejects(() => generateDraftMusic(env.database, env.media, provider, { ...draft, durationMs: 6_000 }), /REQUEST_DURATION_BUDGET/);
    await generateDraftMusic(env.database, env.media, provider, draft);
    await generateDraftMusic(env.database, env.media, provider, { ...draft, workVersion: 2, revision: 1, prompt: "Another short draft" });
    await assert.rejects(() => generateDraftMusic(env.database, env.media, provider, { ...draft, workVersion: 3, revision: 2, prompt: "Third short draft" }), /DURATION_BUDGET/);
    assert.equal(starts, 2);
    const spent = env.database.prepare("SELECT SUM(requested_duration_ms) AS ms FROM studio_external_operations WHERE operation_type = 'stability_music'").get() as { ms: number };
    assert.equal(spent.ms, 8_000);
  } finally { env.database.close(); }
});

test("MED-02 ElevenLabs adapter submits exact lyrics and accepts bounded MP3", async () => {
  const bytes = synthesizeMp3();
  let calls = 0;
  const provider = createElevenLabsMusicProvider({ apiKey: "test-key", fetchImpl: async (url, init) => {
    calls += 1;
    assert.equal(String(url), "https://api.elevenlabs.io/v1/music");
    assert.equal((init?.headers as Record<string, string>)["xi-api-key"], "test-key");
    const body = JSON.parse(String(init?.body)) as { model_id: string; composition_plan: { chunks: { text: string; duration_ms: number }[] }; sign_with_c2pa: boolean };
    assert.equal(body.model_id, "music_v2_5");
    assert.equal(body.composition_plan.chunks[0]?.text, vocalPlan.chunks[0]?.text);
    assert.equal(body.composition_plan.chunks[0]?.duration_ms, 4000);
    assert.equal(body.sign_with_c2pa, true);
    return new Response(bytes, { status: 200, headers: { "content-type": "audio/mpeg", "request-id": "request-1" } });
  } });
  const result = await provider.compose(vocalPlan);
  assert.equal(result.planHash, musicPlanHash(vocalPlan));
  assert.equal(result.requestId, "request-1");
  assert.deepEqual(result.bytes, bytes);
  assert.equal(calls, 1);
});

test("MED-03 rejected ElevenLabs plan can be corrected while keeping the failed journal entry", async () => {
  const env = setup(1, 4_000, 4_000);
  const request = { projectId: "project-a", workId: "song-a", workVersion: 1, revision: 0, agentId: "composer", plan: vocalPlan, licenseRef: "owner-attested-elevenlabs-hackathon" };
  let calls = 0;
  const provider: ElevenLabsMusicProvider = { compose: async (plan) => {
    calls += 1;
    if (calls === 1) throw new ElevenLabsMusicHttpError(422, ["body.composition_plan.chunks.0.text"]);
    return { bytes: synthesizeMp3(), contentType: "audio/mpeg", requestId: "request-corrected", planHash: musicPlanHash(plan) };
  } };
  try {
    await assert.rejects(() => generateElevenLabsSong(env.database, env.media, provider, request), /HTTP_422/);
    const corrected = { ...request, plan: { ...vocalPlan, chunks: [{ ...vocalPlan.chunks[0]!, text: "[Chorus]\nRiver light begins to glow" }] } };
    const result = await generateElevenLabsSong(env.database, env.media, provider, corrected);
    assert.ok(env.media.get(result.assetHash).length > 4096);
    assert.equal(calls, 2);
    const rows = env.database.prepare("SELECT status FROM studio_external_operations WHERE operation_type = 'elevenlabs_music' ORDER BY created_at_ms").all() as { status: string }[];
    assert.deepEqual(rows.map((row) => row.status).sort(), ["failed", "finalized"]);
  } finally { env.database.close(); }
});

test("MED-07 ElevenLabs song generation reserves credits, caches output and blocks uncertain retry", async () => {
  const env = setup(1, 4_000, 4_000);
  let calls = 0;
  const provider: ElevenLabsMusicProvider = { compose: async (plan) => { calls += 1; return { bytes: synthesizeMp3(), contentType: "audio/mpeg", requestId: "request-2", planHash: musicPlanHash(plan) }; } };
  const request = { projectId: "project-a", workId: "song-a", workVersion: 1, revision: 0, agentId: "composer", plan: vocalPlan, licenseRef: "owner-attested-elevenlabs-hackathon" };
  try {
    const first = await generateElevenLabsSong(env.database, env.media, provider, request);
    assert.equal((await generateElevenLabsSong(env.database, env.media, provider, request)).assetHash, first.assetHash);
    await assert.rejects(() => generateElevenLabsSong(env.database, env.media, provider, { ...request, revision: 1 }), /MUSIC_BUDGET/);
    assert.equal(calls, 1);
  } finally { env.database.close(); }
  const unknown = setup(1, 4_000, 4_000);
  let uncertainCalls = 0;
  try {
    const lost: ElevenLabsMusicProvider = { compose: async () => { uncertainCalls += 1; throw new Error("lost response"); } };
    await assert.rejects(() => generateElevenLabsSong(unknown.database, unknown.media, lost, request), /lost response/);
    await assert.rejects(() => generateElevenLabsSong(unknown.database, unknown.media, lost, request), /OUTCOME_UNKNOWN/);
    assert.equal(uncertainCalls, 1);
  } finally { unknown.database.close(); }
});

test("MED-08 accepted live agent outputs create one review song without a second music call", async () => {
  const root = mkdtempSync(join(tmpdir(), "studio-song-production-"));
  const databasePath = join(root, "studio.sqlite");
  const database = openDatabase(databasePath);
  createStudio(database, "studio-a", "admin.testnet");
  createStudioProject(database, { id: "project-a", studioId: "studio-a", title: "Two songs" });
  addStudioAgent(database, { id: "lyricist", studioId: "studio-a", accountId: "lyricist.testnet", controllerAccountId: "admin.testnet", role: "lyricist", active: true, allowedTools: ["lyrics", "split_proposal"] });
  addStudioAgent(database, { id: "composer", studioId: "studio-a", accountId: "composer.testnet", controllerAccountId: "admin.testnet", role: "composer", active: true, allowedTools: ["composition", "split_response", "music_generation"] });
  addStudioAgent(database, { id: "reviewer", studioId: "studio-a", accountId: "reviewer.testnet", controllerAccountId: "admin.testnet", role: "reviewer", active: true, allowedTools: ["review"] });
  addStudioPolicy(database, { studioId: "studio-a", version: 1, mode: "autonomous", maxGenerationCalls: 2, maxMusicRequestDurationMs: 20_000, maxMusicTotalDurationMs: 40_000, maxPayoutYocto: "0", paused: false });
  const brief = "Write a hopeful original river song with sung vocals";
  const contents = new Map<string, string>([["lyrics", "River light is rising, and a new day calls"], ["composition", "Warm acoustic folk with gentle strings"], ["review", "ACCEPT: original and suitable"], ["split_proposal", '{"lyricistBasisPoints":5000,"composerBasisPoints":5000}'], ["split_response", '{"decision":"accept","lyricistBasisPoints":5000,"composerBasisPoints":5000}']]);
  const model: AgentModel = { mode: "live", complete: async ({ system }) => {
    const role = system.match(/You are the (\S+) agent/)?.[1] ?? "";
    return { model: "test/live", content: JSON.stringify({ content: contents.get(role) ?? "" }) };
  } };
  const steps = [["lyricist", "lyrics"], ["composer", "composition"], ["reviewer", "review"], ["lyricist", "split_proposal"], ["composer", "split_response"]] as const;
  for (const [agentId, role] of steps) await runCreativeModelStep(database, model, { projectId: "project-a", agentId, role, revision: 0, brief, context: role, maxCalls: 6, maxOutputTokens: 100 });
  database.close();
  let calls = 0;
  const provider: ElevenLabsMusicProvider = { compose: async (plan) => { calls += 1; return { bytes: synthesizeMp3(440 + calls, 4000, 20), contentType: "audio/mpeg", requestId: `test-request-${calls}`, planHash: musicPlanHash(plan) }; } };
  const service = new StudioSongProductionService(databasePath, join(root, "media"), provider, "owner-confirmation-testnet");
  const request = { projectId: "project-a", brief, title: "River Light", lyricistId: "lyricist", composerId: "composer", reviewerId: "reviewer" };
  const first = await service.generate(request);
  assert.equal(first.state, "review");
  assert.equal((await service.generate(request)).assetHash, first.assetHash);
  assert.equal(calls, 1);
  const reopened = openDatabase(databasePath);
  try {
    assert.equal((reopened.prepare("SELECT COUNT(*) AS n FROM studio_contributions WHERE work_id = ?").get(first.workId) as { n: number }).n, 2);
    assert.equal((reopened.prepare("SELECT COUNT(*) AS n FROM studio_work_versions WHERE work_id = ?").get(first.workId) as { n: number }).n, 1);
    createStudioProject(reopened, { id: "project-counter", studioId: "studio-a", title: "Countered song" });
    const counterSteps = [
      { agentId: "lyricist", role: "lyrics" as const, revision: 0, content: "Original counter song lyrics" },
      { agentId: "composer", role: "composition" as const, revision: 0, content: "Warm original jazz arrangement" },
      { agentId: "reviewer", role: "review" as const, revision: 0, content: "ACCEPT: ready" },
      { agentId: "lyricist", role: "split_proposal" as const, revision: 0, content: '{"lyricistBasisPoints":3500,"composerBasisPoints":6500}' },
      { agentId: "composer", role: "split_response" as const, revision: 0, content: '{"decision":"counter","lyricistBasisPoints":4000,"composerBasisPoints":6000}' },
      { agentId: "lyricist", role: "split_proposal" as const, revision: 1, content: '{"decision":"accept","lyricistBasisPoints":4000,"composerBasisPoints":6000}' }
    ];
    for (const step of counterSteps) {
      const counterModel: AgentModel = { mode: "live", complete: async () => ({ model: "test/live", content: JSON.stringify({ content: step.content }), responseId: `chat-${step.role}-${step.revision}` }) };
      await runCreativeModelStep(reopened, counterModel, { projectId: "project-counter", agentId: step.agentId, role: step.role, revision: step.revision, brief, context: `${step.role}:${step.revision}`, maxCalls: 6, maxOutputTokens: 100 });
    }
    const counterSong = await service.generate({ ...request, projectId: "project-counter", title: "Countered River" });
    const split = JSON.parse((reopened.prepare("SELECT split_json FROM studio_work_versions WHERE work_id = ? AND version = 1").get(counterSong.workId) as { split_json: string }).split_json) as { agentId: string; basisPoints: number }[];
    assert.deepEqual(split.map((share) => share.basisPoints), [4000, 6000]);
    assert.equal(calls, 2);
  } finally { reopened.close(); }
});

test("MED-07 a media-store failure after a paid response blocks a second music request", async () => {
  const env = setup(1, 4_000, 4_000);
  let calls = 0;
  const provider: ElevenLabsMusicProvider = { compose: async (plan) => { calls += 1; return { bytes: synthesizeMp3(), contentType: "audio/mpeg", requestId: "paid-response", planHash: musicPlanHash(plan) }; } };
  class FailedMediaStore extends StudioMediaStore {
    override put(_bytes: Uint8Array): { readonly hash: string; readonly sizeBytes: number } { throw new Error("simulated media volume failure"); }
  }
  const media = new FailedMediaStore(join(mkdtempSync(join(tmpdir(), "studio-broken-media-")), "media"));
  const request = { projectId: "project-a", workId: "song-a", workVersion: 1, revision: 0, agentId: "composer", plan: vocalPlan, licenseRef: "owner-confirmation-testnet" };
  try {
    await assert.rejects(() => generateElevenLabsSong(env.database, media, provider, request), /media volume failure/);
    assert.equal((env.database.prepare("SELECT status FROM studio_external_operations WHERE operation_type = 'elevenlabs_music'").get() as { status: string }).status, "unknown");
    await assert.rejects(() => generateElevenLabsSong(env.database, env.media, provider, request), /OUTCOME_UNKNOWN/);
    assert.equal(calls, 1);
  } finally { env.database.close(); }
});
