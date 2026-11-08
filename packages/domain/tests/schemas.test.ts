import assert from "node:assert/strict";
import test from "node:test";
import { DOMAIN_LIMITS, U64_MAX } from "../src/limits.ts";
import { parseAgentAction } from "../src/schemas/agent-action.ts";
import { parseAgreementRules } from "../src/schemas/agreement.ts";
import { parseMandateDefinition } from "../src/schemas/mandate.ts";
import { parseReleaseDefinition } from "../src/schemas/release.ts";

const agreement = {
  schemaVersion: "1",
  releaseId: "release-demo",
  recordingId: "ISRC-DEMO-001",
  participants: [
    { ownerId: "producer.testnet", basisPoints: "4000" },
    { ownerId: "artist.testnet", basisPoints: "6000" }
  ],
  recoupment: null,
  effectivePeriod: "2026-10"
} as const;

test("SCHEMA-01 agreement validation sorts owners and rejects invalid economics", () => {
  assert.deepEqual(parseAgreementRules(agreement).participants.map((entry) => entry.ownerId), ["artist.testnet", "producer.testnet"]);
  assert.throws(() => parseAgreementRules({ ...agreement, participants: [{ ownerId: "artist.testnet", basisPoints: "6000" }, { ownerId: "producer.testnet", basisPoints: "3999" }] }));
  assert.throws(() => parseAgreementRules({ ...agreement, participants: [{ ownerId: "artist.testnet", basisPoints: "5000" }, { ownerId: "artist.testnet", basisPoints: "5000" }] }));
  assert.throws(() => parseAgreementRules({ ...agreement, effectivePeriod: "2026-13" }));
});

test("SCHEMA-02 release invitation bounds include maximum and reject maximum plus one", () => {
  const invitedOwnerIds = Array.from({ length: DOMAIN_LIMITS.maxInvitations }, (_, index) => `owner-${index}.testnet`);
  const input = { releaseId: "release-demo", recordingId: "ISRC-DEMO-001", administratorId: "admin.testnet", funderId: "admin.testnet", invitedOwnerIds };
  assert.equal(parseReleaseDefinition(input).invitedOwnerIds.length, DOMAIN_LIMITS.maxInvitations);
  assert.throws(() => parseReleaseDefinition({ ...input, invitedOwnerIds: [...invitedOwnerIds, "overflow.testnet"] }));
});

test("SCHEMA-03 mandate uses canonical counters, distinct agent, and action allowlist", () => {
  const input = {
    ownerId: "artist.testnet",
    agentId: "agent-artist.testnet",
    releaseId: "release-demo",
    agreementVersion: U64_MAX.toString(),
    actions: ["approve_settlement", "dispute_settlement"],
    maxGrossYocto: "1000",
    expiresAtNanoseconds: U64_MAX.toString(),
    epoch: "0"
  };
  assert.equal(parseMandateDefinition(input).agreementVersion, U64_MAX.toString());
  assert.throws(() => parseMandateDefinition({ ...input, agreementVersion: (U64_MAX + 1n).toString() }));
  assert.throws(() => parseMandateDefinition({ ...input, agentId: input.ownerId }));
  assert.throws(() => parseMandateDefinition({ ...input, actions: ["change_recipient"] }));
});

test("SCHEMA-04 agent actions validate evidence and never accept arbitrary action names", () => {
  const digest = "a".repeat(64);
  assert.deepEqual(parseAgentAction({ type: "raise_objection", settlementDigest: digest, evidenceIds: ["ded-001"], rationale: "Unsupported deduction" }), {
    type: "raise_objection",
    settlementDigest: digest,
    evidenceIds: ["ded-001"],
    rationale: "Unsupported deduction"
  });
  assert.throws(() => parseAgentAction({ type: "transfer", recipient: "attacker.testnet" }));
  assert.throws(() => parseAgentAction({ type: "raise_objection", settlementDigest: digest, evidenceIds: ["missing", "missing"], rationale: "Duplicate" }));
});
