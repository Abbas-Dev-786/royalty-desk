import type { DatabaseSync } from "node:sqlite";

export type ChainOperationStatus = "requested" | "signed" | "broadcast" | "success" | "failure" | "unknown" | "reconciling";
export interface ChainOperation { readonly id: string; readonly logicalKey: string; readonly releaseId: string; readonly operationType: string; readonly intentJson: string; readonly signedIdentity: string | null; readonly transactionHash: string | null; readonly status: ChainOperationStatus; readonly lastError: string | null; readonly updatedAtMs: number; }

function map(row: unknown): ChainOperation | undefined {
  if (typeof row !== "object" || row === null) return undefined;
  const value = row as Record<string, unknown>;
  if (typeof value.id !== "string" || typeof value.logical_key !== "string" || typeof value.release_id !== "string" || typeof value.operation_type !== "string" || typeof value.intent_json !== "string" || typeof value.status !== "string" || typeof value.updated_at_ms !== "number") return undefined;
  return { id: value.id, logicalKey: value.logical_key, releaseId: value.release_id, operationType: value.operation_type, intentJson: value.intent_json, signedIdentity: typeof value.signed_identity === "string" ? value.signed_identity : null, transactionHash: typeof value.transaction_hash === "string" ? value.transaction_hash : null, status: value.status as ChainOperationStatus, lastError: typeof value.last_error === "string" ? value.last_error : null, updatedAtMs: value.updated_at_ms };
}

export function createChainOperation(database: DatabaseSync, input: { readonly id: string; readonly logicalKey: string; readonly releaseId: string; readonly operationType: string; readonly intentJson: string; readonly nowMs?: number }): ChainOperation {
  const nowMs = input.nowMs ?? Date.now();
  database.prepare(`INSERT INTO chain_operations(id, logical_key, release_id, operation_type, intent_json, status, updated_at_ms) VALUES (?, ?, ?, ?, ?, 'requested', ?)`).run(input.id, input.logicalKey, input.releaseId, input.operationType, input.intentJson, nowMs);
  const result = getChainOperation(database, input.id);
  if (!result) throw new Error("Chain operation was not persisted");
  return result;
}

export function getChainOperation(database: DatabaseSync, id: string): ChainOperation | undefined { return map(database.prepare(`SELECT id, logical_key, release_id, operation_type, intent_json, signed_identity, transaction_hash, status, last_error, updated_at_ms FROM chain_operations WHERE id = ?`).get(id)); }

export function updateChainOperation(database: DatabaseSync, id: string, update: { readonly status: ChainOperationStatus; readonly signedIdentity?: string | null; readonly transactionHash?: string | null; readonly lastError?: string | null; readonly nowMs?: number }): ChainOperation | undefined {
  const result = database.prepare(`UPDATE chain_operations SET status = ?, signed_identity = COALESCE(?, signed_identity), transaction_hash = COALESCE(?, transaction_hash), last_error = ?, updated_at_ms = ? WHERE id = ?`).run(update.status, update.signedIdentity ?? null, update.transactionHash ?? null, update.lastError ?? null, update.nowMs ?? Date.now(), id);
  return result.changes === 1 ? getChainOperation(database, id) : undefined;
}
