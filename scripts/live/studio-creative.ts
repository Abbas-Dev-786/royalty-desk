import { createHash } from "node:crypto";
import { addStudioAgent, createStudio, createStudioProject, openDatabase } from "@royaltydesk/persistence";
import { createCreativeNearAiModel, runCreativeModelStep } from "../../apps/worker/src/studio/creative-model.ts";

const apiKey = process.env.NEAR_AI_API_KEY;
const modelName = process.env.NEAR_AI_MODEL;
if (!apiKey || !modelName) throw new Error("NEAR_AI_API_KEY and NEAR_AI_MODEL are required");
const database = openDatabase(":memory:");
try {
  createStudio(database, "studio-live-probe", "admin.testnet");
  createStudioProject(database, { id: "project-live-probe", studioId: "studio-live-probe", title: "Original demo song" });
  addStudioAgent(database, { id: "lyricist-probe", studioId: "studio-live-probe", accountId: "lyricist.testnet", controllerAccountId: "admin.testnet", role: "lyricist", active: true, allowedTools: ["lyrics"], maxCalls: 1 });
  const output = await runCreativeModelStep(database, createCreativeNearAiModel({ baseUrl: process.env.NEAR_AI_BASE_URL ?? "https://cloud-api.near.ai/v1", apiKey, model: modelName }), {
    projectId: "project-live-probe", agentId: "lyricist-probe", role: "lyrics", revision: 0,
    brief: "Write four original, gentle lines about a sunrise over a quiet river. No named artists or existing songs.", context: "Four short lines only.", maxCalls: 1, maxOutputTokens: 1000
  });
  const row = database.prepare("SELECT model, provider_mode, response_id, input_tokens, output_tokens, input_hash, output_hash FROM studio_model_outputs LIMIT 1").get() as { model: string; provider_mode: string; response_id: string | null; input_tokens: number | null; output_tokens: number | null; input_hash: string; output_hash: string } | undefined;
  if (!row || row.provider_mode !== "live" || output.trim().length < 20) throw new Error("Live creative output was not useful");
  process.stdout.write(JSON.stringify({ status: "ok", model: row.model, responseId: row.response_id, inputTokens: row.input_tokens, outputTokens: row.output_tokens, inputHash: row.input_hash, outputHash: row.output_hash, outputLength: output.length, excerpt: output.slice(0, 120), excerptHash: createHash("sha256").update(output.slice(0, 120)).digest("hex") }) + "\n");
} finally {
  database.close();
}
