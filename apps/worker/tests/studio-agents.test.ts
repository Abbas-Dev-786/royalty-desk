import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { acceptStudioSplit, addStudioAgent, addStudioAsset, addWorkVersion, createStudio, createStudioProject, createStudioWork, JobStore, openDatabase, StudioMediaStore } from "@studio/persistence";
import { createNearAiAgentModel, NearAiCompletionError, type AgentModel } from "../src/near-ai/model.ts";
import { createCreativeGraph } from "../src/studio/creative-graph.ts";
import { runCreativeModelStep } from "../src/studio/creative-model.ts";
import { StudioCreativeService } from "../src/studio/creative-service.ts";
import { DurableJobRunner } from "../src/jobs/runner.ts";
import { createWorkerHealthServer } from "../src/health-server.ts";
import type { WorkerConfig } from "../src/config.ts";
import type { AddressInfo } from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { KeyPair } from "near-api-js";
import { verifyStudioAgentKey } from "../src/studio/agent-key-proof.ts";
import { prepareAgentReviewedSong } from "../src/studio/release-preparation.ts";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "studio-agents-"));
  const database = openDatabase(join(root, "app.sqlite"));
  createStudio(database, "studio-a", "admin.testnet");
  createStudioProject(database, { id: "project-a", studioId: "studio-a", title: "First album" });
  addStudioAgent(database, { id: "lyricist", studioId: "studio-a", accountId: "lyricist.testnet", controllerAccountId: "admin.testnet", role: "lyricist", active: true });
  addStudioAgent(database, { id: "composer", studioId: "studio-a", accountId: "composer.testnet", controllerAccountId: "admin.testnet", role: "composer", active: true });
  return { database, checkpointPath: join(root, "graph.sqlite"), databasePath: join(root, "app.sqlite") };
}

test("AGT-08 an agent-reviewed recording is prepared from saved output and pre-authorized provider rights", () => {
  const env = setup();
  const media = new StudioMediaStore(join(env.checkpointPath, "..", "media"));
  const asset = media.put(new Uint8Array(4096).fill(4));
  const metadata = media.put(new TextEncoder().encode('{"title":"Morning"}'));
  const permissionPath = join(env.checkpointPath, "..", "permission.json");
  writeFileSync(permissionPath, JSON.stringify({ basis: "owner-confirmed-private-permission", reference: "owner-confirmation-2026-11-13", testnetOnly: true, studioAccountId: "studio.testnet", coveredUses: { musicLibrary: true, musicStreamingDistribution: true, publicPlayback: true, paidPurchases: true, tips: true, downloads: true } }));
  addStudioAgent(env.database, { id: "reviewer", studioId: "studio-a", accountId: "reviewer.testnet", controllerAccountId: "admin.testnet", role: "reviewer", active: true });
  createStudioWork(env.database, { id: "song-reviewed", studioId: "studio-a", projectId: "project-a", kind: "song" });
  addStudioAsset(env.database, { hash: asset.hash, provider: "elevenlabs", model: "music_v2_5", licenseRef: "owner-confirmation-2026-11-13", storageKey: "media", mimeType: "audio/mpeg", sizeBytes: asset.sizeBytes });
  addWorkVersion(env.database, { workId: "song-reviewed", studioId: "studio-a", version: 1, kind: "song", state: "review", title: "Morning", assetHash: asset.hash, metadataHash: metadata.hash, priceYocto: "10000000000000000000000", split: [{ agentId: "lyricist", basisPoints: 5000 }, { agentId: "composer", basisPoints: 5000 }] });
  const now = Date.now();
  env.database.prepare("INSERT INTO studio_external_operations(id,logical_key,operation_type,status,created_at_ms,updated_at_ms) VALUES ('review-op','review-op','near_ai_creative','finalized',?,?),('audio-op','audio-op','music_generation','finalized',?,?)").run(now, now, now, now);
  env.database.prepare("INSERT INTO studio_model_outputs(operation_id,project_id,agent_id,role,model,provider_mode,input_hash,output_hash,output_json,created_at_ms) VALUES ('review-op','project-a','reviewer','review','fixture','live',?,?,?,?)").run("a".repeat(64), "b".repeat(64), '{"content":"ACCEPT: ready"}', now);
  env.database.prepare("INSERT INTO studio_audio_generations(operation_id,project_id,agent_id,work_id,work_version,revision,input_hash,prompt_hash,asset_hash,provider,model,license_ref,duration_ms,created_at_ms) VALUES ('audio-op','project-a','composer','song-reviewed',1,0,?,?,?,'elevenlabs','music_v2_5',?,20000,?)").run("c".repeat(64), "d".repeat(64), asset.hash, "owner-confirmation-2026-11-13", now);
  prepareAgentReviewedSong(env.database, media, "studio.testnet", "song-reviewed", 1, "reviewer", permissionPath);
  prepareAgentReviewedSong(env.database, media, "studio.testnet", "song-reviewed", 1, "reviewer", permissionPath);
  assert.equal((env.database.prepare("SELECT state FROM studio_work_versions WHERE work_id = 'song-reviewed'").get() as { state: string }).state, "accepted");
  assert.equal((env.database.prepare("SELECT provider_permission_ref FROM studio_asset_rights WHERE asset_hash = ?").get(asset.hash) as { provider_permission_ref: string }).provider_permission_ref, "owner-confirmation-2026-11-13");
  assert.equal((env.database.prepare("SELECT COUNT(*) AS n FROM studio_media_reviews WHERE asset_hash = ?").get(asset.hash) as { n: number }).n, 1);
  env.database.close();
});

test("AGT-04 a completed reasoning-only response records its provider ID without retry", async () => {
  const env = setup();
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = async (_input, init) => {
    requests += 1;
    const body = JSON.parse(String(init?.body)) as { max_tokens: number; reasoning_effort?: string; thinking?: { type: string } };
    assert.equal(body.max_tokens, 4000);
    assert.equal(body.reasoning_effort, "low");
    assert.deepEqual(body.thinking, { type: "enabled" });
    return Response.json({ id: "chat-test-1", choices: [{ finish_reason: "length", message: { content: null, reasoning_content: "private reasoning" } }], usage: { completion_tokens: 4000 } });
  };
  try {
    const model = createNearAiAgentModel({ baseUrl: "https://example.test/v1", apiKey: "fixture-key", model: "z-ai/glm-5.3-flash" });
    const step = { projectId: "project-a", agentId: "lyricist", role: "lyrics" as const, revision: 0, brief: "An original song about morning", context: "Write original lyrics.", maxCalls: 6, maxOutputTokens: 4000 };
    await assert.rejects(runCreativeModelStep(env.database, model, step), (error: unknown) => error instanceof NearAiCompletionError && error.message === "ERR_NEAR_AI_OUTPUT_LIMIT" && error.responseId === "chat-test-1");
    const operation = env.database.prepare("SELECT status, provider_request_id FROM studio_external_operations").get() as { status: string; provider_request_id: string };
    assert.equal(operation.status, "failed");
    assert.equal(operation.provider_request_id, "chat-test-1");
    await assert.rejects(runCreativeModelStep(env.database, model, step), /ERR_CREATIVE_OUTCOME_UNKNOWN/);
    assert.equal(requests, 1);
  } finally { globalThis.fetch = originalFetch; env.database.close(); }
});

test("AGT-01 lyricist hands lyrics to composer before review and split negotiation", async () => {
  const setupResult = setup();
  let calls = 0;
  let composerSawLyrics = false;
  const model: AgentModel = { mode: "fixture", complete: async (request) => {
    calls += 1;
    const role = request.system.includes("split_proposal agent") ? "split_proposal" : request.system.includes("split_response agent") ? "split_response" : request.system.includes("lyrics agent") ? "lyrics" : request.system.includes("composition agent") ? "composition" : request.system.includes("revision agent") ? "revision" : "review";
    if (role === "composition") composerSawLyrics = request.user.includes("lyrics content");
    const content = role === "review" ? calls < 4 ? "REVISE: improve chorus" : "ACCEPT: ready" : role === "split_proposal" ? '{"lyricistBasisPoints":5000,"composerBasisPoints":5000}' : role === "split_response" ? '{"decision":"accept","lyricistBasisPoints":5000,"composerBasisPoints":5000}' : `${role} content`;
    return { model: "fixture/studio", content: JSON.stringify({ content }) };
  } };
  const created = createCreativeGraph({ database: setupResult.database, checkpointPath: setupResult.checkpointPath, model, lyricistId: "lyricist", composerId: "composer", reviewerId: "composer", maxCalls: 7, maxOutputTokens: 100, maxRevisions: 1 });
  const result = await created.graph.invoke({ projectId: "project-a", brief: "An original hopeful song" }, { configurable: { thread_id: "project-a:1" } });
  assert.equal(result.status, "awaiting_acceptance");
  assert.equal(result.revisionCount, 1);
  assert.equal(calls, 7);
  assert.equal(composerSawLyrics, true);
  assert.equal((setupResult.database.prepare("SELECT COUNT(DISTINCT agent_id) AS n FROM studio_model_outputs").get() as { n: number }).n, 2);
  const saved = await created.graph.getState({ configurable: { thread_id: "project-a:1" } });
  assert.equal(saved.values.status, "awaiting_acceptance");
  created.close();
  setupResult.database.close();
  const reopened = openDatabase(setupResult.databasePath);
  const resumed = createCreativeGraph({ database: reopened, checkpointPath: setupResult.checkpointPath, model, lyricistId: "lyricist", composerId: "composer", reviewerId: "composer", maxCalls: 7, maxOutputTokens: 100, maxRevisions: 1 });
  assert.equal((await resumed.graph.getState({ configurable: { thread_id: "project-a:1" } })).values.status, "awaiting_acceptance");
  assert.equal(calls, 7);
  resumed.close();
  reopened.close();
});

test("AGT-04 an aggregated graph failure records the underlying model error", async () => {
  const root = mkdtempSync(join(tmpdir(), "studio-aggregate-"));
  const path = join(root, "jobs.sqlite");
  const jobs = new JobStore(path);
  try {
    jobs.enqueue({ id: "aggregate-case", releaseId: "project-a", inputDigest: "a".repeat(64) });
    const result = await new DurableJobRunner(jobs).run("aggregate-case", async () => { throw new AggregateError([new Error("ERR_NEAR_AI_HTTP_402"), new Error("ERR_CREATIVE_OUTCOME_UNKNOWN")], "Multiple errors occurred during superstep 3"); });
    assert.equal(result?.state, "failed");
    const database = openDatabase(path);
    try { assert.equal((database.prepare("SELECT error_code FROM jobs WHERE id = 'aggregate-case'").get() as { error_code: string }).error_code, "ERR_NEAR_AI_HTTP_402"); }
    finally { database.close(); }
  } finally { jobs.close(); }
});

test("AGT-02 another agent cannot accept a participant's split or stale version", () => {
  const env = setup();
  createStudioWork(env.database, { id: "song-a", studioId: "studio-a", projectId: "project-a", kind: "song" });
  const work = { workId: "song-a", studioId: "studio-a", version: 1, kind: "song" as const, state: "accepted" as const, title: "Original", assetHash: "a".repeat(64), metadataHash: "b".repeat(64), priceYocto: "100", split: [{ agentId: "lyricist", basisPoints: 5000 }, { agentId: "composer", basisPoints: 5000 }] };
  addWorkVersion(env.database, work);
  assert.throws(() => acceptStudioSplit(env.database, work, "lyricist", "composer.testnet"));
  assert.throws(() => acceptStudioSplit(env.database, { ...work, split: [{ agentId: "lyricist", basisPoints: 6000 }, { agentId: "composer", basisPoints: 4000 }] }, "lyricist", "lyricist.testnet"));
  acceptStudioSplit(env.database, work, "lyricist", "lyricist.testnet");
  assert.equal((env.database.prepare("SELECT COUNT(*) AS n FROM studio_split_acceptances").get() as { n: number }).n, 1);
  env.database.close();
});

test("AGT-03 repeated rejection reaches unresolved state without invented acceptance", async () => {
  const env = setup();
  const model: AgentModel = { mode: "fixture", complete: async (request) => ({ model: "fixture/studio", content: JSON.stringify({ content: request.system.includes("review agent") ? "REVISE: still unresolved" : "original content" }) }) };
  const created = createCreativeGraph({ database: env.database, checkpointPath: env.checkpointPath, model, lyricistId: "lyricist", composerId: "composer", reviewerId: "composer", maxCalls: 5, maxOutputTokens: 100, maxRevisions: 1 });
  const result = await created.graph.invoke({ projectId: "project-a", brief: "Original song" }, { configurable: { thread_id: "project-a:dispute" } });
  assert.equal(result.status, "unresolved");
  assert.equal(result.revisionCount, 1);
  created.close();
  env.database.close();
});

test("AGT-03 a countered split remains unresolved", async () => {
  const env = setup();
  const model: AgentModel = { mode: "fixture", complete: async (request) => {
    const role = request.system.match(/You are the (\S+) agent/)?.[1];
    const content = role === "review" ? "ACCEPT: ready" : role === "split_proposal" ? '{"lyricistBasisPoints":5000,"composerBasisPoints":5000}' : role === "split_response" ? '{"decision":"counter","lyricistBasisPoints":6000,"composerBasisPoints":4000}' : "original content";
    return { model: "fixture/studio", content: JSON.stringify({ content }) };
  } };
  const created = createCreativeGraph({ database: env.database, checkpointPath: env.checkpointPath, model, lyricistId: "lyricist", composerId: "composer", reviewerId: "composer", maxCalls: 5, maxOutputTokens: 100, maxRevisions: 0 });
  const state = await created.graph.invoke({ projectId: "project-a", brief: "Original song" }, { configurable: { thread_id: "project-a:counter" } });
  assert.equal(state.status, "unresolved");
  assert.match(state.splitDecision, /counter/);
  created.close();
  env.database.close();
});

test("AGT-04 repeated logical creative step after restart reuses stored output", async () => {
  const env = setup();
  let calls = 0;
  const model: AgentModel = { mode: "fixture", complete: async () => { calls += 1; return { model: "fixture/studio", content: '{"content":"original verse"}' }; } };
  const input = { projectId: "project-a", agentId: "lyricist", role: "lyrics" as const, revision: 0, brief: "Original song", context: "Verse", maxCalls: 1, maxOutputTokens: 100 };
  assert.equal(await runCreativeModelStep(env.database, model, input), "original verse");
  env.database.close();
  const reopened = openDatabase(env.databasePath);
  assert.equal(await runCreativeModelStep(reopened, model, input), "original verse");
  await assert.rejects(() => runCreativeModelStep(reopened, model, { ...input, context: "Changed verse" }), /INPUT_CHANGED/);
  assert.equal(await runCreativeModelStep(reopened, model, { ...input, brief: "Different song" }), "original verse");
  assert.equal(await runCreativeModelStep(reopened, model, { ...input, brief: "Different song" }), "original verse");
  assert.equal(calls, 2);
  reopened.close();
});

test("AGT-06 inactive agent, unknown result and exhausted budget stop execution", async () => {
  const env = setup();
  let calls = 0;
  const model: AgentModel = { mode: "fixture", complete: async () => { calls += 1; return { model: "fixture/studio", content: '{"content":"verse"}' }; } };
  const input = { projectId: "project-a", agentId: "lyricist", role: "lyrics" as const, revision: 0, brief: "Original song", context: "Verse", maxCalls: 1, maxOutputTokens: 100 };
  await runCreativeModelStep(env.database, model, input);
  await assert.rejects(() => runCreativeModelStep(env.database, model, { ...input, role: "composition" }), /BUDGET/);
  env.database.prepare("UPDATE studio_agents SET allowed_tools_json = '[\"composition\"]' WHERE id = 'lyricist'").run();
  await assert.rejects(() => runCreativeModelStep(env.database, model, input), /FORBIDDEN/);
  env.database.prepare("UPDATE studio_agents SET revoked_at_ms = 1 WHERE id = 'lyricist'").run();
  await assert.rejects(() => runCreativeModelStep(env.database, model, input), /REVOKED/);
  env.database.prepare("UPDATE studio_agents SET active = 0 WHERE id = 'lyricist'").run();
  await assert.rejects(() => runCreativeModelStep(env.database, model, input), /SCOPE/);
  assert.equal(calls, 1);
  env.database.close();
});

test("AGT-06 unknown inference reserves budget and expired identity cannot call", async () => {
  const env = setup();
  let calls = 0;
  const model: AgentModel = { mode: "fixture", complete: async () => { calls += 1; throw new Error("simulated gateway timeout"); } };
  const input = { projectId: "project-a", agentId: "lyricist", role: "lyrics" as const, revision: 0, brief: "Original song", context: "Verse", maxCalls: 1, maxOutputTokens: 100 };
  await assert.rejects(() => runCreativeModelStep(env.database, model, input), /timeout/);
  await assert.rejects(() => runCreativeModelStep(env.database, model, input), /OUTCOME_UNKNOWN/);
  await assert.rejects(() => runCreativeModelStep(env.database, model, { ...input, role: "revision" }), /BUDGET/);
  assert.equal(calls, 1);
  env.database.prepare("UPDATE studio_agents SET expires_at_ms = 1 WHERE id = 'lyricist'").run();
  await assert.rejects(() => runCreativeModelStep(env.database, model, input), /REVOKED/);
  env.database.close();
});

test("AGT-04 durable studio service returns one result after process restart", async () => {
  const env = setup();
  env.database.close();
  let calls = 0;
  const model: AgentModel = { mode: "fixture", complete: async (request) => {
    calls += 1;
    const role = request.system.match(/You are the (\S+) agent/)?.[1];
    const content = role === "review" ? "ACCEPT: ready" : role === "split_proposal" ? '{"lyricistBasisPoints":5000,"composerBasisPoints":5000,"rationale":"equal contribution"}' : role === "split_response" ? "Decision: ACCEPT | lyricistBasisPoints: 5000 | composerBasisPoints: 5000 | total: 10000. Agreed." : "original content";
    return { model: "fixture/studio", content: JSON.stringify({ content }) };
  } };
  const request = { projectId: "project-a", brief: "Original studio song", lyricistId: "lyricist", composerId: "composer", reviewerId: "composer", maxCalls: 5, maxOutputTokens: 100, maxRevisions: 0, deadlineAtMs: Date.now() + 60_000 };
  const first = new StudioCreativeService(env.databasePath, env.checkpointPath, model);
  const id = first.create(request);
  assert.equal((await first.run(id, request)).status, "awaiting_human");
  assert.equal(calls, 5);
  first.close();
  const second = new StudioCreativeService(env.databasePath, env.checkpointPath, model);
  assert.equal((await second.run(id, request)).status, "awaiting_human");
  assert.equal(calls, 5);
  second.close();
});

test("AGT-04 a completed paid session can be recovered after its deadline without another model call", async () => {
  const env = setup();
  env.database.close();
  let calls = 0;
  const model: AgentModel = { mode: "fixture", complete: async (request) => {
    calls += 1;
    const role = request.system.match(/You are the (\S+) agent/)?.[1];
    const content = role === "review" ? "ACCEPT: ready" : role === "split_proposal" ? '{"lyricistBasisPoints":5000,"composerBasisPoints":5000}' : role === "split_response" ? "Decision: ACCEPT | lyricistBasisPoints: 5000 | composerBasisPoints: 5000 | total: 10000. Agreed." : "original content";
    return { model: "fixture/studio", content: JSON.stringify({ content }) };
  } };
  const request = { projectId: "project-a", brief: "Original studio song", lyricistId: "lyricist", composerId: "composer", reviewerId: "composer", maxCalls: 5, maxOutputTokens: 100, maxRevisions: 0, deadlineAtMs: Date.now() + 200 };
  const service = new StudioCreativeService(env.databasePath, env.checkpointPath, model);
  try {
    const sessionId = service.create(request);
    assert.equal((await service.run(sessionId, request)).status, "awaiting_human");
    const count = calls;
    await new Promise((resolve) => setTimeout(resolve, 250));
    assert.equal(service.create(request), sessionId);
    assert.equal((await service.run(sessionId, request)).status, "awaiting_human");
    assert.equal(calls, count);
  } finally { service.close(); }
});

test("AGT-06 expired deadline is rejected before a model call", async () => {
  const env = setup();
  let calls = 0;
  const model: AgentModel = { mode: "fixture", complete: async () => { calls += 1; return { model: "fixture/studio", content: '{"content":"verse"}' }; } };
  await assert.rejects(() => runCreativeModelStep(env.database, model, { projectId: "project-a", agentId: "lyricist", role: "lyrics", revision: 0, brief: "Original song", context: "Verse", maxCalls: 1, maxOutputTokens: 100, deadlineAtMs: 1 }), /DEADLINE/);
  assert.equal(calls, 0);
  env.database.close();
});

test("AGT-06 studio worker route requires token and accepts a bounded session", async () => {
  const env = setup();
  env.database.close();
  const model: AgentModel = { mode: "fixture", complete: async () => ({ model: "fixture/studio", content: '{"content":"original"}' }) };
  const service = new StudioCreativeService(env.databasePath, env.checkpointPath, model);
  const config: WorkerConfig = { host: "127.0.0.1", port: 0, networkId: "testnet", databasePath: env.databasePath, studioDatabasePath: env.databasePath, workerApiToken: "a".repeat(32), nearAiBaseUrl: "https://cloud-api.near.ai/v1", nearAiApiKey: null, nearAiModel: null };
  const server = createWorkerHealthServer(config, service);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address() as AddressInfo;
    const url = `http://127.0.0.1:${address.port}/studio/sessions`;
    const request = { projectId: "project-a", brief: "Original song", lyricistId: "lyricist", composerId: "composer", reviewerId: "composer", maxCalls: 5, maxOutputTokens: 100, maxRevisions: 0, deadlineAtMs: Date.now() + 60_000 };
    assert.equal((await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(request) })).status, 401);
    const created = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${config.workerApiToken}` }, body: JSON.stringify(request) });
    assert.equal(created.status, 201);
    const body = await created.json() as { sessionId: string };
    assert.match(body.sessionId, /^[a-f0-9]{64}$/);
    const invalid = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${config.workerApiToken}` }, body: JSON.stringify({ ...request, maxCalls: 0 }) });
    assert.equal(invalid.status, 400);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    service.close();
  }
});

test("AGT-01 creative session requires separate active NEAR accounts", () => {
  const env = setup();
  const request = { projectId: "project-a", brief: "Original studio song", lyricistId: "lyricist", composerId: "composer", reviewerId: "composer", maxCalls: 5, maxOutputTokens: 100, maxRevisions: 0, deadlineAtMs: Date.now() + 60_000 };
  assert.throws(() => env.database.prepare("UPDATE studio_agents SET account_id = 'lyricist.testnet' WHERE id = 'composer'").run(), /UNIQUE constraint/);
  env.database.close();
  const model: AgentModel = { mode: "fixture", complete: async () => ({ model: "fixture/studio", content: '{"content":"original"}' }) };
  const service = new StudioCreativeService(env.databasePath, env.checkpointPath, model);
  try {
    assert.match(service.create(request), /^[a-f0-9]{64}$/);
  } finally {
    service.close();
  }
});

test("AGT-01 agent key proof checks local control and finalized on-chain scope", async () => {
  const env = setup();
  const key = KeyPair.fromRandom("ed25519");
  const publicKey = key.getPublicKey().toString();
  const keyFilePath = join(mkdtempSync(join(tmpdir(), "studio-key-")), "agent.json");
  writeFileSync(keyFilePath, JSON.stringify({ account_id: "lyricist.testnet", public_key: publicKey, private_key: key.toString() }));
  env.database.prepare("UPDATE studio_agents SET key_reference = ? WHERE id = 'lyricist'").run(publicKey);
  const input = { agentId: "lyricist", keyFilePath, contractId: "studio.testnet", allowedMethods: ["accept_split"] };
  const provider = { viewAccessKey: async () => ({ block_height: 123, permission: { FunctionCall: { receiver_id: "studio.testnet", method_names: ["accept_split"], allowance: "1000" } } }) };
  try {
    const proof = await verifyStudioAgentKey(env.database, provider, input);
    assert.equal(proof.publicKey, publicKey);
    assert.equal(proof.accountId, "lyricist.testnet");
    assert.equal(proof.blockHeight, 123);
    await assert.rejects(() => verifyStudioAgentKey(env.database, { viewAccessKey: async () => ({ block_height: 123, permission: "FullAccess" as const }) }, input), /PERMISSION/);
    await assert.rejects(() => verifyStudioAgentKey(env.database, { viewAccessKey: async () => ({ block_height: 123, permission: { FunctionCall: { receiver_id: "other.testnet", method_names: ["accept_split"] } } }) }, input), /PERMISSION/);
    await assert.rejects(() => verifyStudioAgentKey(env.database, { viewAccessKey: async () => ({ block_height: 123, permission: { FunctionCall: { receiver_id: "studio.testnet", method_names: [] } } }) }, input), /METHODS/);
    writeFileSync(keyFilePath, JSON.stringify({ account_id: "other.testnet", public_key: publicKey, private_key: key.toString() }));
    await assert.rejects(() => verifyStudioAgentKey(env.database, provider, input), /ACCOUNT_MISMATCH/);
    writeFileSync(keyFilePath, JSON.stringify({ account_id: "lyricist.testnet", public_key: publicKey, private_key: key.toString() }));
    env.database.prepare("UPDATE studio_agents SET key_reference = 'ed25519:wrong' WHERE id = 'lyricist'").run();
    await assert.rejects(() => verifyStudioAgentKey(env.database, provider, input), /MISMATCH/);
  } finally {
    env.database.close();
  }
});

test("AGT-04 killed in-flight inference is not charged twice after process restart", async () => {
  const env = setup();
  env.database.close();
  const fixture = new URL("./fixtures/creative-inflight.ts", import.meta.url);
  const child = spawn(process.execPath, ["--experimental-strip-types", fileURLToPath(fixture), env.databasePath], { cwd: process.cwd(), stdio: ["ignore", "pipe", "pipe"] });
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for in-flight model")), 10_000);
      child.stdout.on("data", (chunk: Buffer) => {
        if (chunk.toString().includes("MODEL_STARTED")) { clearTimeout(timer); resolve(); }
      });
      child.once("exit", (code) => { clearTimeout(timer); reject(new Error(`Child exited early: ${code}`)); });
    });
  } finally {
    if (child.exitCode === null) {
      child.kill();
      await new Promise<void>((resolve) => child.once("exit", () => resolve()));
    }
  }
  const reopened = openDatabase(env.databasePath);
  try {
    const row = reopened.prepare("SELECT status FROM studio_external_operations WHERE logical_key LIKE 'creative:project-a:%:lyricist:lyrics:0'").get() as { status: string };
    assert.equal(row.status, "requested");
    let repeatedCalls = 0;
    const model: AgentModel = { mode: "fixture", complete: async () => { repeatedCalls += 1; return { model: "fixture/studio", content: '{"content":"duplicate"}' }; } };
    await assert.rejects(() => runCreativeModelStep(reopened, model, { projectId: "project-a", agentId: "lyricist", role: "lyrics", revision: 0, brief: "Original song", context: "Verse", maxCalls: 1, maxOutputTokens: 100 }), /OUTCOME_UNKNOWN/);
    assert.equal(repeatedCalls, 0);
  } finally {
    reopened.close();
  }
});

test("AGT-04 failed graph replay reuses finalized responses without a second model charge", async () => {
  const env = setup();
  env.database.close();
  let calls = 0;
  const model: AgentModel = { mode: "fixture", complete: async (request) => {
    calls += 1;
    const role = request.system.match(/You are the (\S+) agent/)?.[1];
    const content = role === "review" ? "ACCEPT: ready" : role === "split_proposal" ? '{"lyricistBasisPoints":5000,"composerBasisPoints":4000}' : "original content";
    return { model: "fixture/studio", content: JSON.stringify({ content }) };
  } };
  const request = { projectId: "project-a", brief: "Original studio song", lyricistId: "lyricist", composerId: "composer", reviewerId: "composer", maxCalls: 5, maxOutputTokens: 100, maxRevisions: 0, deadlineAtMs: Date.now() + 60_000 };
  const service = new StudioCreativeService(env.databasePath, env.checkpointPath, model);
  try {
    const id = service.create(request);
    await assert.rejects(() => service.run(id, request), /SPLIT_TOTAL/);
    assert.equal(calls, 4);
    await assert.rejects(() => service.run(id, request), /SPLIT_TOTAL/);
    assert.equal(calls, 4);
    const proof = openDatabase(env.databasePath);
    try {
      assert.equal((proof.prepare("SELECT attempts FROM jobs WHERE id = ?").get(id) as { attempts: number }).attempts, 2);
    } finally { proof.close(); }
  } finally { service.close(); }
});
