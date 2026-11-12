export type StudioPolicyMode = "human_review" | "autonomous";
export type WorkKind = "song" | "album";
export type WorkState = "draft" | "review" | "accepted" | "published" | "unpublished";
export type EconomicState = "requested" | "finalized" | "refunded";
export type PayoutState = "owed" | "pending" | "paid" | "unknown";
export type StudioTaskStatus = "queued" | "running" | "review" | "accepted" | "rejected" | "disputed" | "timed_out" | "cancelled";

export interface Studio {
  readonly id: string;
  readonly adminAccountId: string;
}

export interface StudioAgent {
  readonly id: string;
  readonly studioId: string;
  readonly accountId: string;
  readonly role: string;
  readonly controllerAccountId: string;
  readonly active: boolean;
  readonly allowedTools?: readonly ("lyrics" | "composition" | "review" | "revision" | "split_proposal" | "split_response" | "music_generation")[];
  readonly maxCalls?: number;
  readonly expiresAtMs?: number | null;
  readonly keyReference?: string | null;
}

export interface StudioProject {
  readonly id: string;
  readonly studioId: string;
  readonly title: string;
  readonly status: "draft" | "active" | "completed" | "cancelled";
}

export interface StudioTask {
  readonly id: string;
  readonly projectId: string;
  readonly agentId: string;
  readonly kind: string;
  readonly status: StudioTaskStatus;
  readonly payloadJson: string;
}

export interface StudioPolicy {
  readonly studioId: string;
  readonly version: number;
  readonly mode: StudioPolicyMode;
  readonly maxGenerationCalls: number;
  readonly maxMusicRequestDurationMs?: number;
  readonly maxMusicTotalDurationMs?: number;
  readonly maxPayoutYocto: string;
  readonly paused: boolean;
}

export interface ContributionShare {
  readonly agentId: string;
  readonly basisPoints: number;
}

export interface WorkVersion {
  readonly workId: string;
  readonly studioId: string;
  readonly version: number;
  readonly kind: WorkKind;
  readonly state: WorkState;
  readonly title: string;
  readonly assetHash: string;
  readonly metadataHash: string;
  readonly priceYocto: string;
  readonly split: readonly ContributionShare[];
}

export interface AlbumTrack {
  readonly songId: string;
  readonly songVersion: number;
  readonly basisPoints: number;
}

export interface StudioContribution {
  readonly id: string;
  readonly workId: string;
  readonly workVersion: number;
  readonly agentId: string;
  readonly kind: string;
  readonly contentHash: string;
}

export interface StudioAsset {
  readonly hash: string;
  readonly provider: string;
  readonly model: string;
  readonly licenseRef: string;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly durationMs: number | null;
}

export interface StudioSplitAcceptance {
  readonly workId: string;
  readonly workVersion: number;
  readonly agentId: string;
  readonly splitHash: string;
}

export interface StudioPublication {
  readonly workId: string;
  readonly workVersion: number;
  readonly chainCommitment: string;
  readonly policyVersion: number;
}

export interface RevenueEvent {
  readonly id: string;
  readonly workId: string;
  readonly workVersion: number;
  readonly kind: "purchase" | "tip";
  readonly buyerAccountId: string;
  readonly grossYocto: string;
  readonly feeYocto: string;
  readonly refundableYocto: string;
  readonly state: EconomicState;
}

export interface StudioRefund {
  readonly id: string;
  readonly revenueId: string;
  readonly amountYocto: string;
  readonly reason: string;
  readonly status: "requested" | "pending" | "completed" | "failed" | "unknown";
}

export interface StudioEntitlement {
  readonly revenueId: string;
  readonly agentId: string;
  readonly amountYocto: string;
  readonly status: PayoutState;
}

export interface StudioPayout {
  readonly id: string;
  readonly revenueId: string;
  readonly agentId: string;
  readonly amountYocto: string;
  readonly recipientAccountId: string;
  readonly status: "requested" | "pending" | "paid" | "failed" | "unknown";
}

export interface StudioExternalOperation {
  readonly id: string;
  readonly logicalKey: string;
  readonly operationType: string;
  readonly status: "requested" | "submitted" | "finalized" | "failed" | "unknown";
}
