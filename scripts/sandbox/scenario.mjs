import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  Account,
  JsonRpcProvider,
  KeyPair,
  getTransactionLastResult,
  actions,
  parseNearAmount,
} from "near-api-js";

const RPC_URL = "http://127.0.0.1:3030";
const GAS = 100_000_000_000_000n;
const ONE_YOCTONEAR = 1n;

export async function runScenario({ home, wasmPath }) {
  const provider = new JsonRpcProvider({ url: RPC_URL });
  const validator = JSON.parse(await readFile(`${home}/validator_key.json`, "utf8"));
  const rootId = validator.account_id ?? "test.near";
  const root = new Account(rootId, provider, validator.secret_key);
  const suffix = `rd${Date.now().toString(36)}`;
  const ownerId = `owner-${suffix}.${rootId}`;
  const ownerTwoId = `owner-two-${suffix}.${rootId}`;
  const ownerThreeId = `owner-three-${suffix}.${rootId}`;
  const failedOwnerId = `failed-owner-${suffix}.${rootId}`;
  const funderId = `funder-${suffix}.${rootId}`;
  const agentId = `agent-${suffix}.${rootId}`;
  const sinkId = `sink-${suffix}.${rootId}`;
  const contractId = `contract-${suffix}.${rootId}`;
  const ownerKey = KeyPair.fromRandom("ed25519");
  const ownerTwoKey = KeyPair.fromRandom("ed25519");
  const ownerThreeKey = KeyPair.fromRandom("ed25519");
  const failedOwnerKey = KeyPair.fromRandom("ed25519");
  const funderKey = KeyPair.fromRandom("ed25519");
  const agentKey = KeyPair.fromRandom("ed25519");
  const sinkKey = KeyPair.fromRandom("ed25519");
  const contractKey = KeyPair.fromRandom("ed25519");

  await createAccount(root, ownerId, ownerKey, "10");
  await createAccount(root, ownerTwoId, ownerTwoKey, "10");
  await createAccount(root, ownerThreeId, ownerThreeKey, "10");
  await createAccount(root, failedOwnerId, failedOwnerKey, "2");
  await createAccount(root, funderId, funderKey, "10");
  await createAccount(root, agentId, agentKey, "10");
  await createAccount(root, sinkId, sinkKey, "2");
  await createAccount(root, contractId, contractKey, "5");

  const owner = new Account(ownerId, provider, ownerKey.toString());
  const ownerTwo = new Account(ownerTwoId, provider, ownerTwoKey.toString());
  const ownerThree = new Account(ownerThreeId, provider, ownerThreeKey.toString());
  const failedOwner = new Account(failedOwnerId, provider, failedOwnerKey.toString());
  const funder = new Account(funderId, provider, funderKey.toString());
  const agent = new Account(agentId, provider, agentKey.toString());
  const contract = new Account(contractId, provider, contractKey.toString());
  await contract.deployContract(new Uint8Array(await readFile(wasmPath)));
  await call(contract, "new", { network_id: "testnet", operator_id: ownerId });

  const restrictedKey = KeyPair.fromRandom("ed25519");
  await agent.addFunctionCallAccessKey({
    publicKey: restrictedKey.getPublicKey(),
    contractId,
    methodNames: ["agent_probe"],
    allowance: parseNearAmount("1") ?? "1000000000000000000000000",
  });
  const restrictedAgent = new Account(agentId, provider, restrictedKey.toString());
  const accessKey = await restrictedAgent.getAccessKey(restrictedKey.getPublicKey());
  const permissionText = JSON.stringify(accessKey.permission);
  assertIncludes(permissionText, contractId);
  assertIncludes(permissionText, "agent_probe");

  const health = await provider.callFunction({ contractId, method: "health", args: {} });
  const allowedResult = await call(restrictedAgent, "agent_probe", {}, contractId);
  const wrongMethod = await rejectedCall(restrictedAgent, "owner_probe", {}, contractId);
  const wrongReceiver = await rejectedTransaction(restrictedAgent, sinkId);
  const restrictedDeposit = await rejectedTransaction(restrictedAgent, contractId, "agent_probe", ONE_YOCTONEAR);
  const attachedDeposit = await rejectedTransaction(agent, contractId, "agent_probe", ONE_YOCTONEAR);
  const ownerResult = await call(owner, "owner_probe", {}, contractId);
  const outsiderResult = await rejectedCall(agent, "owner_probe", {}, contractId);

  assert.equal(health?.application, "royaltydesk");
  assert.equal(allowedResult, agentId);
  assert.equal(ownerResult, ownerId);
  assertIncludes(wrongMethod, "owner_probe");
  assertIncludes(wrongReceiver, sinkId);
  assertNotSuccess(restrictedDeposit);
  assertIncludesOneOf(attachedDeposit, ["ERR_AGENT_DEPOSIT", "doesn't accept deposit"]);
  assertIncludes(outsiderResult, "ERR_OWNER_CALLER");

  const releaseId = `release-${suffix}`;
  await call(owner, "create_release", { release_id: releaseId, recording_id: "recording-demo", funder_id: funderId, invited_owner_ids: [ownerId, ownerTwoId, ownerThreeId] }, contractId);
  const uninvitedMembership = await rejectedCall(agent, "accept_membership", { release_id: releaseId }, contractId);
  assertIncludes(uninvitedMembership, "ERR_NOT_INVITED");
  await call(owner, "accept_membership", { release_id: releaseId }, contractId);
  await call(ownerTwo, "accept_membership", { release_id: releaseId }, contractId);
  await call(ownerThree, "accept_membership", { release_id: releaseId }, contractId);
  const duplicateMembership = await rejectedCall(owner, "accept_membership", { release_id: releaseId }, contractId);
  assertIncludes(duplicateMembership, "ERR_DUPLICATE_ACCEPTANCE");
  const agreementInput = {
    recording_id: "recording-demo",
    participants: [
      { owner_id: ownerId, basis_points: "5000" },
      { owner_id: ownerTwoId, basis_points: "3000" },
      { owner_id: ownerThreeId, basis_points: "2000" },
    ],
    recoupment: { code: "advance", beneficiary_id: ownerId, cap_yocto: "1000000000000000000" },
    effective_period: "2026-01",
    document_hash: "document-hash-demo",
  };
  assertIncludes(await rejectedCall(owner, "freeze_agreement", { release_id: releaseId, input: { ...agreementInput, effective_period: "2026-13" } }, contractId), "ERR_AGREEMENT_INPUT");
  await call(owner, "freeze_agreement", { release_id: releaseId, input: agreementInput }, contractId);
  await call(owner, "freeze_agreement", { release_id: releaseId, input: agreementInput }, contractId);
  const lateReleaseId = `late-${suffix}`;
  await call(owner, "create_release", { release_id: lateReleaseId, recording_id: "late-recording", funder_id: funderId, invited_owner_ids: [ownerId, ownerTwoId, ownerThreeId] }, contractId);
  await call(owner, "accept_membership", { release_id: lateReleaseId }, contractId);
  await call(ownerTwo, "accept_membership", { release_id: lateReleaseId }, contractId);
  await call(owner, "freeze_agreement", { release_id: lateReleaseId, input: { recording_id: "late-recording", participants: [{ owner_id: ownerId, basis_points: "5000" }, { owner_id: ownerTwoId, basis_points: "5000" }], recoupment: null, effective_period: "2026-01", document_hash: "late-document" } }, contractId);
  assertIncludes(await rejectedCall(ownerThree, "accept_membership", { release_id: lateReleaseId }, contractId), "ERR_MEMBERSHIP_FROZEN");
  const releaseAfterFreeze = await provider.callFunction({ contractId, method: "get_release", args: { release_id: releaseId } });
  const staleAgreement = releaseAfterFreeze.agreements[0];
  assert.equal(staleAgreement.superseded, true);
  const staleProposalApproval = await rejectedCall(owner, "approve_agreement", { release_id: releaseId, version: String(staleAgreement.version), approval_digest: staleAgreement.approval_digest }, contractId);
  assertIncludes(staleProposalApproval, "ERR_AGREEMENT_DIGEST");
  const agreement = releaseAfterFreeze.agreements[releaseAfterFreeze.agreements.length - 1];
  const agreementVersion = String(agreement.version);
  const wrongAgreementApproval = await rejectedCall(owner, "approve_agreement", { release_id: releaseId, version: agreementVersion, approval_digest: "wrong-digest" }, contractId);
  assertIncludes(wrongAgreementApproval, "ERR_AGREEMENT_DIGEST");
  await call(owner, "approve_agreement", { release_id: releaseId, version: agreementVersion, approval_digest: agreement.approval_digest }, contractId);
  await call(ownerTwo, "approve_agreement", { release_id: releaseId, version: agreementVersion, approval_digest: agreement.approval_digest }, contractId);
  await call(ownerThree, "approve_agreement", { release_id: releaseId, version: agreementVersion, approval_digest: agreement.approval_digest }, contractId);
  const expiry = String(Date.now() * 1_000_000 + 3_600_000_000_000);
  await call(ownerTwo, "set_mandate", { release_id: releaseId, input: { agent_id: agentId, agreement_version: agreementVersion, actions: ["approve_settlement", "dispute_settlement"], max_gross_yocto: "2000000000000000000", expires_at_nanoseconds: expiry } }, contractId);
  const period = "2026-02";
  assertIncludes(await rejectedCall(owner, "open_settlement", { release_id: releaseId, input: { period: "bad-date", agreement_version: agreementVersion, normalized_statement_hash: "statement-hash", gross_yocto: "1000000000000000000", deduction_evidence_hash: "evidence-hash", allocation_preview_hash: "preview-hash" } }, contractId), "ERR_SETTLEMENT_INPUT");
  await call(owner, "open_settlement", { release_id: releaseId, input: { period, agreement_version: agreementVersion, normalized_statement_hash: "statement-hash", gross_yocto: "1000000000000000000", deduction_evidence_hash: "evidence-hash", allocation_preview_hash: "preview-hash" } }, contractId);
  const settlementBeforeApproval = await provider.callFunction({ contractId, method: "get_settlement", args: { release_id: releaseId, period } });
  const settlementDigest = sha256Hex(`${period}|${settlementBeforeApproval.revision}|${settlementBeforeApproval.agreement_version}|${settlementBeforeApproval.normalized_statement_hash}|${settlementBeforeApproval.gross_yocto}|${settlementBeforeApproval.deduction_evidence_hash}|${settlementBeforeApproval.allocation_preview_hash}`);
  await call(owner, "approve_settlement", { release_id: releaseId, period, digest: settlementDigest }, contractId);
  await call(agent, "approve_settlement", { release_id: releaseId, period, digest: settlementDigest }, contractId);
  await call(ownerThree, "approve_settlement", { release_id: releaseId, period, digest: settlementDigest }, contractId);
  await call(funder, "fund_settlement", { release_id: releaseId, period }, contractId, parseNearAmount("2") ?? "2000000000000000000000000");
  await call(owner, "finalize_settlement", { release_id: releaseId, period }, contractId);
  await call(owner, "execute_payout", { release_id: releaseId, period, owner_id: ownerId }, contractId);
  const replayedPayout = await rejectedCall(owner, "execute_payout", { release_id: releaseId, period, owner_id: ownerId }, contractId);
  assertIncludes(replayedPayout, "ERR_PAYOUT_PENDING");
  await call(owner, "execute_payout", { release_id: releaseId, period, owner_id: ownerTwoId }, contractId);
  await call(owner, "execute_payout", { release_id: releaseId, period, owner_id: ownerThreeId }, contractId);
  const paidBeforeRefund = await provider.callFunction({ contractId, method: "get_settlement", args: { release_id: releaseId, period } });
  assert.equal(String(paidBeforeRefund.status), "Complete", "participant payouts complete with excess still refundable");
  assert.equal(BigInt(paidBeforeRefund.refundable_yocto) > 0n, true);
  assertLedger(paidBeforeRefund);
  await call(funder, "withdraw_refundable", { release_id: releaseId, period }, contractId);
  const settlementAfter = await provider.callFunction({ contractId, method: "get_settlement", args: { release_id: releaseId, period } });
  assert.equal(String(settlementAfter.status), "Complete", "primary settlement completion");
  assert.equal(String(settlementAfter.unpaid_entitlements_yocto), "0");
  assert.equal(String(settlementAfter.in_flight_yocto), "0");
  assertLedger(settlementAfter);

  const cancelledPeriod = "2026-03";
  await call(owner, "open_settlement", { release_id: releaseId, input: { period: cancelledPeriod, agreement_version: agreementVersion, normalized_statement_hash: "cancel-statement", gross_yocto: "1000000000000000000", deduction_evidence_hash: "cancel-evidence", allocation_preview_hash: "cancel-preview" } }, contractId);
  await call(funder, "fund_settlement", { release_id: releaseId, period: cancelledPeriod }, contractId, parseNearAmount("1") ?? "1000000000000000000000000");
  await call(owner, "approve_cancellation", { release_id: releaseId, period: cancelledPeriod }, contractId);
  await call(ownerTwo, "approve_cancellation", { release_id: releaseId, period: cancelledPeriod }, contractId);
  await call(ownerThree, "approve_cancellation", { release_id: releaseId, period: cancelledPeriod }, contractId);
  await call(funder, "withdraw_refundable", { release_id: releaseId, period: cancelledPeriod }, contractId);
  const cancelledSettlement = await provider.callFunction({ contractId, method: "get_settlement", args: { release_id: releaseId, period: cancelledPeriod } });
  assert.equal(String(cancelledSettlement.status), "Cancelled");
  assert.equal(String(cancelledSettlement.refundable_yocto), "0");
  assertLedger(cancelledSettlement);

  const revisedPeriod = "2026-04";
  await call(owner, "open_settlement", { release_id: releaseId, input: { period: revisedPeriod, agreement_version: agreementVersion, normalized_statement_hash: "revision-one", gross_yocto: "1000000000000000000", deduction_evidence_hash: "evidence-one", allocation_preview_hash: "preview-one" } }, contractId);
  await call(agent, "dispute_settlement", { release_id: releaseId, period: revisedPeriod, reason_hash: "unsupported-deduction" }, contractId);
  const heldSettlement = await provider.callFunction({ contractId, method: "get_settlement", args: { release_id: releaseId, period: revisedPeriod } });
  assert.equal(String(heldSettlement.status), "Held");
  await call(ownerTwo, "clear_dispute", { release_id: releaseId, period: revisedPeriod }, contractId);
  await call(owner, "revise_settlement", { release_id: releaseId, input: { period: revisedPeriod, agreement_version: agreementVersion, normalized_statement_hash: "revision-two", gross_yocto: "500000000000000000", deduction_evidence_hash: "evidence-two", allocation_preview_hash: "preview-two" } }, contractId);
  const revisedSettlement = await provider.callFunction({ contractId, method: "get_settlement", args: { release_id: releaseId, period: revisedPeriod } });
  assert.equal(String(revisedSettlement.revision), "2");
  await call(funder, "fund_settlement", { release_id: releaseId, period: revisedPeriod }, contractId, parseNearAmount("1") ?? "1000000000000000000000000");
  const prematureFinalize = await rejectedCall(owner, "finalize_settlement", { release_id: releaseId, period: revisedPeriod }, contractId);
  assertIncludes(prematureFinalize, "ERR_APPROVALS");
  await call(owner, "approve_cancellation", { release_id: releaseId, period: revisedPeriod }, contractId);
  await call(ownerTwo, "approve_cancellation", { release_id: releaseId, period: revisedPeriod }, contractId);
  await call(ownerThree, "approve_cancellation", { release_id: releaseId, period: revisedPeriod }, contractId);
  await call(funder, "withdraw_refundable", { release_id: releaseId, period: revisedPeriod }, contractId);
  const revisedCancelled = await provider.callFunction({ contractId, method: "get_settlement", args: { release_id: releaseId, period: revisedPeriod } });
  assert.equal(String(revisedCancelled.status), "Cancelled");

  const staleMandatePeriod = "2026-05";
  await call(ownerTwo, "set_mandate", { release_id: releaseId, input: { agent_id: agentId, agreement_version: agreementVersion, actions: ["approve_settlement"], max_gross_yocto: "2000000000000000000", expires_at_nanoseconds: expiry } }, contractId);
  await call(owner, "open_settlement", { release_id: releaseId, input: { period: staleMandatePeriod, agreement_version: agreementVersion, normalized_statement_hash: "stale-statement", gross_yocto: "500000000000000000", deduction_evidence_hash: "stale-evidence", allocation_preview_hash: "stale-preview" } }, contractId);
  const staleSettlement = await provider.callFunction({ contractId, method: "get_settlement", args: { release_id: releaseId, period: staleMandatePeriod } });
  const staleDigest = settlementDigestFor(staleSettlement);
  await call(agent, "approve_settlement", { release_id: releaseId, period: staleMandatePeriod, digest: staleDigest }, contractId);
  await call(ownerTwo, "revoke_mandate", { release_id: releaseId }, contractId);
  await call(owner, "approve_settlement", { release_id: releaseId, period: staleMandatePeriod, digest: staleDigest }, contractId);
  await call(ownerThree, "approve_settlement", { release_id: releaseId, period: staleMandatePeriod, digest: staleDigest }, contractId);
  await call(funder, "fund_settlement", { release_id: releaseId, period: staleMandatePeriod }, contractId, parseNearAmount("1") ?? "1000000000000000000000000");
  const staleFinalize = await rejectedCall(owner, "finalize_settlement", { release_id: releaseId, period: staleMandatePeriod }, contractId);
  assertIncludes(staleFinalize, "ERR_APPROVALS");
  await call(owner, "approve_cancellation", { release_id: releaseId, period: staleMandatePeriod }, contractId);
  await call(ownerTwo, "approve_cancellation", { release_id: releaseId, period: staleMandatePeriod }, contractId);
  await call(ownerThree, "approve_cancellation", { release_id: releaseId, period: staleMandatePeriod }, contractId);
  await call(funder, "withdraw_refundable", { release_id: releaseId, period: staleMandatePeriod }, contractId);

  const failedReleaseId = `failed-release-${suffix}`;
  await call(owner, "create_release", { release_id: failedReleaseId, recording_id: "recording-failure", funder_id: funderId, invited_owner_ids: [ownerId, ownerTwoId, failedOwnerId] }, contractId);
  await call(owner, "accept_membership", { release_id: failedReleaseId }, contractId);
  await call(ownerTwo, "accept_membership", { release_id: failedReleaseId }, contractId);
  await call(failedOwner, "accept_membership", { release_id: failedReleaseId }, contractId);
  await call(owner, "freeze_agreement", { release_id: failedReleaseId, input: { recording_id: "recording-failure", participants: [{ owner_id: ownerId, basis_points: "5000" }, { owner_id: ownerTwoId, basis_points: "3000" }, { owner_id: failedOwnerId, basis_points: "2000" }], recoupment: null, effective_period: "2026-01", document_hash: "failure-document" } }, contractId);
  const failedRelease = await provider.callFunction({ contractId, method: "get_release", args: { release_id: failedReleaseId } });
  const failedAgreement = failedRelease.agreements[0];
  const failedVersion = String(failedAgreement.version);
  for (const account of [owner, ownerTwo, failedOwner]) await call(account, "approve_agreement", { release_id: failedReleaseId, version: failedVersion, approval_digest: failedAgreement.approval_digest }, contractId);
  const failedPeriod = "2026-06";
  await call(owner, "open_settlement", { release_id: failedReleaseId, input: { period: failedPeriod, agreement_version: failedVersion, normalized_statement_hash: "failure-statement", gross_yocto: "1000000000000000000", deduction_evidence_hash: "failure-evidence", allocation_preview_hash: "failure-preview" } }, contractId);
  const failedSettlement = await provider.callFunction({ contractId, method: "get_settlement", args: { release_id: failedReleaseId, period: failedPeriod } });
  const failedDigest = settlementDigestFor(failedSettlement);
  for (const account of [owner, ownerTwo, failedOwner]) await call(account, "approve_settlement", { release_id: failedReleaseId, period: failedPeriod, digest: failedDigest }, contractId);
  await call(funder, "fund_settlement", { release_id: failedReleaseId, period: failedPeriod }, contractId, parseNearAmount("1") ?? "1000000000000000000000000");
  await call(owner, "finalize_settlement", { release_id: failedReleaseId, period: failedPeriod }, contractId);
  await failedOwner.deleteAccount(sinkId);
  await call(owner, "execute_payout", { release_id: failedReleaseId, period: failedPeriod, owner_id: ownerId }, contractId);
  await call(owner, "execute_payout", { release_id: failedReleaseId, period: failedPeriod, owner_id: ownerTwoId }, contractId);
  await call(owner, "execute_payout", { release_id: failedReleaseId, period: failedPeriod, owner_id: failedOwnerId }, contractId);
  const failedAfter = await provider.callFunction({ contractId, method: "get_settlement", args: { release_id: failedReleaseId, period: failedPeriod } });
  assert.equal(String(failedAfter.in_flight_yocto), "0");
  assert.equal(String(failedAfter.status), "Paying");
  assertLedger(failedAfter);
  await createAccount(root, failedOwnerId, failedOwnerKey, "2");
  await call(owner, "execute_payout", { release_id: failedReleaseId, period: failedPeriod, owner_id: failedOwnerId }, contractId);
  await call(funder, "withdraw_refundable", { release_id: failedReleaseId, period: failedPeriod }, contractId);
  const failedComplete = await provider.callFunction({ contractId, method: "get_settlement", args: { release_id: failedReleaseId, period: failedPeriod } });
  assert.equal(String(failedComplete.status), "Complete", "failed-recipient retry completion");
  assertLedger(failedComplete);

  return {
    rpc: RPC_URL,
    rootAccount: rootId,
    contractAccount: contractId,
    ownerAccount: ownerId,
    ownerTwoAccount: ownerTwoId,
    ownerThreeAccount: ownerThreeId,
    funderAccount: funderId,
    agentAccount: agentId,
    restrictedKey: {
      receiverId: contractId,
      methodNames: ["agent_probe"],
      observedPermission: sanitizePermission(accessKey),
    },
    checks: {
      healthView: "pass",
      restrictedZeroDepositCall: "pass",
      restrictedDisallowedMethod: "pass",
      restrictedWrongReceiver: "pass",
      restrictedAttachedDeposit: "pass",
      contractDepositGuard: "pass",
      ownerGuard: "pass",
      releaseMembership: "pass",
      authorityRejections: "pass",
      agreementUnanimity: "pass",
      mandateScopedAgent: "pass",
      settlementFunding: "pass",
      deterministicFinalization: "pass",
      payoutCallbacks: "pass",
      payoutReplayRejected: "pass",
      refundCallbacks: "pass",
      cancellationRefund: "pass",
      disputeClearAndRevision: "pass",
      revokedMandateRejected: "pass",
      failedRecipientRetry: "pass",
    },
  };
}

async function createAccount(parent, accountId, keyPair, near) {
  await parent.createAccount({
    newAccountId: accountId,
    publicKey: keyPair.getPublicKey(),
    nearToTransfer: parseNearAmount(near) ?? "0",
  });
}

async function call(account, method, args, receiverId = account.accountId, deposit = 0n) {
  const response = await account.signAndSendTransaction({
    receiverId,
    actions: [actions.functionCall(method, args, GAS, deposit)],
    waitUntil: "FINAL",
  });
  return getTransactionLastResult(response);
}

function sha256Hex(value) {
  return createHash("sha256").update(value).digest("hex");
}

function settlementDigestFor(settlement) {
  return sha256Hex(`${settlement.period}|${settlement.revision}|${settlement.agreement_version}|${settlement.normalized_statement_hash}|${settlement.gross_yocto}|${settlement.deduction_evidence_hash}|${settlement.allocation_preview_hash}`);
}

function assertLedger(settlement) {
  const total = BigInt(settlement.total_deposited_yocto);
  const categories = BigInt(settlement.unallocated_yocto) + BigInt(settlement.refundable_yocto) + BigInt(settlement.unpaid_entitlements_yocto) + BigInt(settlement.in_flight_yocto) + BigInt(settlement.successful_payouts_yocto) + BigInt(settlement.successful_refunds_yocto);
  assert.equal(categories, total);
}

async function rejectedCall(account, method, args, receiverId = account.accountId) {
  return rejectedTransaction(account, receiverId, method, 0n, args);
}

async function rejectedTransaction(account, receiverId, method = "agent_probe", deposit = 0n, args = {}) {
  try {
    const response = await account.signAndSendTransaction({
      receiverId,
      actions: [actions.functionCall(method, args, GAS, deposit)],
      waitUntil: "FINAL",
      throwOnFailure: false,
    });
    const status = response.status;
    if (typeof status === "object" && "Failure" in status && status.Failure) {
      return JSON.stringify(status.Failure);
    }
    throw new Error(`transaction unexpectedly succeeded: ${JSON.stringify(status)}`);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function sanitizePermission(accessKey) {
  const permission = accessKey.permission;
  return JSON.parse(JSON.stringify(permission, (_, value) => (typeof value === "bigint" ? value.toString() : value)));
}

function assertIncludes(value, expected) {
  if (!String(value).includes(expected)) {
    throw new Error(`expected rejection to include ${expected}, received ${value}`);
  }
}

function assertIncludesOneOf(value, expectedValues) {
  const text = String(value);
  if (!expectedValues.some((expected) => text.includes(expected))) {
    throw new Error(`expected rejection to include one of ${expectedValues.join(", ")}, received ${text}`);
  }
}

function assertNotSuccess(value) {
  if (String(value).includes("unexpectedly succeeded")) {
    throw new Error(`expected rejection, received ${value}`);
  }
}

const assert = {
  equal(actual, expected, context = "") {
    if (actual !== expected) {
      throw new Error(`${context ? `${context}: ` : ""}expected ${expected}, received ${actual}`);
    }
  },
};
