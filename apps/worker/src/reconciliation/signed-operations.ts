import type { DatabaseSync } from "node:sqlite";
import { JsonRpcProvider, SignedTransaction } from "near-api-js";
import { updateChainOperation } from "@royaltydesk/persistence";

export async function reconcileSignedOperations(database: DatabaseSync, rpcUrl: string): Promise<number> {
  const rows = database.prepare("SELECT id, transaction_hash, signed_identity FROM chain_operations WHERE status IN ('signed','broadcast','unknown','reconciling') AND transaction_hash IS NOT NULL LIMIT 100").all();
  const provider = new JsonRpcProvider({ url: rpcUrl });
  let resolved = 0;
  for (const row of rows) {
    if (typeof row.id !== "string" || typeof row.transaction_hash !== "string" || typeof row.signed_identity !== "string") continue;
    try {
      const signed = SignedTransaction.decode(Buffer.from(row.signed_identity, "base64"));
      const receipt = await provider.viewTransactionStatus({ txHash: row.transaction_hash, accountId: signed.transaction.signerId, waitUntil: "FINAL" });
      const failed = typeof receipt.status === "object" && receipt.status !== null && "Failure" in receipt.status;
      const succeeded = typeof receipt.status === "object" && receipt.status !== null && ("SuccessValue" in receipt.status || "SuccessReceiptId" in receipt.status);
      if (!failed && !succeeded) { updateChainOperation(database, row.id, { status: "reconciling" }); continue; }
      updateChainOperation(database, row.id, { status: failed ? "failure" : "success" });
      resolved += 1;
    } catch {
      updateChainOperation(database, row.id, { status: "reconciling" });
    }
  }
  return resolved;
}
