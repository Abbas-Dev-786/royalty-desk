import { createHash } from "node:crypto";
import { JobStore, openDatabase } from "@studio/persistence";
import type { DatabaseSync } from "node:sqlite";
import type { AgentModel } from "../near-ai/model.ts";
import { DurableJobRunner } from "../jobs/runner.ts";
import { createCreativeGraph } from "./creative-graph.ts";
import { z } from "zod";

export interface StudioCreativeRequest {
  readonly projectId: string;
  readonly brief: string;
  readonly lyricistId: string;
  readonly composerId: string;
  readonly reviewerId: string;
  readonly maxCalls: number;
  readonly maxOutputTokens: number;
  readonly maxRevisions: number;
  readonly deadlineAtMs: number;
}

const requestSchema = z.object({
  projectId: z.string().min(1).max(64),
  brief: z.string().min(1).max(4000),
  lyricistId: z.string().min(1).max(64),
  composerId: z.string().min(1).max(64),
  reviewerId: z.string().min(1).max(64),
  maxCalls: z.number().int().min(1).max(10),
  maxOutputTokens: z.number().int().min(1).max(4000),
  maxRevisions: z.number().int().min(0).max(2),
  deadlineAtMs: z.number().int().positive()
}).strict();

function digest(value: string): string { return createHash("sha256").update(value).digest("hex"); }

export class StudioCreativeService {
  readonly #database: DatabaseSync;
  readonly #jobs: JobStore;
  readonly #runner: DurableJobRunner;
  readonly #checkpointPath: string;
  readonly #model: AgentModel;

  constructor(databasePath: string, checkpointPath: string, model: AgentModel) {
    this.#database = openDatabase(databasePath);
    this.#jobs = new JobStore(databasePath);
    this.#runner = new DurableJobRunner(this.#jobs);
    this.#checkpointPath = checkpointPath;
    this.#model = model;
  }

  create(request: StudioCreativeRequest): string {
    requestSchema.parse(request);
    if (request.lyricistId === request.composerId) throw new Error("ERR_CREATIVE_IDENTITY_OR_DEADLINE");
    const accounts = new Map<string, string>();
    for (const id of new Set([request.lyricistId, request.composerId, request.reviewerId])) {
      const agent = this.#database.prepare("SELECT a.account_id FROM studio_agents a JOIN studio_projects p ON p.studio_id = a.studio_id WHERE p.id = ? AND a.id = ? AND a.active = 1 AND a.revoked_at_ms IS NULL AND (a.expires_at_ms IS NULL OR a.expires_at_ms > ?)").get(request.projectId, id, Date.now()) as { account_id: string } | undefined;
      if (!agent) throw new Error("ERR_CREATIVE_AGENT_SCOPE");
      accounts.set(id, agent.account_id);
    }
    if (accounts.get(request.lyricistId) === accounts.get(request.composerId)) throw new Error("ERR_CREATIVE_SHARED_ACCOUNT");
    const inputDigest = digest(JSON.stringify(request));
    const sessionId = digest(`studio-creative:${request.projectId}:${inputDigest}`);
    if (!this.#jobs.get(sessionId)) {
      if (request.deadlineAtMs <= Date.now()) throw new Error("ERR_CREATIVE_IDENTITY_OR_DEADLINE");
      this.#jobs.enqueue({ id: sessionId, logicalKey: `studio-creative:${request.projectId}:${inputDigest}`, releaseId: request.projectId, participantId: request.lyricistId, inputDigest });
    }
    return sessionId;
  }

  async run(sessionId: string, request: StudioCreativeRequest): Promise<{ readonly status: string; readonly sessionId: string }> {
    requestSchema.parse(request);
    const job = this.#jobs.get(sessionId);
    if (!job || job.inputDigest !== digest(JSON.stringify(request))) throw new Error("ERR_CREATIVE_SESSION_INPUT");
    if (job.state === "succeeded" || job.state === "awaiting_human") return { status: job.state, sessionId };
    if (job.state === "failed") {
      if (job.attempts >= 3) throw new Error("ERR_CREATIVE_RETRY_LIMIT");
      const prefix = `creative:${request.projectId}:`;
      const unsafe = this.#database.prepare("SELECT 1 FROM studio_external_operations o WHERE o.operation_type = 'near_ai_creative' AND substr(o.logical_key, 1, ?) = ? AND o.status != 'finalized' AND NOT (o.status = 'failed' AND EXISTS (SELECT 1 FROM studio_external_operations retry WHERE retry.logical_key = o.logical_key || ':retry:1' AND retry.status = 'finalized')) LIMIT 1").get(prefix.length, prefix);
      if (unsafe) throw new Error("ERR_CREATIVE_OUTCOME_UNKNOWN");
      if (!this.#jobs.requeueFailed(sessionId)) throw new Error("ERR_CREATIVE_REQUEUE_FAILED");
    }
    const result = await this.#runner.run(sessionId, async ({ heartbeat }) => {
      const timer = setInterval(heartbeat, 10_000);
      const created = createCreativeGraph({ database: this.#database, checkpointPath: this.#checkpointPath, model: this.#model, ...request });
      try {
        const state = await created.graph.invoke({ projectId: request.projectId, brief: request.brief }, { configurable: { thread_id: sessionId } });
        return { resultJson: JSON.stringify({ status: state.status, revisionCount: state.revisionCount }), awaitingHuman: state.status === "awaiting_acceptance" || state.status === "unresolved" };
      } finally {
        clearInterval(timer);
        created.close();
      }
    });
    if (!result) throw new Error("ERR_CREATIVE_ALREADY_RUNNING");
    if (result.state === "failed") {
      const failure = this.#database.prepare("SELECT error_code FROM jobs WHERE id = ?").get(sessionId) as { error_code: string | null } | undefined;
      throw new Error(failure?.error_code ?? "ERR_CREATIVE_JOB_FAILED");
    }
    return { status: result.state, sessionId };
  }

  close(): void { this.#jobs.close(); this.#database.close(); }
}
