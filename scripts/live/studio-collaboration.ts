import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addStudioAgent, createStudio, createStudioProject, openDatabase } from "@royaltydesk/persistence";
import { createCreativeNearAiModel } from "../../apps/worker/src/studio/creative-model.ts";
import { StudioCreativeService } from "../../apps/worker/src/studio/creative-service.ts";

const apiKey = process.env.NEAR_AI_API_KEY;
const modelName = process.env.NEAR_AI_MODEL;
if (!apiKey || !modelName) throw new Error("NEAR_AI_API_KEY and NEAR_AI_MODEL are required");
const root = process.argv[2] ?? mkdtempSync(join(tmpdir(), "studio-live-collab-"));
const databasePath = join(root, "studio.sqlite");
const checkpointPath = join(root, "graph.sqlite");
if (!process.argv[2]) {
  const database = openDatabase(databasePath);
  createStudio(database, "studio-live-collab", "admin.testnet");
  createStudioProject(database, { id: "project-live-collab", studioId: "studio-live-collab", title: "Sunrise song" });
  addStudioAgent(database, { id: "lyricist-live", studioId: "studio-live-collab", accountId: "lyricist.testnet", controllerAccountId: "admin.testnet", role: "lyricist", active: true, maxCalls: 5 });
  addStudioAgent(database, { id: "composer-live", studioId: "studio-live-collab", accountId: "composer.testnet", controllerAccountId: "admin.testnet", role: "composer", active: true, maxCalls: 5 });
  database.close();
}
const service = new StudioCreativeService(databasePath, checkpointPath, createCreativeNearAiModel({ baseUrl: process.env.NEAR_AI_BASE_URL ?? "https://cloud-api.near.ai/v1", apiKey, model: modelName, timeoutMs: 300_000 }));
try {
  const request = { projectId: "project-live-collab", brief: "Create an original gentle song about sunrise over a quiet river. Use four short lyric lines and a concise acoustic composition plan. Do not reference named artists or existing music.", lyricistId: "lyricist-live", composerId: "composer-live", reviewerId: "composer-live", maxCalls: 5, maxOutputTokens: 3000, maxRevisions: 0, deadlineAtMs: process.argv[3] ? Number(process.argv[3]) : Date.now() + 1_200_000 };
  const sessionId = service.create(request);
  process.stdout.write(JSON.stringify({ root, sessionId, deadlineAtMs: request.deadlineAtMs }) + "\n");
  const result = await service.run(sessionId, request);
  const proof = openDatabase(databasePath);
  try {
    const rows = proof.prepare("SELECT agent_id, role, model, response_id, input_hash, output_hash, input_tokens, output_tokens FROM studio_model_outputs ORDER BY role").all();
    if (new Set(rows.map((row) => row.agent_id)).size < 2 || rows.length < 3) throw new Error("Two-agent live contribution was not observed");
    process.stdout.write(JSON.stringify({ status: result.status, sessionId, runs: rows }) + "\n");
  } finally { proof.close(); }
} finally { service.close(); }
