import { DatabaseSync } from "node:sqlite";

export type JobState = "queued" | "leased" | "running" | "awaiting_human" | "succeeded" | "failed";

export interface NewJob {
  readonly id: string;
  readonly releaseId: string;
  readonly inputDigest: string;
}

export interface StoredJob extends NewJob {
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
    this.#database = new DatabaseSync(path, { timeout: 5_000 });
    this.#database.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    this.#database.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        release_id TEXT NOT NULL,
        input_digest TEXT NOT NULL CHECK(length(input_digest) = 64),
        state TEXT NOT NULL CHECK(state IN ('queued','leased','running','awaiting_human','succeeded','failed')),
        lease_owner TEXT,
        lease_expires_at_ms INTEGER,
        attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
        created_at_ms INTEGER NOT NULL
      ) STRICT;
      CREATE UNIQUE INDEX IF NOT EXISTS jobs_logical_input
      ON jobs(release_id, input_digest);
    `);
  }

  enqueue(job: NewJob, nowMs = Date.now()): StoredJob {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(job.id)) throw new Error("Invalid job id");
    if (!/^[a-f0-9]{64}$/.test(job.inputDigest)) throw new Error("Invalid input digest");
    this.#database.prepare(`
      INSERT INTO jobs (id, release_id, input_digest, state, created_at_ms)
      VALUES (?, ?, ?, 'queued', ?)
    `).run(job.id, job.releaseId, job.inputDigest, nowMs);
    const stored = this.get(job.id);
    if (!stored) throw new Error("Job insert did not persist");
    return stored;
  }

  get(id: string): StoredJob | undefined {
    return mapJob(this.#database.prepare(`
      SELECT id, release_id, input_digest, state, lease_owner, lease_expires_at_ms, attempts
      FROM jobs WHERE id = ?
    `).get(id));
  }

  lease(id: string, owner: string, nowMs: number, durationMs: number): StoredJob | undefined {
    if (!Number.isSafeInteger(durationMs) || durationMs <= 0) throw new Error("Invalid lease duration");
    this.#database.exec("BEGIN IMMEDIATE");
    try {
      const result = this.#database.prepare(`
        UPDATE jobs
        SET state = 'leased', lease_owner = ?, lease_expires_at_ms = ?, attempts = attempts + 1
        WHERE id = ?
          AND (state = 'queued' OR (state = 'leased' AND lease_expires_at_ms <= ?))
      `).run(owner, nowMs + durationMs, id, nowMs);
      this.#database.exec("COMMIT");
      return result.changes === 1 ? this.get(id) : undefined;
    } catch (error) {
      if (this.#database.isTransaction) this.#database.exec("ROLLBACK");
      throw error;
    }
  }

  close(): void {
    this.#database.close();
  }
}

export function openJobStore(path: string): JobStore {
  return new JobStore(path);
}
