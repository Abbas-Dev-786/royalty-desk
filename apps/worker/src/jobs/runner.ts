import { randomUUID } from "node:crypto";
import { JobStore, type JobState, type StoredJob } from "@studio/persistence";

export interface JobExecutionContext { readonly job: StoredJob; readonly workerId: string; readonly heartbeat: () => boolean; }
export type JobHandler = (context: JobExecutionContext) => Promise<{ readonly resultJson?: string; readonly awaitingHuman?: boolean }>;

function failureCode(error: unknown): string {
  const nested = error instanceof AggregateError ? error.errors as unknown[] : [];
  const codes = (nested.length ? nested : [error]).flatMap((value) => value instanceof Error ? [value.message] : []);
  const recognized = codes.find((message) => /^ERR_[A-Z0-9_]+(?::[a-zA-Z0-9._-]+)?$/.test(message));
  return recognized ?? (error instanceof Error ? error.message.slice(0, 128) : "ERR_JOB_FAILED");
}

export class DurableJobRunner {
  readonly #store: JobStore;
  readonly #workerId: string;
  readonly #leaseDurationMs: number;

  constructor(store: JobStore, workerId = randomUUID(), leaseDurationMs = 30_000) { this.#store = store; this.#workerId = workerId; this.#leaseDurationMs = leaseDurationMs; }

  async run(jobId: string, handler: JobHandler, nowMs = Date.now()): Promise<StoredJob | undefined> {
    const leased = this.#store.lease(jobId, this.#workerId, nowMs, this.#leaseDurationMs);
    if (!leased) return undefined;
    const running = this.#store.transition(jobId, this.#workerId, "leased", "running", nowMs);
    if (!running) throw new Error("ERR_JOB_LEASE_LOST");
    try {
      const result = await handler({ job: running, workerId: this.#workerId, heartbeat: () => this.#store.heartbeat(jobId, this.#workerId, Date.now(), this.#leaseDurationMs) });
      const state: JobState = result.awaitingHuman ? "awaiting_human" : "succeeded";
      return this.#store.transition(jobId, this.#workerId, "running", state, Date.now(), result.resultJson);
    } catch (error) {
      const errorCode = failureCode(error);
      return this.#store.transition(jobId, this.#workerId, "running", "failed", Date.now(), undefined, errorCode);
    }
  }
}
