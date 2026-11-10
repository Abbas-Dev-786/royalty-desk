import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

const sessionId = "54ad3300-2b22-4640-8972-7186ce3d7258";
const transactionHash = "EeAu3ayr38KhStTsdHv71xuEGAR8zBRCo1fz92BcKZ64";
const journalPath = resolve("plans/evidence/artifacts/live-testnet-journey.json");
const journal = JSON.parse(readFileSync(journalPath, "utf8"));
assert.equal(journal.status, "prepared");
assert.equal(journal.agentApprovalTx, undefined);
const db = new DatabaseSync(resolve("plans/evidence/artifacts/live-agent.sqlite"));
try {
  const job = db.prepare("SELECT state, result_json FROM jobs WHERE id = ?").get(sessionId);
  assert.equal(job?.state, "running");
  assert.equal(job.result_json, null);
  const proposal = db.prepare("SELECT id, action_json FROM agent_proposals WHERE session_id = ?").get(sessionId);
  assert(proposal);
  const action = JSON.parse(proposal.action_json);
  assert.equal(action.type, "recommend_approval");
  assert.equal(action.settlementDigest, journal.settlementDigest);
  const operation = db.prepare("SELECT id, status, transaction_hash, operation_type FROM chain_operations WHERE transaction_hash = ?").get(transactionHash);
  assert.equal(operation?.status, "success");
  assert.equal(operation.operation_type, "approve_settlement");
  const result = {
    sessionId,
    status: "reviewing",
    action,
    proposalId: proposal.id,
    model: process.env.NEAR_AI_MODEL ?? "live",
    mode: "live",
    chainOperation: { operationId: operation.id, transactionHash, status: "success" }
  };
  db.prepare("UPDATE jobs SET state = 'succeeded', result_json = ?, updated_at_ms = ? WHERE id = ? AND state = 'running' AND result_json IS NULL").run(JSON.stringify(result), Date.now(), sessionId);
  const agentRun = {
    sessionId, model: result.model, status: result.status, actionType: action.type, reason: null,
    proposalId: proposal.id, chainOperation: result.chainOperation
  };
  journal.agentRuns = [...(journal.agentRuns ?? []), agentRun];
  journal.agentRun = agentRun;
  journal.agentApprovalTx = transactionHash;
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  console.log(JSON.stringify({ recovered: true, sessionId, transactionHash }));
} finally {
  db.close();
}
