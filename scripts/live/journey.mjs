import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { JsonRpcProvider } from "near-api-js";
import { allocateEntitlements, canonicalJson, createAgreementCommitment, importStatementCsv, parseAgreementRules, renderAgreementMarkdown, sha256Hex } from "@royaltydesk/domain";
import { sendContractCall } from "./cli.mjs";

const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID;
if (contractId !== "sickhat6192.testnet" || process.env.NEXT_PUBLIC_NEAR_NETWORK !== "testnet") throw new Error("Unexpected live testnet contract configuration");
const releaseId = "live-261110-01";
const recordingId = "recording-live-261110";
const period = "2026-11";
const owners = ["rd1-261110.sickhat6192.testnet", "rd2-261110.sickhat6192.testnet", "rd3-261110.sickhat6192.testnet"];
const agentId = "rdagent-261110.sickhat6192.testnet";
const agentPublicKey = "ed25519:FrguQGMteswgLqMKLuDgusM2sNQL61kFWvR5VMNbhp9r";
const grossYocto = "100000000000000000000000";
const recoupmentCapYocto = "20000000000000000000000";
const journalPath = resolve("plans/evidence/artifacts/live-testnet-journey.json");
const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" });

const rules = parseAgreementRules({
  schemaVersion: "1", releaseId, recordingId, effectivePeriod: period,
  participants: [
    { ownerId: owners[0], basisPoints: "6000" },
    { ownerId: owners[1], basisPoints: "2500" },
    { ownerId: owners[2], basisPoints: "1500" }
  ],
  recoupment: { code: "advance-live", beneficiaryId: owners[0], capYocto: recoupmentCapYocto }
});
const csv = [
  "statement_id,line_id,period,recording_id,platform,row_type,amount,currency,deduction_code,evidence_ref",
  `statement-live-261110,line-1,${period},${recordingId},synthetic,revenue,0.1,NEAR,,`
].join("\n");
const statement = importStatementCsv(csv, "advance-live");
assert(statement.payable && statement.grossYocto === grossYocto);
const rendered = renderAgreementMarkdown(rules);
const agreementCommitment = createAgreementCommitment(rules, rendered.bytes, { networkId: "testnet", contractId, releaseId, agreementVersion: "1" });
const allocation = allocateEntitlements({ grossYocto: BigInt(grossYocto), remainingRecoupmentYocto: BigInt(recoupmentCapYocto), recoupmentBeneficiaryId: owners[0], participants: rules.participants });
const preview = {
  schema: "allocation-preview/v1", releaseId, period, agreementVersion: "1", statementRevision: "1", grossYocto,
  recoupedYocto: allocation.recoupedYocto.toString(),
  entitlements: allocation.entitlements.map((entry) => ({ ownerId: entry.ownerId, amountYocto: entry.amountYocto.toString() }))
};
const allocationPreviewHash = sha256Hex(canonicalJson(preview));
const deductionEvidenceHash = sha256Hex(canonicalJson({ schema: "deduction-evidence/v1", normalizedStatementHash: statement.normalizedHash, unsupportedClaimLineIds: [] }));

function save(journal) {
  mkdirSync(dirname(journalPath), { recursive: true });
  writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
}
function send(journal, step, signerId, method, args, depositYocto = "0", accessKeyFile = null) {
  journal.pendingStep = step;
  save(journal);
  const transactionHash = sendContractCall({ contractId, signerId, method, args, depositYocto, accessKeyFile });
  journal.transactions.push({ step, signerId, method, transactionHash });
  delete journal.pendingStep;
  save(journal);
  console.log(JSON.stringify({ step, transactionHash }));
  return transactionHash;
}
async function releaseView() {
  return provider.callFunction({ contractId, method: "get_release", args: { release_id: releaseId }, finality: "final" });
}
async function settlementView() {
  return provider.callFunction({ contractId, method: "get_settlement", args: { release_id: releaseId, period }, finality: "final" });
}
function settlementDigest(value) {
  return sha256Hex([value.period, value.revision, value.agreement_version, value.normalized_statement_hash, value.gross_yocto, value.deduction_evidence_hash, value.allocation_preview_hash].join("|"));
}

const stage = process.argv[2];
if (stage === "dry-run") {
  console.log(JSON.stringify({ releaseId, owners, agentId, grossYocto, normalizedStatementHash: statement.normalizedHash, rulesHash: agreementCommitment.rulesHash, allocation: preview.entitlements }, null, 2));
} else if (stage === "prepare") {
  if (existsSync(journalPath)) throw new Error("Live journey journal already exists; inspect it before any replay");
  const agentKeys = await provider.viewAccessKeyList({ accountId: agentId, finality: "final" });
  const restricted = agentKeys.keys.find((entry) => entry.public_key === agentPublicKey)?.access_key.permission;
  assert(restricted && typeof restricted === "object" && "FunctionCall" in restricted);
  assert.equal(restricted.FunctionCall.receiver_id, contractId);
  assert.deepEqual(restricted.FunctionCall.method_names, ["approve_settlement", "dispute_settlement"]);
  const journal = {
    schema: "royaltydesk-live-journey/v1", status: "preparing", contractId, releaseId, period, recordingId, owners, agentId,
    statement: { rawHash: statement.rawHash, normalizedHash: statement.normalizedHash, grossYocto, csvSha256: createHash("sha256").update(csv).digest("hex") },
    agreement: { rulesHash: agreementCommitment.rulesHash, documentHash: agreementCommitment.documentHash, approvalDigest: agreementCommitment.approvalDigest },
    preview, allocationPreviewHash, deductionEvidenceHash, transactions: []
  };
  save(journal);
  send(journal, "create_release", contractId, "create_release", { release_id: releaseId, recording_id: recordingId, funder_id: contractId, invited_owner_ids: owners });
  const created = await releaseView();
  assert.equal(created.administrator_id, contractId);
  assert.deepEqual([...created.invited_owner_ids].sort(), [...owners].sort());
  for (const [index, ownerId] of owners.entries()) send(journal, `accept_owner_${index + 1}`, ownerId, "accept_membership", { release_id: releaseId });
  assert.deepEqual([...(await releaseView()).accepted_owner_ids].sort(), [...owners].sort());
  send(journal, "freeze_agreement", contractId, "freeze_agreement", { release_id: releaseId, input: {
    recording_id: recordingId, participants: rules.participants.map((entry) => ({ owner_id: entry.ownerId, basis_points: entry.basisPoints })),
    recoupment: { code: "advance-live", beneficiary_id: owners[0], cap_yocto: recoupmentCapYocto },
    effective_period: period, document_hash: agreementCommitment.documentHash
  } });
  const agreement = (await releaseView()).agreements.at(-1);
  assert.equal(String(agreement.version), "1");
  assert.equal(agreement.rules_hash, agreementCommitment.rulesHash);
  assert.equal(agreement.approval_digest, agreementCommitment.approvalDigest);
  for (const [index, ownerId] of owners.entries()) send(journal, `approve_agreement_owner_${index + 1}`, ownerId, "approve_agreement", { release_id: releaseId, version: "1", approval_digest: agreement.approval_digest });
  assert.equal(String((await releaseView()).active_agreement_version), "1");
  const expiresAtNanoseconds = (BigInt(Date.now() + 24 * 60 * 60 * 1000) * 1_000_000n).toString();
  send(journal, "set_mandate", owners[1], "set_mandate", { release_id: releaseId, input: { agent_id: agentId, agreement_version: "1", actions: ["approve_settlement"], max_gross_yocto: grossYocto, expires_at_nanoseconds: expiresAtNanoseconds } });
  const mandate = (await releaseView()).mandates.find((entry) => entry.owner_id === owners[1] && entry.agent_id === agentId);
  assert(mandate && !mandate.revoked && mandate.actions.includes("approve_settlement"));
  journal.mandate = { epoch: String(mandate.epoch), expiresAtNanoseconds, maxGrossYocto: grossYocto, restrictedPublicKey: agentPublicKey };
  save(journal);
  send(journal, "open_settlement", contractId, "open_settlement", { release_id: releaseId, input: {
    period, agreement_version: "1", normalized_statement_hash: statement.normalizedHash, gross_yocto: grossYocto,
    deduction_evidence_hash: deductionEvidenceHash, allocation_preview_hash: allocationPreviewHash
  } });
  const opened = await settlementView();
  assert.equal(opened.status, "Review");
  assert.equal(opened.normalized_statement_hash, statement.normalizedHash);
  assert.equal(opened.allocation_preview_hash, allocationPreviewHash);
  journal.settlementDigest = settlementDigest(opened);
  journal.status = "prepared";
  save(journal);
  console.log(JSON.stringify({ status: journal.status, releaseId, settlementDigest: journal.settlementDigest, journalPath }));
} else if (stage === "settle") {
  const journal = JSON.parse(readFileSync(journalPath, "utf8"));
  if (journal.status !== "prepared" || journal.pendingStep || !journal.agentApprovalTx) throw new Error("A confirmed agent approval must be recorded before settlement finalization");
  const opened = await settlementView();
  assert.equal(opened.status, "Review");
  assert.equal(settlementDigest(opened), journal.settlementDigest);
  send(journal, "approve_settlement_owner_1", owners[0], "approve_settlement", { release_id: releaseId, period, digest: journal.settlementDigest });
  send(journal, "approve_settlement_owner_3", owners[2], "approve_settlement", { release_id: releaseId, period, digest: journal.settlementDigest });
  send(journal, "fund_settlement", contractId, "fund_settlement", { release_id: releaseId, period }, grossYocto);
  const funded = await settlementView();
  assert.equal(funded.total_deposited_yocto, grossYocto);
  send(journal, "finalize_settlement", contractId, "finalize_settlement", { release_id: releaseId, period });
  const finalized = await settlementView();
  assert.equal(finalized.status, "Finalized");
  for (const expected of preview.entitlements) assert.equal(finalized.entitlements.find((entry) => entry.owner_id === expected.ownerId)?.amount_yocto, expected.amountYocto);
  for (const [index, ownerId] of owners.entries()) send(journal, `payout_owner_${index + 1}`, contractId, "execute_payout", { release_id: releaseId, period, owner_id: ownerId });
  const completed = await settlementView();
  assert.equal(completed.status, "Complete");
  assert.equal(completed.successful_payouts_yocto, grossYocto);
  assert(completed.entitlements.every((entry) => entry.status === "Paid"));
  journal.status = "complete";
  journal.finalSettlement = { status: completed.status, successfulPayoutsYocto: completed.successful_payouts_yocto, entitlements: completed.entitlements };
  save(journal);
  console.log(JSON.stringify({ status: journal.status, releaseId, journalPath, payoutTransactions: journal.transactions.filter((entry) => entry.step.startsWith("payout_owner_")) }));
} else {
  throw new Error("Use dry-run, prepare, or settle");
}
