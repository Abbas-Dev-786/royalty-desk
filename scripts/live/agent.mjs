import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { JsonRpcProvider } from "near-api-js";
import { importStatementCsv, parseAgreementRules, sha256Hex } from "@royaltydesk/domain";
import { openDatabase } from "@royaltydesk/persistence";
import { WorkerAgentService } from "../../apps/worker/src/agents/service.ts";

const journalPath = resolve("plans/evidence/artifacts/live-testnet-journey.json");
const journal = JSON.parse(readFileSync(journalPath, "utf8"));
if (journal.status !== "prepared" || journal.agentApprovalTx || journal.pendingStep) throw new Error("Live journey is not ready for a new agent run");
const [owner1, owner2, owner3] = journal.owners;
const csv = [
  "statement_id,line_id,period,recording_id,platform,row_type,amount,currency,deduction_code,evidence_ref",
  `statement-live-261110,line-1,${journal.period},${journal.recordingId},synthetic,revenue,0.1,NEAR,,`
].join("\n");
const statement = importStatementCsv(csv, "advance-live");
assert.equal(statement.normalizedHash, journal.statement.normalizedHash);
const rules = parseAgreementRules({
  schemaVersion: "1", releaseId: journal.releaseId, recordingId: journal.recordingId, effectivePeriod: journal.period,
  participants: [
    { ownerId: owner1, basisPoints: "6000" },
    { ownerId: owner2, basisPoints: "2500" },
    { ownerId: owner3, basisPoints: "1500" }
  ],
  recoupment: { code: "advance-live", beneficiaryId: owner1, capYocto: "20000000000000000000000" }
});
const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" });
const [chainRelease, chainSettlement] = await Promise.all([
  provider.callFunction({ contractId: journal.contractId, method: "get_release", args: { release_id: journal.releaseId }, finality: "final" }),
  provider.callFunction({ contractId: journal.contractId, method: "get_settlement", args: { release_id: journal.releaseId, period: journal.period }, finality: "final" })
]);
assert(chainRelease && chainSettlement && chainSettlement.status === "Review");
const mandate = chainRelease.mandates.find((entry) => entry.owner_id === owner2 && entry.agent_id === journal.agentId && !entry.revoked);
assert(mandate && mandate.actions.includes("approve_settlement"));
const digest = sha256Hex([
  chainSettlement.period, chainSettlement.revision, chainSettlement.agreement_version, chainSettlement.normalized_statement_hash,
  chainSettlement.gross_yocto, chainSettlement.deduction_evidence_hash, chainSettlement.allocation_preview_hash
].join("|"));
assert.equal(digest, journal.settlementDigest);
const context = {
  releaseId: journal.releaseId,
  ownerAccountId: owner2,
  agentAccountId: journal.agentId,
  privatePreferences: `For this synthetic statement, recommend approval only if the supplied statement is payable, validationFindings is empty, and the on-chain settlement matches. Use exactly this JSON shape when recommending approval: {"type":"recommend_approval","settlementDigest":"${digest}","rationale":"Clean synthetic statement matches the approved agreement and settlement."}. Otherwise return {"type":"needs_human","rationale":"Evidence needs human review."}.`,
  agreement: rules,
  settlement: {
    releaseId: journal.releaseId, period: chainSettlement.period, agreementVersion: String(chainSettlement.agreement_version),
    revision: String(chainSettlement.revision), normalizedStatementHash: chainSettlement.normalized_statement_hash,
    grossYocto: chainSettlement.gross_yocto, deductionEvidenceHash: chainSettlement.deduction_evidence_hash,
    allocationPreviewHash: chainSettlement.allocation_preview_hash
  },
  settlementDigest: digest,
  statementRows: statement.rows,
  validationFindings: [],
  allowedActions: ["approve_settlement"],
  mandateEpoch: String(mandate.epoch),
  mandateExpiresAtNanoseconds: String(mandate.expires_at_nanoseconds),
  mandateMaxGrossYocto: mandate.max_gross_yocto
};
const databasePath = resolve("plans/evidence/artifacts/live-agent.sqlite");
const config = {
  host: "127.0.0.1", port: 3101, networkId: "testnet", contractId: journal.contractId, databasePath,
  storageSecret: null, workerApiToken: process.env.ROYALTYDESK_WORKER_TOKEN ?? null,
  nearAiBaseUrl: process.env.NEAR_AI_BASE_URL ?? "https://cloud-api.near.ai/v1",
  nearAiApiKey: process.env.NEAR_AI_API_KEY ?? null, nearAiModel: process.env.NEAR_AI_MODEL ?? null,
  agentKeystorePath: join(homedir(), ".royaltydesk", "agent-keys")
};
if (!config.nearAiApiKey || !config.nearAiModel) throw new Error("Live NEAR AI credentials are missing");
const service = new WorkerAgentService(openDatabase(databasePath), config);
try {
  const { sessionId } = service.createSession({ releaseId: journal.releaseId, ownerAccountId: owner2, mode: "live", context, maxRounds: 1, maxCalls: 1, maxOutputTokens: 3000 });
  const result = await service.run(sessionId, context, "live");
  const agentRun = {
    sessionId, model: result.model, status: result.status, actionType: result.action?.type ?? null,
    reason: result.reason ?? null, proposalId: result.proposalId ?? null,
    chainOperation: result.chainOperation ?? null
  };
  journal.agentRuns = [...(journal.agentRuns ?? (journal.agentRun ? [journal.agentRun] : [])), agentRun];
  journal.agentRun = agentRun;
  if (result.action?.type === "recommend_approval" && result.chainOperation?.status === "success" && result.chainOperation.transactionHash) {
    journal.agentApprovalTx = result.chainOperation.transactionHash;
  }
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
  console.log(JSON.stringify({ model: result.model, status: result.status, action: result.action?.type ?? null, chainOperation: result.chainOperation ?? null }));
  if (!journal.agentApprovalTx) process.exitCode = 1;
} finally {
  service.close();
}
