import { runStructuredProbe } from "./client.ts";

const apiKey = process.env.NEAR_AI_API_KEY;
const model = process.env.NEAR_AI_MODEL;
if (!apiKey || !model) {
  console.error("Live NEAR AI probe blocked: NEAR_AI_API_KEY and NEAR_AI_MODEL are required.");
  process.exitCode = 2;
} else {
  try {
    const result = await runStructuredProbe({
      apiKey,
      model,
      baseUrl: process.env.NEAR_AI_BASE_URL ?? "https://cloud-api.near.ai/v1"
    });
    console.log(JSON.stringify({ status: "ok", model: result.model, action: result.action, usage: result.usage }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown gateway error";
    console.error(`Live NEAR AI probe failed: ${message}`);
    process.exitCode = 2;
  }
}
