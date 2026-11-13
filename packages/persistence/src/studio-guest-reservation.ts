import type { DatabaseSync } from "node:sqlite";

/** Give an unstarted guest request a fresh run window after its old deadline expires. */
export function renewUnstartedGuestDeadline(database: DatabaseSync, accountId: string, projectId: string, nowMs = Date.now()): number | null {
  const row = database.prepare("SELECT deadline_at_ms, session_id FROM studio_guest_songs WHERE account_id = ? AND project_id = ?").get(accountId, projectId) as { deadline_at_ms: number; session_id: string | null } | undefined;
  if (!row) return null;
  if (row.session_id || row.deadline_at_ms > nowMs) return row.deadline_at_ms;
  const hasJob = database.prepare("SELECT 1 FROM jobs WHERE release_id = ? LIMIT 1").get(projectId);
  const hasCreativeOperation = database.prepare("SELECT 1 FROM studio_external_operations WHERE operation_type = 'near_ai_creative' AND logical_key LIKE ? LIMIT 1").get(`creative:${projectId}:%`);
  if (hasJob || hasCreativeOperation) return row.deadline_at_ms;
  const deadlineAtMs = nowMs + 600_000;
  database.prepare("UPDATE studio_guest_songs SET deadline_at_ms = ? WHERE account_id = ? AND project_id = ? AND session_id IS NULL").run(deadlineAtMs, accountId, projectId);
  return deadlineAtMs;
}
