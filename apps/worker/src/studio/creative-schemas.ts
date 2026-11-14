import { z } from "zod";

export type CreativeRole = "lyrics" | "composition" | "review" | "revision" | "split_proposal" | "split_response";

const textOutput = z.object({ content: z.string().min(1).max(12_000) }).strict();
const reviewOutput = z.object({ content: z.string().regex(/^(ACCEPT|REVISE):/).max(12_000) }).strict();
const splitOutput = z.object({
  lyricistBasisPoints: z.number().int().min(0).max(10_000),
  composerBasisPoints: z.number().int().min(0).max(10_000)
}).strict().refine((split) => split.lyricistBasisPoints + split.composerBasisPoints === 10_000);
const decisionOutput = splitOutput.safeExtend({ decision: z.enum(["accept", "counter"]) }).strict();

export const creativeStepInput = z.object({
  projectId: z.string().min(1),
  agentId: z.string().min(1),
  role: z.enum(["lyrics", "composition", "review", "revision", "split_proposal", "split_response"]),
  revision: z.number().int().min(0).max(2),
  brief: z.string().trim().min(1).max(4_000),
  context: z.string().max(16_000),
  maxCalls: z.number().int().min(1).max(10),
  maxOutputTokens: z.number().int().min(1).max(4_000),
  deadlineAtMs: z.number().int().optional(),
  retryKnownFailure: z.literal(1).optional()
}).strict();

export function creativeOutputSchema(role: CreativeRole, revision: number) {
  if (role === "split_response" || (role === "split_proposal" && revision > 0)) return decisionOutput;
  if (role === "split_proposal") return splitOutput;
  if (role === "review") return reviewOutput;
  return textOutput;
}

export function creativeResponseFormat(role: CreativeRole, revision: number) {
  const schema = z.toJSONSchema(creativeOutputSchema(role, revision), { target: "draft-7" });
  const { $schema: _draft, ...jsonSchema } = schema;
  return { type: "json_schema" as const, json_schema: { name: `creative_${role}${role === "split_proposal" && revision > 0 ? "_counter" : ""}`, strict: true as const, schema: jsonSchema } };
}

export function parseCreativeOutput(role: CreativeRole, revision: number, raw: string): string {
  let decoded: unknown;
  try { decoded = JSON.parse(raw) as unknown; }
  catch { throw new Error("ERR_CREATIVE_MODEL_FORMAT"); }
  const schema = creativeOutputSchema(role, revision);
  const parsed = schema.safeParse(decoded);
  if (!parsed.success) throw new Error(role === "split_proposal" ? "ERR_CREATIVE_SPLIT_PROPOSAL_FORMAT" : "ERR_CREATIVE_MODEL_FORMAT");
  return "content" in parsed.data ? parsed.data.content : JSON.stringify(parsed.data);
}
