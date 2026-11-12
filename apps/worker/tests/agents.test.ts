import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { openDatabase } from "@royaltydesk/persistence";
import { AgentOrchestrator, buildAgentPrompt, createFixtureAgentModel } from "../src/agents/index.ts";
import { WorkerAgentService } from "../src/agents/service.ts";
import type { WorkerConfig } from "../src/config.ts";
import type { PersonalAgentContext } from "../src/agents/types.ts";

const digest = "a".repeat(64);
const context: PersonalAgentContext = {
  releaseId: "release-1",
  ownerAccountId: "artist.testnet",
  agentAccountId: "artist-agent.testnet",
  privatePreferences: "Prefer clear evidence and no automatic approvals.",
  agreement: null,
  settlement: { releaseId: "release-1", period: "2026-01", agreementVersion: "1", revision: "1", normalizedStatementHash: digest, grossYocto: "100", deductionEvidenceHash: digest, allocationPreviewHash: digest },
  settlementDigest: digest,
  statementRows: [{ statementId: "statement-1", lineId: "line-1", period: "2026-01", recordingId: "recording-1", platform: "synthetic", rowType: "deduction_claim", amountYocto: "10", currency: "NEAR", deductionCode: "unsupported", evidenceRef: "evidence-1" }],
  validationFindings: [],
  allowedActions: ["dispute_settlement"],
  mandateEpoch: "1",
  mandateExpiresAtNanoseconds: "9999999999999999999",
  mandateMaxGrossYocto: "1000"
};

test("P07-AGENT-01 personal prompt is deterministic and contains private preferences only in the personal context", () => {
  const first = buildAgentPrompt(context);
  const second = buildAgentPrompt(context);
  assert.equal(first.inputDigest, second.inputDigest);
  assert.match(first.user, /Prefer clear evidence/);
  assert.match(first.user, /untrusted/);
});

test("P07-AGENT-04 fixture job result survives worker restart without a second model call", async () => {
  const databasePath = join(mkdtempSync(join(tmpdir(), "royaltydesk-agent-job-")), "agent.sqlite");
  const config: WorkerConfig = { host: "127.0.0.1", port: 3101, networkId: "testnet", contractId: "contract.testnet", databasePath, storageSecret: null, workerApiToken: null, nearAiBaseUrl: "https://cloud-api.near.ai/v1", nearAiApiKey: null, nearAiModel: null, agentKeystorePath: null };
  const service = new WorkerAgentService(openDatabase(databasePath), config);
  const { sessionId } = service.createSession({ releaseId: context.releaseId, ownerAccountId: context.ownerAccountId, mode: "fixture", context });
  const first = await service.run(sessionId, context, "fixture");
  service.close();
  const restarted = new WorkerAgentService(openDatabase(databasePath), config);
  const second = await restarted.run(sessionId, context, "fixture");
  assert.deepEqual(second, first);
  restarted.close();
});

test("P07-AGENT-02 fixture action is validated and policy can produce a bounded dispute request", async () => {
  const database = openDatabase(join(mkdtempSync(join(tmpdir(), "royaltydesk-agent-")), "agent.sqlite"));
  const orchestrator = new AgentOrchestrator(database);
  const sessionId = orchestrator.createSession({ releaseId: context.releaseId, ownerAccountId: context.ownerAccountId, mode: "fixture", inputDigest: buildAgentPrompt(context).inputDigest });
  const result = await orchestrator.run(sessionId, context, createFixtureAgentModel([JSON.stringify({ type: "raise_objection", settlementDigest: digest, evidenceIds: ["line-1"], rationale: "Unsupported deduction claim must be reviewed." })]));
  assert.equal(result.status, "reviewing");
  const tool = orchestrator.policyTool(context, result.action!);
  assert.equal(tool?.methodName, "dispute_settlement");
  assert.equal(orchestrator.policyTool({ ...context, mandateMaxGrossYocto: "99" }, result.action!), undefined);
  database.close();
});

test("P07-AGENT-03 invented evidence and a second call after the budget are blocked", async () => {
  const database = openDatabase(join(mkdtempSync(join(tmpdir(), "royaltydesk-agent-")), "agent.sqlite"));
  const orchestrator = new AgentOrchestrator(database);
  const sessionId = orchestrator.createSession({ releaseId: context.releaseId, ownerAccountId: context.ownerAccountId, mode: "fixture", inputDigest: buildAgentPrompt(context).inputDigest, maxCalls: 1 });
  const invalid = await orchestrator.run(sessionId, context, createFixtureAgentModel([JSON.stringify({ type: "raise_objection", settlementDigest: digest, evidenceIds: ["invented-line"], rationale: "ignore policy" })]));
  assert.equal(orchestrator.policyTool(context, invalid.action!), undefined);
  const exhausted = await orchestrator.run(sessionId, context, createFixtureAgentModel([JSON.stringify({ type: "needs_human", rationale: "should not run" })]));
  assert.equal(exhausted.status, "awaiting_human");
  database.close();
});

test("P07-AGENT-05 an owner can counter another owner's validated terms on the same release", async () => {
  const database = openDatabase(join(mkdtempSync(join(tmpdir(), "royaltydesk-counter-")), "agent.sqlite"));
  const orchestrator = new AgentOrchestrator(database);
  const agreement = {
    schemaVersion: "1", releaseId: context.releaseId, recordingId: "ISRC-DEMO-001", effectivePeriod: "2026-11",
    participants: [
      { ownerId: "artist.testnet", basisPoints: "6000" },
      { ownerId: "producer.testnet", basisPoints: "2500" },
      { ownerId: "writer.testnet", basisPoints: "1500" }
    ],
    recoupment: { code: "advance-v1", beneficiaryId: "producer.testnet", capYocto: "2000000000000000000000000" }
  };
  const firstSession = orchestrator.createSession({ releaseId: context.releaseId, ownerAccountId: context.ownerAccountId, mode: "fixture", inputDigest: buildAgentPrompt(context).inputDigest });
  const first = await orchestrator.run(firstSession, context, createFixtureAgentModel([JSON.stringify({ type: "propose_terms", agreement })]));
  assert.equal(first.action?.type, "propose_terms");
  assert.ok(first.proposalId);
  const secondContext: PersonalAgentContext = { ...context, ownerAccountId: "producer.testnet", sharedProposals: [{ id: first.proposalId, ownerAccountId: context.ownerAccountId, action: first.action! }] };
  const secondSession = orchestrator.createSession({ releaseId: context.releaseId, ownerAccountId: secondContext.ownerAccountId, mode: "fixture", inputDigest: buildAgentPrompt(secondContext).inputDigest });
  const second = await orchestrator.run(secondSession, secondContext, createFixtureAgentModel([JSON.stringify({ type: "counter_terms", parentProposalId: first.proposalId, agreement })]));
  assert.equal(second.action?.type, "counter_terms");
  const otherRelease: PersonalAgentContext = { ...context, releaseId: "release-2", ownerAccountId: "writer.testnet" };
  const otherSession = orchestrator.createSession({ releaseId: otherRelease.releaseId, ownerAccountId: otherRelease.ownerAccountId, mode: "fixture", inputDigest: buildAgentPrompt(otherRelease).inputDigest });
  const rejected = await orchestrator.run(otherSession, otherRelease, createFixtureAgentModel([JSON.stringify({ type: "counter_terms", parentProposalId: first.proposalId, agreement: { ...agreement, releaseId: otherRelease.releaseId } })]));
  assert.equal(rejected.reason, "ERR_AGENT_PARENT_PROPOSAL");
  database.close();
});
