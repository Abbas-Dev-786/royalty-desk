import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { Account, JsonRpcProvider, KeyPair, parseNearAmount } from "near-api-js";
import { addStudioAgent, createStudio, openDatabase } from "@studio/persistence";
import { verifyStudioAgentKey } from "../../apps/worker/src/studio/agent-key-proof.ts";
import { runSandboxCommand, startSandbox, stopSandbox } from "./process.mjs";

const home = await mkdtemp(join(tmpdir(), "studio-agent-key-sandbox-"));
let sandbox;
try {
  await runSandboxCommand(home, "init");
  sandbox = await startSandbox(home);
  const provider = new JsonRpcProvider({ url: "http://127.0.0.1:3030" });
  const validator = JSON.parse(await readFile(join(home, "validator_key.json"), "utf8"));
  const rootId = validator.account_id ?? "test.near";
  const root = new Account(rootId, provider, validator.secret_key);
  const suffix = `studio${Date.now().toString(36)}`;
  const contractId = `contract-${suffix}.${rootId}`;
  const agentIds = [`lyricist-${suffix}.${rootId}`, `composer-${suffix}.${rootId}`];
  const contractKey = KeyPair.fromRandom("ed25519");
  await root.createAccount({ newAccountId: contractId, publicKey: contractKey.getPublicKey(), nearToTransfer: parseNearAmount("2") });
  const database = openDatabase(join(home, "studio.sqlite"));
  try {
    createStudio(database, "studio-sandbox", rootId);
    const proofs = [];
    for (const [index, accountId] of agentIds.entries()) {
      const fullKey = KeyPair.fromRandom("ed25519");
      await root.createAccount({ newAccountId: accountId, publicKey: fullKey.getPublicKey(), nearToTransfer: parseNearAmount("2") });
      const restrictedKey = KeyPair.fromRandom("ed25519");
      const agentAccount = new Account(accountId, provider, fullKey.toString());
      await agentAccount.addFunctionCallAccessKey({ publicKey: restrictedKey.getPublicKey(), contractId, methodNames: ["accept_split"], allowance: parseNearAmount("0.25") });
      const agentId = index === 0 ? "lyricist" : "composer";
      addStudioAgent(database, { id: agentId, studioId: "studio-sandbox", accountId, controllerAccountId: rootId, role: agentId, active: true, keyReference: restrictedKey.getPublicKey().toString(), allowedTools: ["lyrics", "composition", "review", "split_proposal", "split_response"] });
      const keyFilePath = join(home, `${agentId}.json`);
      await writeFile(keyFilePath, JSON.stringify({ account_id: accountId, public_key: restrictedKey.getPublicKey().toString(), private_key: restrictedKey.toString() }), { mode: 0o600 });
      let proof;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        try {
          proof = await verifyStudioAgentKey(database, provider, { agentId, keyFilePath, contractId, allowedMethods: ["accept_split"] });
          break;
        } catch (error) {
          if (error?.name !== "AccessKeyDoesNotExistError" || attempt === 19) throw error;
          await new Promise((resolveWait) => setTimeout(resolveWait, 300));
        }
      }
      assert.ok(proof);
      proofs.push(proof);
    }
    assert.notEqual(proofs[0].accountId, proofs[1].accountId);
    assert.notEqual(proofs[0].publicKey, proofs[1].publicKey);
    console.log(JSON.stringify({ status: "pass", network: "sandbox", contractId, proofs }));
  } finally {
    database.close();
  }
} finally {
  stopSandbox(sandbox);
  const safeRoot = resolve(tmpdir()) + sep;
  if (!resolve(home).startsWith(safeRoot)) throw new Error("Unsafe sandbox cleanup path");
  await rm(home, { recursive: true, force: true });
}
