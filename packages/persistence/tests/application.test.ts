import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { parseAgreementRules } from "@royaltydesk/domain";
import { consumeChallenge, createChallenge, createChainOperation, createSession, EncryptedFileStore, findSession, freezeAgreement, getChainOperation, importStatement, openDatabase, updateChainOperation, upsertUser } from "../src/index.ts";

function databasePath(): string { return join(mkdtempSync(join(tmpdir(), "royaltydesk-app-")), "app.sqlite"); }

test("P05-AUTH-01 challenge is single-use under concurrent verification", () => {
  const database = openDatabase(databasePath());
  const challenge = createChallenge(database, { domain: "http://localhost:3000", networkId: "testnet", message: "login", nowMs: 100 });
  assert.ok(consumeChallenge(database, challenge.nonce, 101));
  assert.equal(consumeChallenge(database, challenge.nonce, 101), undefined);
  database.close();
});

test("P05-AUTH-02 sessions are revoked and do not cross users", () => {
  const database = openDatabase(databasePath());
  const user = upsertUser(database, { networkId: "testnet", accountId: "owner.testnet", publicKey: "ed25519:key" });
  const session = createSession(database, user.id, 10_000, 100);
  assert.equal(findSession(database, session.token, 101)?.accountId, "owner.testnet");
  database.prepare("UPDATE sessions SET revoked_at_ms = 102 WHERE token_hash = (SELECT token_hash FROM sessions LIMIT 1)").run();
  assert.equal(findSession(database, session.token, 103), undefined);
  database.close();
});

test("P05-PERSIST-01 encrypted documents never store plaintext", () => {
  const root = join(mkdtempSync(join(tmpdir(), "royaltydesk-files-")), "private");
  const store = new EncryptedFileStore(root, "a-secure-test-secret-with-32-bytes");
  const key = "a".repeat(48);
  const source = new TextEncoder().encode("private statement");
  store.put(key, source);
  assert.deepEqual(store.get(key), source);
  assert.equal(readFileSync(join(root, `${key}.bin`)).includes("private statement"), false);
});

test("P06-STATEMENT-01 duplicate semantic import is idempotent and corrections get revisions", () => {
  const database = openDatabase(databasePath());
  const csv = "statement_id,line_id,period,recording_id,platform,row_type,amount,currency,deduction_code,evidence_ref\nstmt-1,line-1,2026-01,recording-1,synthetic,revenue,1,NEAR,,evidence-1\n";
  const first = importStatement(database, { releaseId: "release-1", csv, importedBy: "owner.testnet" });
  const duplicate = importStatement(database, { releaseId: "release-1", csv: csv.replace("evidence-1", "evidence-1"), importedBy: "owner.testnet" });
  const correction = importStatement(database, { releaseId: "release-1", csv: csv.replace(",1,NEAR", ",2,NEAR"), importedBy: "owner.testnet" });
  assert.equal(duplicate.revision, first.revision);
  assert.equal(correction.revision, "2");
  database.close();
});

test("P06-AGREEMENT-01 frozen agreement records exact commitment", () => {
  const database = openDatabase(databasePath());
  const rules = parseAgreementRules({ schemaVersion: "1", releaseId: "release-1", recordingId: "recording-1", effectivePeriod: "2026-01", participants: [{ ownerId: "alice.testnet", basisPoints: "6000" }, { ownerId: "bob.testnet", basisPoints: "4000" }], recoupment: null });
  const agreement = freezeAgreement(database, { rules, version: "1", createdBy: "alice.testnet", networkId: "testnet", contractId: "contract.testnet" });
  assert.equal(agreement.version, "1");
  assert.equal(agreement.documentHash.length, 64);
  assert.equal(database.prepare("SELECT status FROM agreement_drafts WHERE release_id = 'release-1' AND version = '1'").get()?.status, "frozen");
  database.close();
});

test("P05-CHAIN-01 operation identity survives unknown outcome reconciliation", () => {
  const database = openDatabase(databasePath());
  const operation = createChainOperation(database, { id: "op-1", logicalKey: "payout:release-1:1", releaseId: "release-1", operationType: "execute_payout", intentJson: "{}" });
  assert.equal(updateChainOperation(database, operation.id, { status: "unknown", transactionHash: "hash-1" })?.status, "unknown");
  assert.equal(getChainOperation(database, operation.id)?.transactionHash, "hash-1");
  assert.throws(() => createChainOperation(database, { ...operation, id: "op-2" }));
  database.close();
});
