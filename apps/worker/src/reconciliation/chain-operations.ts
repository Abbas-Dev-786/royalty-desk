import { getChainOperation, type ChainOperation, updateChainOperation } from "@royaltydesk/persistence";
import type { DatabaseSync } from "node:sqlite";

export interface ReconciliationAdapter { readonly lookup: (transactionHash: string) => Promise<"success" | "failure" | "unknown">; }

export async function reconcileOperation(database: DatabaseSync, operationId: string, adapter: ReconciliationAdapter): Promise<ChainOperation | undefined> {
  const operation = getChainOperation(database, operationId);
  if (!operation) return undefined;
  if (!operation.transactionHash || operation.status === "success" || operation.status === "failure") return operation;
  const result = await adapter.lookup(operation.transactionHash);
  if (result === "unknown") return updateChainOperation(database, operationId, { status: "reconciling" });
  return updateChainOperation(database, operationId, { status: result });
}
