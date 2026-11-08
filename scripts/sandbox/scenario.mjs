import { readFile } from "node:fs/promises";
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
  const agentId = `agent-${suffix}.${rootId}`;
  const sinkId = `sink-${suffix}.${rootId}`;
  const contractId = `contract-${suffix}.${rootId}`;
  const ownerKey = KeyPair.fromRandom("ed25519");
  const agentKey = KeyPair.fromRandom("ed25519");
  const sinkKey = KeyPair.fromRandom("ed25519");
  const contractKey = KeyPair.fromRandom("ed25519");

  await createAccount(root, ownerId, ownerKey, "10");
  await createAccount(root, agentId, agentKey, "10");
  await createAccount(root, sinkId, sinkKey, "2");
  await createAccount(root, contractId, contractKey, "5");

  const owner = new Account(ownerId, provider, ownerKey.toString());
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

  return {
    rpc: RPC_URL,
    rootAccount: rootId,
    contractAccount: contractId,
    ownerAccount: ownerId,
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

async function call(account, method, args, receiverId = account.accountId) {
  const response = await account.signAndSendTransaction({
    receiverId,
    actions: [actions.functionCall(method, args, GAS, 0n)],
    waitUntil: "FINAL",
  });
  return getTransactionLastResult(response);
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
  equal(actual, expected) {
    if (actual !== expected) {
      throw new Error(`expected ${expected}, received ${actual}`);
    }
  },
};
