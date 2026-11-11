import type { DatabaseSync } from "node:sqlite";
import { JsonRpcProvider, SignedTransaction } from "near-api-js";
import { updateChainOperation } from "@royaltydesk/persistence";
import { interpretTransfer } from "@royaltydesk/chain";

interface SettlementView {
  readonly entitlements: readonly { readonly owner_id: string; readonly status: string; readonly amount_yocto: string; readonly attempt_id: string }[];
  readonly refundable_yocto: string;
  readonly in_flight_yocto: string;
}

function isSuccess(status: unknown): boolean {
  return typeof status === "object" && status !== null && ("SuccessValue" in status || "SuccessReceiptId" in status);
}

function transferReceipts(receipt: { readonly receipts_outcome?: readonly { readonly outcome: { readonly status: unknown; readonly executor_id: string } }[] }, recipient: string, contractId: string): { readonly transfer: boolean | null; readonly callback: boolean | null } {
  const outcomes = receipt.receipts_outcome;
  if (!outcomes || outcomes.length < 3) return { transfer: null, callback: null };
  const transfer = outcomes.find((entry) => entry.outcome.executor_id === recipient);
  const callback = [...outcomes].reverse().find((entry) => entry.outcome.executor_id === contractId);
  return { transfer: transfer ? isSuccess(transfer.outcome.status) : null, callback: callback && callback !== outcomes[0] ? isSuccess(callback.outcome.status) : null };
}

export async function reconcileSignedOperations(database: DatabaseSync, rpcUrl: string): Promise<number> {
  const rows = database.prepare("SELECT id, transaction_hash, signed_identity, operation_type, release_id, intent_json FROM chain_operations WHERE status IN ('signed','broadcast','unknown','reconciling') AND transaction_hash IS NOT NULL LIMIT 100").all();
  const provider = new JsonRpcProvider({ url: rpcUrl });
  let resolved = 0;
  for (const row of rows) {
    if (typeof row.id !== "string" || typeof row.transaction_hash !== "string" || typeof row.signed_identity !== "string") continue;
    try {
      const signed = SignedTransaction.decode(Buffer.from(row.signed_identity, "base64"));
      const receipt = await provider.viewTransactionStatus({ txHash: row.transaction_hash, accountId: signed.transaction.signerId, waitUntil: "FINAL" });
      const failed = typeof receipt.status === "object" && receipt.status !== null && "Failure" in receipt.status;
      const succeeded = isSuccess(receipt.status);
      if (row.operation_type === "execute_payout" || row.operation_type === "withdraw_refundable") {
        const args = JSON.parse(String(row.intent_json)) as { period?: unknown; owner_id?: unknown };
        if (typeof args.period !== "string" || (row.operation_type === "execute_payout" && typeof args.owner_id !== "string")) throw new Error("ERR_TRANSFER_INTENT");
        const settlement = await provider.callFunction<SettlementView>({ contractId: signed.transaction.receiverId, method: "get_settlement", args: { release_id: row.release_id, period: args.period } });
        if (!settlement) throw new Error("ERR_SETTLEMENT_VIEW");
        const graph = transferReceipts(receipt, row.operation_type === "execute_payout" ? String(args.owner_id) : signed.transaction.signerId, signed.transaction.receiverId);
        const kind = row.operation_type === "execute_payout" ? "payout" : "refund";
        const entitlement = kind === "payout" ? settlement.entitlements.find((entry) => entry.owner_id === args.owner_id) : undefined;
        if (entitlement?.amount_yocto === "0" && entitlement.status === "Paid" && succeeded) {
          updateChainOperation(database, row.id, { status: "success" });
          resolved += 1;
          continue;
        }
        const state = kind === "payout" ? entitlement?.status?.toLowerCase() ?? "unknown" : BigInt(settlement.in_flight_yocto) > 0n ? "refund_pending" : BigInt(settlement.refundable_yocto) > 0n ? "refundable" : "refunded";
        const outcome = interpretTransfer({ transactionHash: row.transaction_hash, transactionIncluded: true, transactionFailed: failed, transferReceiptSucceeded: graph.transfer, callbackReceiptSucceeded: graph.callback, contractState: state as "pending" | "available" | "paid" | "refund_pending" | "refundable" | "refunded" | "unknown", attemptMatches: kind === "refund" || (entitlement !== undefined && BigInt(entitlement.attempt_id) > 0n) }, kind);
        const status = outcome.status === "reconciliation_required" ? "reconciling" : outcome.status === "failed" ? "failure" : "success";
        updateChainOperation(database, row.id, { status });
        if (status !== "reconciling") resolved += 1;
        continue;
      }
      if (!failed && !succeeded) { updateChainOperation(database, row.id, { status: "reconciling" }); continue; }
      updateChainOperation(database, row.id, { status: failed ? "failure" : "success" });
      resolved += 1;
    } catch {
      updateChainOperation(database, row.id, { status: "reconciling" });
    }
  }
  return resolved;
}
