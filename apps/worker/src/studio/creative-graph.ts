import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { DatabaseSync } from "node:sqlite";
import { END, START, StateGraph, StateSchema } from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { z } from "zod";
import type { AgentModel } from "../near-ai/model.ts";
import { runCreativeModelStep } from "./creative-model.ts";

const CreativeState = new StateSchema({
  projectId: z.string(),
  brief: z.string(),
  lyrics: z.string().default(""),
  composition: z.string().default(""),
  review: z.string().default(""),
  splitProposal: z.string().default(""),
  splitDecision: z.string().default(""),
  revisionCount: z.number().int().default(0),
  status: z.enum(["running", "accepted", "countered", "awaiting_acceptance", "unresolved"]).default("running")
});

const splitSchema = z.object({ lyricistBasisPoints: z.number().int().min(0).max(10_000), composerBasisPoints: z.number().int().min(0).max(10_000) });
const decisionSchema = splitSchema.extend({ decision: z.enum(["accept", "counter"]) });

export function parseSplitProposal(raw: string): z.infer<typeof splitSchema> {
  try {
    const proposal = splitSchema.parse(JSON.parse(raw) as unknown);
    if (proposal.lyricistBasisPoints + proposal.composerBasisPoints !== 10_000) throw new Error("ERR_CREATIVE_SPLIT_TOTAL");
    return proposal;
  } catch (error) {
    if (error instanceof Error && error.message === "ERR_CREATIVE_SPLIT_TOTAL") throw error;
    throw new Error("ERR_CREATIVE_SPLIT_PROPOSAL_FORMAT");
  }
}

export function parseSplitDecision(raw: string): z.infer<typeof decisionSchema> {
  try {
    const decoded: unknown = JSON.parse(raw);
    if (typeof decoded === "object" && decoded !== null) {
      const fields = decoded as Record<string, unknown>;
      if (fields.lyricistBasisPoints !== undefined && fields.lyricist_bp !== undefined && fields.lyricistBasisPoints !== fields.lyricist_bp) throw new Error("ERR_CREATIVE_SPLIT_RESPONSE_FORMAT");
      if (fields.composerBasisPoints !== undefined && fields.composer_bp !== undefined && fields.composerBasisPoints !== fields.composer_bp) throw new Error("ERR_CREATIVE_SPLIT_RESPONSE_FORMAT");
      return decisionSchema.parse({ decision: fields.decision, lyricistBasisPoints: fields.lyricistBasisPoints ?? fields.lyricist_bp, composerBasisPoints: fields.composerBasisPoints ?? fields.composer_bp });
    }
    return decisionSchema.parse(decoded);
  } catch (error) {
    if (!(error instanceof SyntaxError)) throw error;
  }
  const match = /^Decision:\s*(ACCEPT|COUNTER)\s*\|\s*lyricistBasisPoints:\s*([0-9]{1,5})\s*\|\s*composerBasisPoints:\s*([0-9]{1,5})\s*\|\s*total:\s*([0-9]{1,5})(?:\.|\s|$)/i.exec(raw);
  if (!match || Number(match[4]) !== 10_000) throw new Error("ERR_CREATIVE_SPLIT_RESPONSE_FORMAT");
  return decisionSchema.parse({ decision: match[1]?.toLowerCase(), lyricistBasisPoints: Number(match[2]), composerBasisPoints: Number(match[3]) });
}

export interface CreativeGraphOptions {
  readonly database: DatabaseSync;
  readonly checkpointPath: string;
  readonly model: AgentModel;
  readonly lyricistId: string;
  readonly composerId: string;
  readonly reviewerId: string;
  readonly maxCalls: number;
  readonly maxOutputTokens: number;
  readonly maxRevisions: number;
  readonly deadlineAtMs?: number;
}

export function createCreativeGraph(options: CreativeGraphOptions) {
  if (!Number.isInteger(options.maxRevisions) || options.maxRevisions < 0 || options.maxRevisions > 2) throw new Error("ERR_CREATIVE_REVISION_LIMIT");
  if (options.lyricistId === options.composerId) throw new Error("ERR_CREATIVE_DISTINCT_AGENTS_REQUIRED");
  mkdirSync(dirname(options.checkpointPath), { recursive: true });
  const saver = SqliteSaver.fromConnString(options.checkpointPath);
  const step = (role: "lyrics" | "composition" | "review" | "revision" | "split_proposal" | "split_response", agentId: string, state: typeof CreativeState.State, context: string, revision = state.revisionCount) => runCreativeModelStep(options.database, options.model, {
    projectId: state.projectId,
    agentId,
    role,
    revision,
    brief: state.brief,
    context,
    maxCalls: options.maxCalls,
    maxOutputTokens: options.maxOutputTokens,
    ...(options.deadlineAtMs === undefined ? {} : { deadlineAtMs: options.deadlineAtMs })
  });
  const graph = new StateGraph(CreativeState)
    .addNode("write_lyrics", async (state) => ({ lyrics: await step("lyrics", options.lyricistId, state, "Write original lyrics.") }))
    .addNode("plan_composition", async (state) => ({ composition: await step("composition", options.composerId, state, `Write an original composition plan for these lyrics: ${state.lyrics}`) }))
    .addNode("review_work", async (state) => {
      const review = await step("review", options.reviewerId, state, `Lyrics: ${state.lyrics}\nComposition: ${state.composition}. Start content with ACCEPT: or REVISE:.`);
      return { review, status: review.startsWith("ACCEPT:") ? "accepted" as const : options.maxRevisions > state.revisionCount ? "running" as const : "unresolved" as const };
    })
    .addNode("revise_lyrics", async (state) => ({ lyrics: await step("revision", options.lyricistId, state, `Revise lyrics using feedback: ${state.review}`), revisionCount: state.revisionCount + 1 }))
    .addNode("propose_split", async (state) => {
      const raw = await step("split_proposal", options.lyricistId, state, "Propose contributor shares totaling 10000 basis points. Your content field must contain only a JSON object string with integer lyricistBasisPoints and composerBasisPoints. No prose, markdown, or explanation.");
      const proposal = parseSplitProposal(raw);
      return { splitProposal: JSON.stringify(proposal) };
    })
    .addNode("respond_split", async (state) => {
      const raw = await step("split_response", options.composerId, state, `Review proposal ${state.splitProposal}. Return JSON with decision accept or counter and both basis-point values totaling 10000.`);
      const response = parseSplitDecision(raw);
      const proposal = splitSchema.parse(JSON.parse(state.splitProposal) as unknown);
      if (response.lyricistBasisPoints + response.composerBasisPoints !== 10_000) throw new Error("ERR_CREATIVE_SPLIT_TOTAL");
      const matches = response.lyricistBasisPoints === proposal.lyricistBasisPoints && response.composerBasisPoints === proposal.composerBasisPoints;
      return { splitDecision: JSON.stringify(response), status: response.decision === "accept" && matches ? "awaiting_acceptance" as const : response.decision === "counter" ? "countered" as const : "unresolved" as const };
    })
    .addNode("accept_counter", async (state) => {
      const counter = decisionSchema.parse(JSON.parse(state.splitDecision) as unknown);
      const raw = await step("split_proposal", options.lyricistId, state, `Composer countered your split with ${counter.lyricistBasisPoints} lyricist basis points and ${counter.composerBasisPoints} composer basis points. Return JSON inside content with decision accept and those exact values if you agree, or decision counter with your alternative values totaling 10000.`, state.revisionCount + 1);
      const answer = parseSplitDecision(raw);
      if (answer.lyricistBasisPoints + answer.composerBasisPoints !== 10_000) throw new Error("ERR_CREATIVE_SPLIT_TOTAL");
      const agreed = answer.decision === "accept" && answer.lyricistBasisPoints === counter.lyricistBasisPoints && answer.composerBasisPoints === counter.composerBasisPoints;
      return { splitDecision: JSON.stringify(answer), status: agreed ? "awaiting_acceptance" as const : "unresolved" as const };
    })
    .addEdge(START, "write_lyrics")
    .addEdge("write_lyrics", "plan_composition")
    .addEdge("plan_composition", "review_work")
    .addConditionalEdges("review_work", (state) => state.status === "running" ? "revise_lyrics" : state.status === "accepted" ? "propose_split" : END, ["revise_lyrics", "propose_split", END])
    .addEdge("revise_lyrics", "review_work")
    .addEdge("propose_split", "respond_split")
    .addConditionalEdges("respond_split", (state) => state.status === "countered" ? "accept_counter" : END, ["accept_counter", END])
    .addEdge("accept_counter", END)
    .compile({ checkpointer: saver });
  return { graph, close: () => saver.db.close() };
}
