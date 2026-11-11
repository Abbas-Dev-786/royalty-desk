import type { Account, Provider } from "near-api-js";
import { actions, getTransactionLastResult } from "near-api-js";
import { interpretTransfer, type TransferEvidence } from "./transfer-outcome.ts";

export type YoctoAmount = string;
export type ChainTransactionResponse = Awaited<ReturnType<Account["signAndSendTransaction"]>>;
export type SettlementAction = "approve_settlement" | "dispute_settlement" | "execute_payout";

export interface ParticipantInput { readonly owner_id: string; readonly basis_points: string; }
export interface RecoupmentInput { readonly code: string; readonly beneficiary_id: string; readonly cap_yocto: YoctoAmount; }
export interface AgreementInput { readonly recording_id: string; readonly participants: readonly ParticipantInput[]; readonly recoupment: RecoupmentInput | null; readonly effective_period: string; readonly document_hash: string; }
export interface SettlementInput { readonly period: string; readonly agreement_version: string; readonly normalized_statement_hash: string; readonly gross_yocto: YoctoAmount; readonly deduction_evidence_hash: string; readonly allocation_preview_hash: string; }
export interface MandateInput { readonly agent_id: string; readonly agreement_version: string; readonly actions: readonly SettlementAction[]; readonly max_gross_yocto: YoctoAmount; readonly expires_at_nanoseconds: string; }

export interface ChainOperationDescriptor { readonly operationId: string; readonly releaseId: string; readonly period: string | null; readonly action: string; readonly signerId: string; readonly receiverId: string; readonly amountYocto: YoctoAmount | null; }
export interface ChainReceiptInterpretation { readonly operationId: string; readonly transactionHash: string | null; readonly included: boolean; readonly callbackCompleted: boolean; readonly succeeded: boolean; readonly reconciliationRequired: boolean; readonly error: string | null; }

export interface RoyaltyDeskClientOptions { readonly contractId: string; readonly provider: Provider; readonly gas?: bigint; }

export class RoyaltyDeskClient {
  readonly contractId: string;
  readonly provider: Provider;
  readonly gas: bigint;

  constructor(options: RoyaltyDeskClientOptions) {
    this.contractId = options.contractId;
    this.provider = options.provider;
    this.gas = options.gas ?? 100_000_000_000_000n;
  }

  async view<T extends object | string | number | boolean>(methodName: string, args: Record<string, unknown> = {}): Promise<T> {
    const value = await this.provider.callFunction<T>({ contractId: this.contractId, method: methodName, args });
    if (value === undefined) throw new Error(`View ${methodName} returned no value`);
    return value;
  }

  async call(account: Account, methodName: string, args: Record<string, unknown> = {}, depositYocto: bigint = 0n): Promise<ChainTransactionResponse> {
    return account.signAndSendTransaction({ receiverId: this.contractId, actions: [actions.functionCall(methodName, args, this.gas, depositYocto)], waitUntil: "FINAL" });
  }

  async callResult<T extends object | string | number | boolean>(account: Account, methodName: string, args: Record<string, unknown> = {}, depositYocto: bigint = 0n): Promise<T> {
    return getTransactionLastResult(await this.call(account, methodName, args, depositYocto)) as T;
  }

  createRelease(account: Account, releaseId: string, recordingId: string, funderId: string, invitedOwnerIds: readonly string[]): Promise<ChainTransactionResponse> {
    return this.call(account, "create_release", { release_id: releaseId, recording_id: recordingId, funder_id: funderId, invited_owner_ids: invitedOwnerIds });
  }

  freezeAgreement(account: Account, releaseId: string, input: AgreementInput): Promise<ChainTransactionResponse> {
    return this.call(account, "freeze_agreement", { release_id: releaseId, input });
  }

  openSettlement(account: Account, releaseId: string, input: SettlementInput): Promise<ChainTransactionResponse> {
    return this.call(account, "open_settlement", { release_id: releaseId, input });
  }

  fundSettlement(account: Account, releaseId: string, period: string, amountYocto: bigint): Promise<ChainTransactionResponse> {
    return this.call(account, "fund_settlement", { release_id: releaseId, period }, amountYocto);
  }

  executePayout(account: Account, releaseId: string, period: string, ownerId: string): Promise<ChainTransactionResponse> {
    return this.call(account, "execute_payout", { release_id: releaseId, period, owner_id: ownerId });
  }
}

export function interpretReceipt(operation: ChainOperationDescriptor, response: ChainTransactionResponse, evidence: Omit<TransferEvidence, "transactionHash" | "transactionIncluded" | "transactionFailed">): ChainReceiptInterpretation {
  const failed = typeof response.status === "object" && response.status !== null && "Failure" in response.status;
  const kind = operation.action === "withdraw_refundable" ? "refund" : "payout";
  const result = interpretTransfer({ ...evidence, transactionHash: response.transaction?.hash ?? null, transactionIncluded: true, transactionFailed: failed }, kind);
  return { operationId: operation.operationId, transactionHash: result.transactionHash, included: result.included, callbackCompleted: result.callbackCompleted, succeeded: result.status === "paid" || result.status === "refunded", reconciliationRequired: result.status === "reconciliation_required", error: result.status === "failed" ? (failed ? JSON.stringify(response.status) : "Transfer failed; contract restored the obligation") : null };
}
