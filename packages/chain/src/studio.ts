import { createHash } from "node:crypto";
import type { Account, Provider } from "near-api-js";
import { actions } from "near-api-js";
import { retryRpcRead } from "./rpc-rate-limit.ts";

export interface StudioShare { readonly account_id: string; readonly basis_points: number; }
export interface StudioTrack { readonly song_id: string; readonly song_version: number; readonly basis_points: number; }
export interface StudioReleaseInput {
  readonly work_id: string; readonly version: number; readonly kind: "song" | "album";
  readonly media_hash: string; readonly metadata_hash: string; readonly split_hash: string; readonly track_order_hash: string;
  readonly price_yocto: string; readonly shares: readonly StudioShare[]; readonly tracks: readonly StudioTrack[]; readonly policy_epoch: number;
}
export interface StudioReleaseView extends StudioReleaseInput { readonly published: boolean; readonly ever_published: boolean; readonly commitment: string; }
export interface StudioPaymentView { readonly payment_id: string; readonly work_id: string; readonly version: number; readonly kind: "purchase" | "tip"; readonly buyer_id: string; readonly gross_yocto: string; readonly commitment: string; readonly status: "finalized" | "refund_pending" | "refunded"; readonly allocated_yocto: string; }
export interface StudioPolicyView { readonly epoch: number; readonly human_review: boolean; readonly paused: boolean; readonly max_price_yocto: string; readonly max_tip_yocto: string; }
export interface StudioEarningsView { readonly account_id: string; readonly owed_yocto: string; readonly pending_yocto: string; readonly paid_yocto: string; }
export interface StudioPayoutView { readonly payout_id: string; readonly recipient_id: string; readonly amount_yocto: string; readonly status: "pending" | "paid" | "failed"; }
export interface StudioAgentView { readonly account_id: string; readonly role: string; readonly active: boolean; readonly expires_at_ms: number; readonly max_actions: number; readonly actions_used: number; }
export type StudioTransactionResponse = Awaited<ReturnType<Account["signAndSendTransaction"]>>;

const hex = /^[0-9a-f]{64}$/;
export const studioDigest = (value: unknown): string => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function validateStudioReleaseInput(input: StudioReleaseInput): void {
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(input.work_id) || input.version < 1 || !Number.isSafeInteger(input.version)) throw new Error("Invalid studio work identity");
  for (const value of [input.media_hash, input.metadata_hash, input.split_hash, input.track_order_hash]) if (!hex.test(value)) throw new Error("Invalid studio hash");
  if (input.split_hash !== studioDigest(input.shares) || input.track_order_hash !== studioDigest(input.tracks)) throw new Error("Studio commitment input differs from shares or tracks");
  if (!/^[1-9]\d*$/.test(input.price_yocto) || !Number.isSafeInteger(input.policy_epoch) || input.policy_epoch < 1) throw new Error("Invalid studio price or policy");
}

export class StudioContractClient {
  readonly contractId: string;
  readonly provider: Provider;
  constructor(contractId: string, provider: Provider, network: "testnet" | "sandbox" = "testnet") {
    if (network === "testnet" ? !/^[a-z0-9._-]+\.testnet$/.test(contractId) : !/^[a-z0-9._-]+\.test\.near$/.test(contractId)) throw new Error("Studio contract must match its network");
    this.contractId = contractId;
    this.provider = provider;
  }
  async policy(): Promise<StudioPolicyView> { const value = await retryRpcRead(() => this.provider.callFunction<StudioPolicyView>({ contractId: this.contractId, method: "get_policy", args: {} })); if (!value) throw new Error("Studio policy is unavailable"); return value; }
  async admin(): Promise<string> { const value = await retryRpcRead(() => this.provider.callFunction<string>({ contractId: this.contractId, method: "get_admin", args: {} })); if (!value) throw new Error("Studio admin is unavailable"); return value; }
  async guardian(): Promise<string> { const value = await retryRpcRead(() => this.provider.callFunction<string>({ contractId: this.contractId, method: "get_guardian", args: {} })); if (!value) throw new Error("Studio guardian is unavailable"); return value; }
  async agent(accountId: string): Promise<StudioAgentView | null> { return await retryRpcRead(() => this.provider.callFunction<StudioAgentView>({ contractId: this.contractId, method: "get_agent", args: { account_id: accountId } })) ?? null; }
  async release(workId: string, version: number): Promise<StudioReleaseView | null> { return await retryRpcRead(() => this.provider.callFunction<StudioReleaseView>({ contractId: this.contractId, method: "get_release", args: { work_id: workId, version } })) ?? null; }
  async hasAcceptedSplit(workId: string, version: number, accountId: string): Promise<boolean> { return await retryRpcRead(() => this.provider.callFunction<boolean>({ contractId: this.contractId, method: "has_accepted_split", args: { work_id: workId, version, account_id: accountId } })) ?? false; }
  async hasApprovedRelease(workId: string, version: number, policyEpoch: number): Promise<boolean> { return await retryRpcRead(() => this.provider.callFunction<boolean>({ contractId: this.contractId, method: "has_approved_release", args: { work_id: workId, version, policy_epoch: policyEpoch } })) ?? false; }
  async payment(paymentId: string): Promise<StudioPaymentView | null> { return await retryRpcRead(() => this.provider.callFunction<StudioPaymentView>({ contractId: this.contractId, method: "get_payment", args: { payment_id: paymentId } })) ?? null; }
  async earnings(accountId: string): Promise<StudioEarningsView> { const value = await retryRpcRead(() => this.provider.callFunction<StudioEarningsView>({ contractId: this.contractId, method: "get_earnings", args: { account_id: accountId } })); if (!value) throw new Error("Studio earnings unavailable"); return value; }
  async payout(payoutId: string): Promise<StudioPayoutView | null> { return await retryRpcRead(() => this.provider.callFunction<StudioPayoutView>({ contractId: this.contractId, method: "get_payout", args: { payout_id: payoutId } })) ?? null; }
  async send(account: Account, methodName: string, args: Record<string, unknown>, depositYocto = 0n): Promise<StudioTransactionResponse> {
    return account.signAndSendTransaction({ receiverId: this.contractId, actions: [actions.functionCall(methodName, args, 100_000_000_000_000n, depositYocto)], waitUntil: "FINAL" });
  }
  async purchase(account: Account, input: { readonly paymentId: string; readonly release: StudioReleaseView; readonly quoteExpiresAtMs: number }): Promise<StudioTransactionResponse> {
    return this.send(account, "purchase", { payment_id: input.paymentId, work_id: input.release.work_id, version: input.release.version, commitment: input.release.commitment, quote_expires_at_ms: input.quoteExpiresAtMs }, BigInt(input.release.price_yocto));
  }
  async tip(account: Account, input: { readonly paymentId: string; readonly release: StudioReleaseView; readonly amountYocto: bigint; readonly quoteExpiresAtMs: number }): Promise<StudioTransactionResponse> {
    return this.send(account, "tip", { payment_id: input.paymentId, work_id: input.release.work_id, version: input.release.version, commitment: input.release.commitment, quote_expires_at_ms: input.quoteExpiresAtMs }, input.amountYocto);
  }
}
