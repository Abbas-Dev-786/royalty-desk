import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { acceptStudioSplit, addStudioAgent, addWorkVersion, createStudio, createStudioProject, createStudioWork, openDatabase } from "@royaltydesk/persistence";
import type { AgentModel } from "../src/agents/types.ts";
import { createCreativeGraph } from "../src/studio/creative-graph.ts";
import { runCreativeModelStep } from "../src/studio/creative-model.ts";
import { StudioCreativeService } from "../src/studio/creative-service.ts";
import { createWorkerHealthServer } from "../src/health-server.ts";
import type { WorkerConfig } from "../src/config.ts";
import type { AddressInfo } from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { KeyPair } from "near-api-js";
import { verifyStudioAgentKey } from "../src/studio/agent-key-proof.ts";

function setup() {
  const root = mkdtempSync(join(tmpdir(), "studio-agents-"));
  const database = openDatabase(join(root, "app.sqlite"));
  createStudio(database, "studio-a", "admin.testnet");
  createStudioProject(database, { id: "project-a", studioId: "studio-a", title: "First album" });
  addStudioAgent(database, { id: "lyricist", studioId: "studio-a", accountId: "lyricist.testnet", controllerAccountId: "admin.testnet", role: "lyricist", active: true });
  addStudioAgent(database, { id: "composer", studioId: "studio-a", accountId: "composer.testnet", controllerAccountId: "admin.testnet", role: "composer", active: true });
  return { database, checkpointPath: join(root, "graph.sqlite"), databasePath: join(root, "app.sqlite") };
}

test("AGT-01 two agents create parallel deliverables and review a revision", async () => {
  const setupResult = setup();
  let calls = 0;
  const model: AgentModel = { mode: "fixture", complete: async (request) => {
    calls += 1;
    const role = request.system.includes("split_proposal agent") ? "split_proposal" : request.system.includes("split_response agent") ? "split_response" : request.system.includes("lyrics agent") ? "lyrics" : request.system.includes("composition agent") ? "composition" : request.system.includes("revision agent") ? "revision" : "review";
    const content = role === "review" ? calls < 4 ? "REVISE: improve chorus" : "ACCEPT: ready" : role === "split_proposal" ? '{"lyricistBasisPoints":5000,"composerBasisPoints":5000}' : role === "split_response" ? '{"decision":"accept","lyricistBasisPoints":5000,"composerBasisPoints":5000}' : `${role} content`;
    return { model: "fixture/studio", content: JSON.stringify({ content }) };
  } };
  const created = createCreativeGraph({ database: setupResult.database, checkpointPath: setupResult.checkpointPath, model, lyricistId: "lyricist", composerId: "composer", reviewerId: "composer", maxCalls: 7, maxOutputTokens: 100, maxRevisions: 1 });
  const result = await created.graph.invoke({ projectId: "project-a", brief: "An original hopeful song" }, { configurable: { thread_id: "project-a:1" } });
  assert.equal(result.status, "awaiting_acceptance");
  assert.equal(result.revisionCount, 1);
  assert.equal(calls, 7);
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
  await assert.rejects(() => runCreativeModelStep(reopened, model, { ...input, brief: "Different song" }), /INPUT_CHANGED/);
  assert.equal(calls, 1);
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
  const config: WorkerConfig = { host: "127.0.0.1", port: 0, networkId: "testnet", contractId: "legacy.testnet", databasePath: env.databasePath, storageSecret: null, workerApiToken: "a".repeat(32), nearAiBaseUrl: "https://cloud-api.near.ai/v1", nearAiApiKey: null, nearAiModel: null, agentKeystorePath: null };
  const server = createWorkerHealthServer(config, undefined, service);
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
    const row = reopened.prepare("SELECT status FROM studio_external_operations WHERE logical_key = 'creative:project-a:lyricist:lyrics:0'").get() as { status: string };
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
