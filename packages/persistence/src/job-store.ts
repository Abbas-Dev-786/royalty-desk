import type { DatabaseSync } from "node:sqlite";
import { openDatabase } from "./database.ts";

export type JobState = "queued" | "leased" | "running" | "awaiting_human" | "succeeded" | "failed" | "cancelled";

export interface NewJob {
  readonly id: string;
  readonly releaseId: string;
  readonly inputDigest: string;
  readonly logicalKey?: string;
  readonly participantId?: string;
}

export interface StoredJob {
  readonly id: string;
  readonly releaseId: string;
  readonly inputDigest: string;
  readonly state: JobState;
  readonly leaseOwner: string | null;
  readonly leaseExpiresAtMs: number | null;
  readonly attempts: number;
}

function mapJob(row: unknown): StoredJob | undefined {
  if (typeof row !== "object" || row === null) return undefined;
  const value = row as Readonly<Record<string, unknown>>;
  if (
    typeof value.id !== "string" ||
    typeof value.logical_key !== "string" ||
    typeof value.release_id !== "string" ||
    typeof value.input_digest !== "string" ||
    typeof value.state !== "string" ||
    typeof value.attempts !== "number"
  ) return undefined;
  return {
    id: value.id,
    releaseId: value.release_id,
    inputDigest: value.input_digest,
    state: value.state as JobState,
    leaseOwner: typeof value.lease_owner === "string" ? value.lease_owner : null,
    leaseExpiresAtMs: typeof value.lease_expires_at_ms === "number" ? value.lease_expires_at_ms : null,
    attempts: value.attempts
  };
}

export class JobStore {
  readonly #database: DatabaseSync;

  constructor(path: string) {
    this.#database = openDatabase(path);
  }

  enqueue(job: NewJob, nowMs = Date.now()): StoredJob {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(job.id)) throw new Error("Invalid job id");
    if (!/^[a-f0-9]{64}$/.test(job.inputDigest)) throw new Error("Invalid input digest");
    const logicalKey = job.logicalKey ?? `${job.releaseId}:${job.inputDigest}`;
    this.#database.prepare(`INSERT INTO jobs (id, logical_key, release_id, participant_id, input_digest, state, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)`)
      .run(job.id, logicalKey, job.releaseId, job.participantId ?? null, job.inputDigest, nowMs, nowMs);
    this.#recordHistory(job.id, null, "queued", "enqueue", nowMs);
    const stored = this.get(job.id);
    if (!stored) throw new Error("Job insert did not persist");
    return stored;
  }

  get(id: string): StoredJob | undefined {
    return mapJob(this.#database.prepare(`
      SELECT id, logical_key, release_id, participant_id, input_digest, state, lease_owner, lease_expires_at_ms, attempts, result_json, error_code
      FROM jobs WHERE id = ?
    `).get(id));
  }

  lease(id: string, owner: string, nowMs: number, durationMs: number): StoredJob | undefined {
    if (!Number.isSafeInteger(durationMs) || durationMs <= 0) throw new Error("Invalid lease duration");
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = this.#database.prepare(`
        UPDATE jobs
        SET state = 'leased', lease_owner = ?, lease_expires_at_ms = ?, attempts = attempts + 1, updated_at_ms = ?
        WHERE id = ?
          AND (state = 'queued' OR (state IN ('leased','running') AND lease_expires_at_ms <= ?))
      `).run(owner, nowMs + durationMs, nowMs, id, nowMs);
      this.#database.exec("COMMIT");
      if (result.changes !== 1) return undefined;
      this.#recordHistory(id, "queued", "leased", owner, nowMs);
      return this.get(id);
    } catch (error) {
      if (this.#database.isTransaction) this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  transition(id: string, owner: string, from: JobState, to: JobState, nowMs = Date.now(), resultJson?: string, errorCode?: string): StoredJob | undefined {
    const result = this.#database.prepare(`UPDATE jobs SET state = ?, result_json = COALESCE(?, result_json), error_code = ?, updated_at_ms = ? WHERE id = ? AND state = ? AND lease_owner = ? AND (lease_expires_at_ms IS NULL OR lease_expires_at_ms > ?)`).run(to, resultJson ?? null, errorCode ?? null, nowMs, id, from, owner, nowMs);
    if (result.changes !== 1) return undefined;
    this.#recordHistory(id, from, to, owner, nowMs);
    return this.get(id);
  }

  heartbeat(id: string, owner: string, nowMs: number, durationMs: number): boolean {
    const result = this.#database.prepare(`UPDATE jobs SET lease_expires_at_ms = ?, updated_at_ms = ? WHERE id = ? AND lease_owner = ? AND state IN ('leased','running') AND lease_expires_at_ms > ?`).run(nowMs + durationMs, nowMs, id, owner, nowMs);
    return result.changes === 1;
  }

  requeueFailed(id: string, nowMs = Date.now()): StoredJob | undefined {
    const result = this.#database.prepare("UPDATE jobs SET state = 'queued', lease_owner = NULL, lease_expires_at_ms = NULL, error_code = NULL, updated_at_ms = ? WHERE id = ? AND state = 'failed'").run(nowMs, id);
    if (result.changes !== 1) return undefined;
    this.#recordHistory(id, "failed", "queued", "recovery", nowMs);
    return this.get(id);
  }

  #recordHistory(jobId: string, fromState: JobState | null, toState: JobState, actor: string, nowMs: number): void {
    this.#database.prepare(`INSERT INTO job_history(job_id, from_state, to_state, actor, created_at_ms) VALUES (?, ?, ?, ?, ?)`).run(jobId, fromState, toState, actor, nowMs);
  }

  close(): void {
    this.#database.close();
  }
}

export function openJobStore(path: string): JobStore {
  return new JobStore(path);
}
