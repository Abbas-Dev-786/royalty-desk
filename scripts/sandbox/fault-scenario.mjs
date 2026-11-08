import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import {
  Account,
  JsonRpcProvider,
  KeyPair,
  actions,
  getTransactionLastResult,
  parseNearAmount,
} from "near-api-js";

const RPC_URL = "http://127.0.0.1:3030";
const GAS = 100_000_000_000_000n;

export async function runFaultScenario({ home, wasmPath }) {
  const provider = new JsonRpcProvider({ url: RPC_URL });
  const validator = JSON.parse(await readFile(`${home}/validator_key.json`, "utf8"));
  const rootId = validator.account_id ?? "test.near";
  const root = new Account(rootId, provider, validator.secret_key);
  const suffix = `fault${Date.now().toString(36)}`;
  const ownerId = `owner-${suffix}.${rootId}`;
  const ownerTwoId = `owner-two-${suffix}.${rootId}`;
  const funderId = `funder-${suffix}.${rootId}`;
  const contractId = `contract-${suffix}.${rootId}`;
  const sinkId = `sink-${suffix}.${rootId}`;
  const ownerKey = KeyPair.fromRandom("ed25519");
  const ownerTwoKey = KeyPair.fromRandom("ed25519");
  const funderKey = KeyPair.fromRandom("ed25519");
  const contractKey = KeyPair.fromRandom("ed25519");
  const sinkKey = KeyPair.fromRandom("ed25519");
  for (const [id, key, amount] of [[ownerId, ownerKey, "5"], [ownerTwoId, ownerTwoKey, "5"], [funderId, funderKey, "5"], [contractId, contractKey, "5"], [sinkId, sinkKey, "1"]]) {
    await root.createAccount({ newAccountId: id, publicKey: key.getPublicKey(), nearToTransfer: parseNearAmount(amount) ?? "0" });
  }
  const owner = new Account(ownerId, provider, ownerKey.toString());
  const ownerTwo = new Account(ownerTwoId, provider, ownerTwoKey.toString());
  const funder = new Account(funderId, provider, funderKey.toString());
  const contract = new Account(contractId, provider, contractKey.toString());
  await contract.deployContract(new Uint8Array(await readFile(wasmPath)));
  await call(contract, "new", { network_id: "testnet", operator_id: ownerId });

  const releaseId = `release-${suffix}`;
  await call(owner, "create_release", { release_id: releaseId, recording_id: "fault-recording", funder_id: funderId, invited_owner_ids: [ownerId, ownerTwoId] }, contractId);
  await call(owner, "accept_membership", { release_id: releaseId }, contractId);
  await call(ownerTwo, "accept_membership", { release_id: releaseId }, contractId);
  const agreementInput = { recording_id: "fault-recording", participants: [{ owner_id: ownerId, basis_points: "5000" }, { owner_id: ownerTwoId, basis_points: "5000" }], recoupment: null, effective_period: "2026-01", document_hash: "fault-document" };
  await call(owner, "freeze_agreement", { release_id: releaseId, input: agreementInput }, contractId);
  const release = await provider.callFunction({ contractId, method: "get_release", args: { release_id: releaseId } });
  const agreement = release.agreements[release.agreements.length - 1];
  const version = String(agreement.version);
  for (const account of [owner, ownerTwo]) await call(account, "approve_agreement", { release_id: releaseId, version, approval_digest: agreement.approval_digest }, contractId);
  const period = "2026-fault";
  await call(owner, "open_settlement", { release_id: releaseId, input: { period, agreement_version: version, normalized_statement_hash: "fault-statement", gross_yocto: "1000000000000000000", deduction_evidence_hash: "fault-evidence", allocation_preview_hash: "fault-preview" } }, contractId);
  const settlement = await provider.callFunction({ contractId, method: "get_settlement", args: { release_id: releaseId, period } });
  const digest = sha256Hex(`${settlement.period}|${settlement.revision}|${settlement.agreement_version}|${settlement.normalized_statement_hash}|${settlement.gross_yocto}|${settlement.deduction_evidence_hash}|${settlement.allocation_preview_hash}`);
  for (const account of [owner, ownerTwo]) await call(account, "approve_settlement", { release_id: releaseId, period, digest }, contractId);
  await call(funder, "fund_settlement", { release_id: releaseId, period }, contractId, "1000000000000000000");
  await call(owner, "finalize_settlement", { release_id: releaseId, period }, contractId);

  await call(owner, "execute_payout", { release_id: releaseId, period, owner_id: ownerId }, contractId, 0n, true);
  const pending = await provider.callFunction({ contractId, method: "get_settlement", args: { release_id: releaseId, period } });
  assert.equal(String(pending.status), "Paying");
  assert.equal(String(pending.in_flight_yocto), "500000000000000000");
  assert.equal(String(pending.entitlements.find((entry) => entry.owner_id === ownerId)?.status), "Pending");
  await rejectedCall(owner, "execute_payout", { release_id: releaseId, period, owner_id: ownerId }, contractId);
  const afterReplay = await provider.callFunction({ contractId, method: "get_settlement", args: { release_id: releaseId, period } });
  assert.equal(String(afterReplay.in_flight_yocto), String(pending.in_flight_yocto));
  assert.equal(String(afterReplay.entitlements.find((entry) => entry.owner_id === ownerId)?.attempt_id), String(pending.entitlements.find((entry) => entry.owner_id === ownerId)?.attempt_id));
  return { rpc: RPC_URL, contractAccount: contractId, releaseId, period, checks: { callbackInterrupted: "pass", entitlementPending: "pass", replayBlocked: "pass" } };
}

async function call(account, method, args, receiverId = account.accountId, deposit = 0n, allowFailure = false) {
  const response = await account.signAndSendTransaction({ receiverId, actions: [actions.functionCall(method, args, GAS, deposit)], waitUntil: "FINAL", throwOnFailure: false });
  const status = response.status;
  if (!allowFailure && typeof status === "object" && status !== null && "Failure" in status && status.Failure) throw new Error(`unexpected transaction failure for ${method}: ${JSON.stringify(status.Failure)}`);
  return getTransactionLastResult(response);
}

async function rejectedCall(account, method, args, receiverId) {
  try {
    const response = await account.signAndSendTransaction({ receiverId, actions: [actions.functionCall(method, args, GAS, 0n)], waitUntil: "FINAL", throwOnFailure: false });
    const status = response.status;
    if (typeof status === "object" && status !== null && "Failure" in status && status.Failure) return JSON.stringify(status.Failure);
    return `transaction unexpectedly succeeded: ${JSON.stringify(status)}`;
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
}

function sha256Hex(value) { return createHash("sha256").update(value).digest("hex"); }
const assert = { equal(actual, expected) { if (actual !== expected) throw new Error(`expected ${expected}, received ${actual}`); } };
