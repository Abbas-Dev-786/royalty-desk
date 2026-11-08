import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { canonicalJson } from "../src/canonical/canonical-json.ts";
import { createAgreementCommitment } from "../src/canonical/commitments.ts";
import { parseAgreementRules } from "../src/schemas/agreement.ts";

interface CanonicalFixture {
  readonly rules: unknown;
  readonly renderedDocument: string;
  readonly context: {
    readonly networkId: string;
    readonly contractId: string;
    readonly releaseId: string;
    readonly agreementVersion: string;
  };
  readonly expected: {
    readonly rulesBytes: string;
    readonly rulesHash: string;
    readonly documentHash: string;
    readonly approvalBytes: string;
    readonly approvalDigest: string;
  };
}

const fixture = JSON.parse(readFileSync(new URL("../../../fixtures/agreements/canonical-v1.json", import.meta.url), "utf8")) as CanonicalFixture;

test("AGR-01 canonical agreement bytes and hashes match the pinned vector", () => {
  const rules = parseAgreementRules(fixture.rules);
  const result = createAgreementCommitment(rules, new TextEncoder().encode(fixture.renderedDocument), fixture.context);
  assert.deepEqual(result, fixture.expected);
});

test("AGR-01 object order and participant input order do not change normalized rules", () => {
  const record = fixture.rules as Readonly<Record<string, unknown>>;
  const participants = [...(record.participants as readonly unknown[])].reverse();
  const reordered = parseAgreementRules({
    effectivePeriod: record.effectivePeriod,
    recoupment: record.recoupment,
    participants,
    recordingId: record.recordingId,
    releaseId: record.releaseId,
    schemaVersion: record.schemaVersion
  });
  const original = parseAgreementRules(fixture.rules);
  assert.equal(canonicalJson(reordered as never), canonicalJson(original as never));
});

test("AGR-01 domain mutations change the approval digest", () => {
  const rules = parseAgreementRules(fixture.rules);
  const document = new TextEncoder().encode(fixture.renderedDocument);
  const base = createAgreementCommitment(rules, document, fixture.context).approvalDigest;
  for (const context of [
    { ...fixture.context, networkId: "mainnet" },
    { ...fixture.context, contractId: "other.testnet" },
    { ...fixture.context, releaseId: "release-other" },
    { ...fixture.context, agreementVersion: "2" }
  ]) {
    assert.notEqual(createAgreementCommitment(rules, document, context).approvalDigest, base);
  }
  assert.notEqual(createAgreementCommitment(rules, new TextEncoder().encode(`${fixture.renderedDocument}changed`), fixture.context).approvalDigest, base);
});

test("AGR-01 rejects numeric, undefined, bigint, and sparse canonical values", () => {
  assert.throws(() => canonicalJson({ amount: 1 } as never));
  assert.throws(() => canonicalJson({ amount: undefined } as never));
  assert.throws(() => canonicalJson({ amount: 1n } as never));
  const sparse: string[] = [];
  sparse[1] = "value";
  assert.throws(() => canonicalJson(sparse));
});
