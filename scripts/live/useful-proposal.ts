import { createHash } from "node:crypto";
import { createNearAiAgentModel, parseModelAction } from "../../apps/worker/src/agents/model.ts";

const apiKey = process.env.NEAR_AI_API_KEY;
const modelId = process.env.NEAR_AI_MODEL;
if (!apiKey || !modelId) {
  console.error("Useful live proposal requires NEAR_AI_API_KEY and NEAR_AI_MODEL.");
  process.exit(2);
}

const agreement = {
  schemaVersion: "1",
  releaseId: "live-negotiation-demo",
  recordingId: "ISRC-DEMO-001",
  effectivePeriod: "2026-12",
  participants: [
    { ownerId: "artist.testnet", basisPoints: "6000" },
    { ownerId: "producer.testnet", basisPoints: "2500" },
    { ownerId: "collaborator.testnet", basisPoints: "1500" }
  ],
  recoupment: { code: "advance-v1", beneficiaryId: "producer.testnet", capYocto: "2000000000000000000000000" }
} as const;
const input = JSON.stringify({ task: "Propose recording revenue terms for three owners. Return exactly one validated propose_terms action in JSON; do not add prose. The terms must use 6000/2500/1500 basis points, one 2 NEAR producer recoupment, and the supplied release/recording/effective period.", agreement });
const response = await createNearAiAgentModel({ baseUrl: process.env.NEAR_AI_BASE_URL ?? "https://cloud-api.near.ai/v1", apiKey, model: modelId }).complete({ system: "You are a bounded negotiation assistant. Return a JSON object with type propose_terms and agreement. Copy the supplied domain identifiers and economics exactly. You cannot sign an agreement.", user: input, maxOutputTokens: 1200 });
const action = parseModelAction(response.content);
if (action.type !== "propose_terms" || action.agreement.releaseId !== agreement.releaseId || action.agreement.recordingId !== agreement.recordingId || action.agreement.participants.some((participant) => agreement.participants.find((expected) => expected.ownerId === participant.ownerId)?.basisPoints !== participant.basisPoints) || action.agreement.recoupment?.capYocto !== agreement.recoupment.capYocto || action.agreement.recoupment.beneficiaryId !== agreement.recoupment.beneficiaryId) throw new Error(`Live model did not produce the required valid proposal (action=${action.type})`);
console.log(JSON.stringify({ status: "ok", model: response.model, action: action.type, inputDigest: createHash("sha256").update(input).digest("hex"), outputDigest: createHash("sha256").update(response.content).digest("hex"), responseId: response.responseId ?? null, usage: { inputTokens: response.inputTokens ?? null, outputTokens: response.outputTokens ?? null } }));
