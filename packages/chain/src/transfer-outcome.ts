export interface TransferEvidence {
  readonly transactionHash: string | null;
  readonly transactionIncluded: boolean;
  readonly transactionFailed: boolean;
  readonly transferReceiptSucceeded: boolean | null;
  readonly callbackReceiptSucceeded: boolean | null;
  readonly contractState: "pending" | "available" | "paid" | "refund_pending" | "refundable" | "refunded" | "unknown";
  readonly attemptMatches: boolean;
}

export interface TransferOutcome {
  readonly status: "paid" | "refunded" | "failed" | "reconciliation_required";
  readonly transactionHash: string | null;
  readonly included: boolean;
  readonly transferCompleted: boolean;
  readonly callbackCompleted: boolean;
}

export function interpretTransfer(evidence: TransferEvidence, kind: "payout" | "refund"): TransferOutcome {
  const confirmed = kind === "payout" ? "paid" : "refunded";
  const retryable = kind === "payout" ? "available" : "refundable";
  const success = evidence.transactionIncluded && !evidence.transactionFailed && evidence.transferReceiptSucceeded === true && evidence.callbackReceiptSucceeded === true && evidence.attemptMatches && evidence.contractState === confirmed;
  const failed = evidence.transactionIncluded && evidence.callbackReceiptSucceeded === true && evidence.attemptMatches && evidence.contractState === retryable && (evidence.transactionFailed || evidence.transferReceiptSucceeded === false);
  return {
    status: success ? confirmed : failed ? "failed" : "reconciliation_required",
    transactionHash: evidence.transactionHash,
    included: evidence.transactionIncluded,
    transferCompleted: evidence.transferReceiptSucceeded === true,
    callbackCompleted: evidence.callbackReceiptSucceeded === true
  };
}
