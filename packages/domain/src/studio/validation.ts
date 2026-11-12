import type { AlbumTrack, ContributionShare, EconomicState, PayoutState, RevenueEvent, StudioAgent, StudioPolicy, StudioTaskStatus, WorkState, WorkVersion } from "./types.ts";

const identifier = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const hash = /^[a-f0-9]{64}$/;
const account = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export function requireStudioId(value: string): string {
  if (!identifier.test(value)) throw new Error("Invalid studio identifier");
  return value;
}

export function requireAccountId(value: string): string {
  if (!account.test(value)) throw new Error("Invalid NEAR account ID");
  return value;
}

export function parseYocto(value: string): bigint {
  if (!/^(0|[1-9][0-9]*)$/.test(value)) throw new Error("Invalid atomic amount");
  const amount = BigInt(value);
  if (amount > ((1n << 128n) - 1n)) throw new Error("Atomic amount exceeds u128");
  return amount;
}

export function validateShares(shares: readonly ContributionShare[]): void {
  if (shares.length < 1 || shares.length > 32) throw new Error("Invalid contributor count");
  const seen = new Set<string>();
  let sum = 0;
  for (const share of shares) {
    requireStudioId(share.agentId);
    if (seen.has(share.agentId)) throw new Error("Duplicate contributor");
    seen.add(share.agentId);
    if (!Number.isInteger(share.basisPoints) || share.basisPoints < 0 || share.basisPoints > 10_000) throw new Error("Invalid basis points");
    sum += share.basisPoints;
  }
  if (sum !== 10_000) throw new Error("Shares must total 10000 basis points");
}

export function validateAlbumTracks(tracks: readonly AlbumTrack[]): void {
  if (tracks.length < 1 || tracks.length > 100) throw new Error("Invalid track count");
  const seen = new Set<string>();
  let sum = 0;
  for (const track of tracks) {
    requireStudioId(track.songId);
    if (seen.has(track.songId)) throw new Error("Duplicate album song");
    seen.add(track.songId);
    if (!Number.isSafeInteger(track.songVersion) || track.songVersion < 1) throw new Error("Invalid song version");
    if (!Number.isInteger(track.basisPoints) || track.basisPoints < 0 || track.basisPoints > 10_000) throw new Error("Invalid track weight");
    sum += track.basisPoints;
  }
  if (sum !== 10_000) throw new Error("Track weights must total 10000 basis points");
}

export function validateWorkVersion(work: WorkVersion): void {
  requireStudioId(work.workId);
  requireStudioId(work.studioId);
  if (!Number.isSafeInteger(work.version) || work.version < 1) throw new Error("Invalid work version");
  if (work.kind !== "song" && work.kind !== "album") throw new Error("Invalid work kind");
  if (!["draft", "review", "accepted", "published", "unpublished"].includes(work.state)) throw new Error("Invalid work state");
  if (work.title.trim().length < 1 || work.title.length > 160) throw new Error("Invalid work title");
  if (!hash.test(work.assetHash) || !hash.test(work.metadataHash)) throw new Error("Invalid content hash");
  parseYocto(work.priceYocto);
  validateShares(work.split);
}

export function validateRevenueEvent(event: RevenueEvent): void {
  requireStudioId(event.id);
  requireStudioId(event.workId);
  requireAccountId(event.buyerAccountId);
  if (!Number.isSafeInteger(event.workVersion) || event.workVersion < 1) throw new Error("Invalid work version");
  if (event.kind !== "purchase" && event.kind !== "tip") throw new Error("Invalid revenue kind");
  const gross = parseYocto(event.grossYocto);
  const fee = parseYocto(event.feeYocto);
  const refundable = parseYocto(event.refundableYocto);
  if (gross === 0n || fee + refundable > gross) throw new Error("Invalid revenue accounting");
  if (!["requested", "finalized", "refunded"].includes(event.state)) throw new Error("Invalid revenue state");
  if (event.state === "refunded" && (fee !== 0n || refundable !== gross)) throw new Error("Refunded revenue must return the full gross");
}

export function validateStudioAgent(agent: StudioAgent): void {
  requireStudioId(agent.id);
  requireStudioId(agent.studioId);
  requireAccountId(agent.accountId);
  requireAccountId(agent.controllerAccountId);
  if (!agent.role.trim() || agent.role.length > 80) throw new Error("Invalid agent role");
  if (typeof agent.active !== "boolean") throw new Error("Invalid active flag");
  if (agent.allowedTools !== undefined && (agent.allowedTools.length < 1 || agent.allowedTools.length > 7 || new Set(agent.allowedTools).size !== agent.allowedTools.length || agent.allowedTools.some((tool) => !["lyrics", "composition", "review", "revision", "split_proposal", "split_response", "music_generation"].includes(tool)))) throw new Error("Invalid agent tools");
  if (agent.maxCalls !== undefined && (!Number.isSafeInteger(agent.maxCalls) || agent.maxCalls < 1 || agent.maxCalls > 100)) throw new Error("Invalid agent call budget");
  if (agent.expiresAtMs != null && (!Number.isSafeInteger(agent.expiresAtMs) || agent.expiresAtMs < 0)) throw new Error("Invalid agent expiry");
  if (agent.keyReference != null && (!agent.keyReference.trim() || agent.keyReference.length > 256)) throw new Error("Invalid key reference");
}

export function validateStudioPolicy(policy: StudioPolicy): void {
  requireStudioId(policy.studioId);
  if (!Number.isSafeInteger(policy.version) || policy.version < 1) throw new Error("Invalid policy version");
  if (policy.mode !== "human_review" && policy.mode !== "autonomous") throw new Error("Invalid policy mode");
  if (!Number.isSafeInteger(policy.maxGenerationCalls) || policy.maxGenerationCalls < 1 || policy.maxGenerationCalls > 1000) throw new Error("Invalid generation budget");
  const perRequestMs = policy.maxMusicRequestDurationMs ?? 30_000;
  const totalMs = policy.maxMusicTotalDurationMs ?? 120_000;
  if (!Number.isSafeInteger(perRequestMs) || perRequestMs < 3_000 || perRequestMs > 600_000) throw new Error("Invalid music request duration budget");
  if (!Number.isSafeInteger(totalMs) || totalMs < perRequestMs || totalMs > 600_000_000) throw new Error("Invalid music total duration budget");
  parseYocto(policy.maxPayoutYocto);
  if (typeof policy.paused !== "boolean") throw new Error("Invalid paused flag");
}

const workTransitions: Readonly<Record<WorkState, readonly WorkState[]>> = {
  draft: ["review"],
  review: ["draft", "accepted"],
  accepted: ["published", "draft"],
  published: ["unpublished"],
  unpublished: ["published"]
};

export function assertWorkTransition(from: WorkState, to: WorkState): void {
  if (!workTransitions[from]?.includes(to)) throw new Error("Invalid work state transition");
}

const economicTransitions: Readonly<Record<EconomicState, readonly EconomicState[]>> = {
  requested: ["finalized", "refunded"],
  finalized: ["refunded"],
  refunded: []
};

export function assertEconomicTransition(from: EconomicState, to: EconomicState): void {
  if (!economicTransitions[from]?.includes(to)) throw new Error("Invalid revenue state transition");
}

const payoutTransitions: Readonly<Record<PayoutState, readonly PayoutState[]>> = {
  owed: ["pending"],
  pending: ["paid", "owed", "unknown"],
  paid: [],
  unknown: ["paid", "owed"]
};

export function assertPayoutTransition(from: PayoutState, to: PayoutState): void {
  if (!payoutTransitions[from]?.includes(to)) throw new Error("Invalid payout state transition");
}

const taskTransitions: Readonly<Record<StudioTaskStatus, readonly StudioTaskStatus[]>> = {
  queued: ["running", "cancelled", "timed_out"],
  running: ["review", "disputed", "timed_out", "cancelled"],
  review: ["accepted", "rejected", "disputed", "timed_out"],
  rejected: ["running", "cancelled"],
  disputed: ["running", "cancelled"],
  timed_out: ["running", "cancelled"],
  accepted: [],
  cancelled: []
};

export function assertStudioTaskTransition(from: StudioTaskStatus, to: StudioTaskStatus): void {
  if (!taskTransitions[from]?.includes(to)) throw new Error("Invalid studio task transition");
}
