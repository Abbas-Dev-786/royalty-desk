import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { z } from "zod";
import { addStudioContribution, addWorkVersion, createStudioWork, openDatabase, readStudioPermissionReference, StudioMediaStore } from "@royaltydesk/persistence";
import type { DatabaseSync } from "node:sqlite";
import { createElevenLabsMusicProvider, type ElevenLabsMusicProvider, type ElevenLabsSongRequest } from "./elevenlabs-music-provider.ts";
import { generateElevenLabsSong } from "./elevenlabs-music-service.ts";
import { parseSplitDecision } from "./creative-graph.ts";

const digest = (value: string): string => createHash("sha256").update(value, "utf8").digest("hex");
const requestSchema = z.object({
  projectId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
  brief: z.string().min(20).max(2000),
  title: z.string().min(1).max(160),
  lyricistId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
  composerId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
  reviewerId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/)
}).strict();

export type SongProductionRequest = z.infer<typeof requestSchema>;
interface ModelOutput { readonly content: string; readonly hash: string; }
interface ProducedSong { readonly workId: string; readonly version: number; readonly title: string; readonly assetHash: string; readonly metadataHash: string; readonly durationMs: number; readonly state: "review"; }

function output(database: DatabaseSync, request: SongProductionRequest, agentId: string, role: string): ModelOutput {
  const prefix = `creative:${request.projectId}:${digest(request.brief)}:${agentId}:${role}:0`;
  const row = database.prepare("SELECT o.output_json, o.output_hash FROM studio_model_outputs o JOIN studio_external_operations e ON e.id = o.operation_id WHERE e.logical_key = ? AND e.status = 'finalized' AND o.provider_mode = 'live'").get(prefix) as { output_json: string; output_hash: string } | undefined;
  if (!row) throw new Error(`ERR_SONG_LIVE_OUTPUT_MISSING:${role}`);
  const parsed = z.object({ content: z.string().min(1).max(12_000) }).strict().parse(JSON.parse(row.output_json) as unknown);
  return { content: parsed.content, hash: row.output_hash };
}

export class StudioSongProductionService {
  readonly #databasePath: string;
  readonly #mediaPath: string;
  readonly #provider: ElevenLabsMusicProvider;
  readonly #licenseRef: string;

  constructor(databasePath: string, mediaPath: string, provider: ElevenLabsMusicProvider, licenseRef: string) {
    if (!licenseRef.trim() || licenseRef.length > 512) throw new Error("ERR_SONG_LICENSE_REF");
    this.#databasePath = databasePath;
    this.#mediaPath = mediaPath;
    this.#provider = provider;
    this.#licenseRef = licenseRef;
  }

  static fromEnvironment(databasePath: string): StudioSongProductionService | null {
    const apiKey = process.env.ELEVENLABS_API_KEY;
    let licenseRef = process.env.ELEVENLABS_PERMISSION_REF;
    if (!licenseRef) {
      try {
        licenseRef = readStudioPermissionReference(resolve(process.cwd(), "../..", "private/studio-v2/rights/elevenlabs-permission.json"), process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID ?? "");
      } catch { /* Explicit permission configuration can be supplied later. */ }
    }
    if (!apiKey || !licenseRef) return null;
    return new StudioSongProductionService(databasePath, resolve(process.cwd(), "../..", process.env.STUDIO_MEDIA_PATH ?? "private/studio-media"), createElevenLabsMusicProvider({ apiKey }), licenseRef);
  }

  async generate(raw: SongProductionRequest): Promise<ProducedSong> {
    const request = requestSchema.parse(raw);
    if (request.lyricistId === request.composerId || request.reviewerId === request.composerId || request.reviewerId === request.lyricistId) throw new Error("ERR_SONG_DISTINCT_AGENTS");
    const database = openDatabase(this.#databasePath);
    try {
      const project = database.prepare("SELECT studio_id FROM studio_projects WHERE id = ?").get(request.projectId) as { studio_id: string } | undefined;
      if (!project) throw new Error("ERR_SONG_PROJECT_MISSING");
      const lyrics = output(database, request, request.lyricistId, "lyrics");
      const composition = output(database, request, request.composerId, "composition");
      const review = output(database, request, request.reviewerId, "review");
      const proposal = output(database, request, request.lyricistId, "split_proposal");
      const response = output(database, request, request.composerId, "split_response");
      if (!review.content.startsWith("ACCEPT:")) throw new Error("ERR_SONG_REVIEW_NOT_ACCEPTED");
      const proposed = z.object({ lyricistBasisPoints: z.number().int().min(0).max(10_000), composerBasisPoints: z.number().int().min(0).max(10_000) }).passthrough().parse(JSON.parse(proposal.content) as unknown);
      const accepted = parseSplitDecision(response.content);
      if (accepted.decision !== "accept" || accepted.lyricistBasisPoints !== proposed.lyricistBasisPoints || accepted.composerBasisPoints !== proposed.composerBasisPoints || accepted.lyricistBasisPoints + accepted.composerBasisPoints !== 10_000) throw new Error("ERR_SONG_SPLIT_NOT_ACCEPTED");
      const workId = `song-${digest(`${request.projectId}:${request.brief}`).slice(0, 24)}`;
      const existing = database.prepare("SELECT w.studio_id, w.project_id, w.kind FROM studio_works w WHERE w.id = ?").get(workId) as { studio_id: string; project_id: string; kind: string } | undefined;
      if (existing && (existing.studio_id !== project.studio_id || existing.project_id !== request.projectId || existing.kind !== "song")) throw new Error("ERR_SONG_WORK_COLLISION");
      if (!existing) createStudioWork(database, { id: workId, studioId: project.studio_id, projectId: request.projectId, kind: "song" });
      const plan: ElevenLabsSongRequest = { model: "music_v2_5", chunks: [{ text: `[Verse]\n${lyrics.content}`.slice(0, 4000), durationMs: 20_000, positiveStyles: [composition.content.replace(/\s+/g, " ").slice(0, 160), "clear sung English vocals", "polished original recording"], negativeStyles: ["spoken word", "named artist imitation", "existing song melody"], contextAdherence: "high" }] };
      const media = new StudioMediaStore(this.#mediaPath);
      const generated = await generateElevenLabsSong(database, media, this.#provider, { projectId: request.projectId, workId, workVersion: 1, revision: 0, agentId: request.composerId, plan, licenseRef: this.#licenseRef });
      const metadata = { title: request.title, briefHash: digest(request.brief), lyrics: lyrics.content, composition: composition.content, lyricSourceHash: lyrics.hash, compositionSourceHash: composition.hash, reviewSourceHash: review.hash, splitResponseHash: response.hash, planHash: generated.planHash, assetHash: generated.assetHash };
      const metadataHash = media.put(new TextEncoder().encode(JSON.stringify(metadata))).hash;
      const existingVersion = database.prepare("SELECT title, asset_hash, metadata_hash, state FROM studio_work_versions WHERE work_id = ? AND version = 1").get(workId) as { title: string; asset_hash: string; metadata_hash: string; state: string } | undefined;
      if (existingVersion && (existingVersion.title !== request.title || existingVersion.asset_hash !== generated.assetHash || existingVersion.metadata_hash !== metadataHash)) throw new Error("ERR_SONG_VERSION_CHANGED");
      if (!existingVersion) {
        addWorkVersion(database, { workId, studioId: project.studio_id, version: 1, kind: "song", state: "review", title: request.title, assetHash: generated.assetHash, metadataHash, priceYocto: "10000000000000000000000", split: [{ agentId: request.lyricistId, basisPoints: accepted.lyricistBasisPoints }, { agentId: request.composerId, basisPoints: accepted.composerBasisPoints }] });
        addStudioContribution(database, { id: `${workId}-lyrics`, workId, workVersion: 1, agentId: request.lyricistId, kind: "lyrics", contentHash: lyrics.hash });
        addStudioContribution(database, { id: `${workId}-composition`, workId, workVersion: 1, agentId: request.composerId, kind: "composition", contentHash: composition.hash });
      }
      return { workId, version: 1, title: request.title, assetHash: generated.assetHash, metadataHash, durationMs: generated.durationMs, state: "review" };
    } finally { database.close(); }
  }
}
