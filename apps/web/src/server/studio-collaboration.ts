import "server-only";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { StudioMediaStore } from "@studio/persistence";
import { openStudioCatalogueDatabase, studioContractClient, type CatalogueItem } from "./studio-catalogue";

interface OutputRow { readonly agent_id: string; readonly role: string; readonly model: string; readonly provider_mode: string; readonly output_hash: string; readonly output_json: string; readonly created_at_ms: number; }
interface ContributionRow { readonly agent_id: string; readonly role: string; readonly account_id: string; readonly kind: string; readonly content_hash: string; }
interface GenerationRow { readonly provider: string; readonly model: string; readonly duration_ms: number; }
export interface PublicAgentStep { readonly role: string; readonly agentId: string; readonly model: string; readonly content: string; readonly outputHash: string; readonly createdAtMs: number; readonly source: "release-linked" | "archived-concept"; }
export interface PublicCollaboration { readonly steps: readonly PublicAgentStep[]; readonly contributions: readonly ContributionRow[]; readonly generation: GenerationRow | null; readonly splitAcceptances: readonly { accountId: string; basisPoints: number; acceptedOnChain: boolean }[]; readonly adminApprovedOnChain: boolean; readonly policyEpoch: number; readonly publicationHash: string | null; }

const allowedRoles = new Set(["lyrics", "composition", "review", "split_proposal", "split_response", "revision"]);
const archivedSources: Readonly<Record<string, string>> = { "song-phase03-1": "song-1.sqlite", "song-phase03-2": "song-2.sqlite" };

function content(row: OutputRow): PublicAgentStep | null {
  if (row.provider_mode !== "live" || !allowedRoles.has(row.role) || !/^[0-9a-f]{64}$/.test(row.output_hash)) return null;
  if (createHash("sha256").update(row.output_json, "utf8").digest("hex") !== row.output_hash) return null;
  try {
    const parsed = JSON.parse(row.output_json) as { content?: unknown };
    if (typeof parsed.content !== "string") return null;
    return { role: row.role, agentId: row.agent_id, model: row.model, content: parsed.content.slice(0, 12_000), outputHash: row.output_hash, createdAtMs: row.created_at_ms, source: "release-linked" };
  } catch { return null; }
}

function archivedSteps(workId: string, version: number): readonly PublicAgentStep[] {
  const filename = version === 2 ? archivedSources[workId] : undefined;
  if (!filename) return [];
  const path = resolve(/* turbopackIgnore: true */ process.cwd(), "../..", "private/studio-v2/sources", filename);
  if (!existsSync(path)) return [];
  const source = new DatabaseSync(path, { readOnly: true });
  try {
    const rows = source.prepare("SELECT agent_id, role, model, provider_mode, output_hash, output_json, created_at_ms FROM studio_model_outputs ORDER BY created_at_ms, role LIMIT 12").all() as unknown as OutputRow[];
    return rows.map(content).filter((step): step is PublicAgentStep => step !== null).map((step) => ({ ...step, source: "archived-concept" }));
  } finally { source.close(); }
}

function linkedSteps(database: ReturnType<typeof openStudioCatalogueDatabase>, item: CatalogueItem, projectId: string): readonly PublicAgentStep[] {
  const media = new StudioMediaStore(resolve(/* turbopackIgnore: true */ process.cwd(), "../..", process.env.STUDIO_MEDIA_PATH ?? "private/studio-media"));
  let metadata: Record<string, unknown>;
  try { metadata = JSON.parse(new TextDecoder().decode(media.get(item.metadataHash))) as Record<string, unknown>; } catch { return []; }
  if (typeof metadata.briefHash !== "string" || !/^[0-9a-f]{64}$/.test(metadata.briefHash)) return [];
  const rows = database.prepare("SELECT o.agent_id, o.role, o.model, o.provider_mode, o.output_hash, o.output_json, o.created_at_ms FROM studio_model_outputs o JOIN studio_external_operations e ON e.id = o.operation_id WHERE o.project_id = ? AND e.status = 'finalized' AND e.logical_key LIKE ? ORDER BY o.created_at_ms, o.operation_id LIMIT 12").all(projectId, `creative:${projectId}:${metadata.briefHash}:%`) as unknown as OutputRow[];
  const hashes = new Set([metadata.lyricSourceHash, metadata.compositionSourceHash, metadata.reviewSourceHash, metadata.splitResponseHash, metadata.splitProposalSourceHash, metadata.counterAcceptanceHash].filter((hash): hash is string => typeof hash === "string"));
  return rows.filter((row) => hashes.has(row.output_hash)).map(content).filter((step): step is PublicAgentStep => step !== null);
}

export async function publicStudioCollaboration(item: CatalogueItem): Promise<PublicCollaboration> {
  const chain = studioContractClient();
  const release = await chain.release(item.workId, item.version);
  if (!release?.published || release.commitment !== item.commitment) throw new Error("COLLABORATION_RELEASE_UNVERIFIED");
  const database = openStudioCatalogueDatabase();
  let steps: readonly PublicAgentStep[] = [];
  let contributions: readonly ContributionRow[] = [];
  let generation: GenerationRow | null = null;
  let publicationHash: string | null = null;
  try {
    const work = database.prepare("SELECT project_id FROM studio_works WHERE id = ?").get(item.workId) as { project_id: string } | undefined;
    if (work && item.kind === "song") steps = linkedSteps(database, item, work.project_id);
    if (!steps.length) steps = archivedSteps(item.workId, item.version);
    contributions = database.prepare("SELECT c.agent_id, a.role, a.account_id, c.kind, c.content_hash FROM studio_contributions c JOIN studio_agents a ON a.id = c.agent_id WHERE c.work_id = ? AND c.work_version = ? AND c.accepted_at_ms IS NOT NULL ORDER BY c.kind, c.agent_id").all(item.workId, item.version) as unknown as ContributionRow[];
    generation = database.prepare("SELECT provider, model, duration_ms FROM studio_audio_generations WHERE work_id = ? AND work_version = ? ORDER BY created_at_ms DESC LIMIT 1").get(item.workId, item.version) as GenerationRow | undefined ?? null;
    publicationHash = (database.prepare("SELECT chain_tx_hash FROM studio_publications WHERE work_id = ? AND work_version = ?").get(item.workId, item.version) as { chain_tx_hash: string | null } | undefined)?.chain_tx_hash ?? null;
  } finally { database.close(); }
  const [splitAcceptances, adminApprovedOnChain] = await Promise.all([
    Promise.all(release.shares.map(async (share) => ({ accountId: share.account_id, basisPoints: share.basis_points, acceptedOnChain: await chain.hasAcceptedSplit(item.workId, item.version, share.account_id) }))),
    chain.hasApprovedRelease(item.workId, item.version, release.policy_epoch)
  ]);
  return { steps, contributions, generation, splitAcceptances, adminApprovedOnChain, policyEpoch: release.policy_epoch, publicationHash };
}
