import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { allocateEntitlements } from "../src/money/allocation.ts";
import { formatNearAmount, parseNearAmount } from "../src/money/amount.ts";
import { U128_MAX } from "../src/limits.ts";
import type { ParticipantShare } from "../src/types.ts";

interface AllocationVector {
  readonly name: string;
  readonly grossYocto: string;
  readonly remainingRecoupmentYocto: string;
  readonly recoupmentBeneficiaryId: string | null;
  readonly participants: readonly ParticipantShare[];
  readonly expected: Readonly<Record<string, string>>;
}

const vectors = JSON.parse(readFileSync(new URL("../../../fixtures/allocations/vectors.json", import.meta.url), "utf8")) as readonly AllocationVector[];

test("MONEY-DECIMAL-01 parses and formats canonical NEAR decimals", () => {
  assert.equal(parseNearAmount("1"), 1_000_000_000_000_000_000_000_000n);
  assert.equal(parseNearAmount("4.8"), 4_800_000_000_000_000_000_000_000n);
  assert.equal(parseNearAmount("0.000000000000000000000001"), 1n);
  assert.equal(formatNearAmount(4_800_000_000_000_000_000_000_000n), "4.8");
  for (const invalid of ["", " 1", "1 ", "01", "+1", "-1", "1e3", "NaN", "1.", ".1", "0.0000000000000000000000001"]) {
    assert.throws(() => parseNearAmount(invalid), undefined, invalid);
  }
  assert.throws(() => parseNearAmount((U128_MAX + 1n).toString()));
});

for (const vector of vectors) {
  test(`MONEY-04 ${vector.name}`, () => {
    const result = allocateEntitlements({
      grossYocto: BigInt(vector.grossYocto),
      remainingRecoupmentYocto: BigInt(vector.remainingRecoupmentYocto),
      recoupmentBeneficiaryId: vector.recoupmentBeneficiaryId,
      participants: vector.participants
    });
    assert.deepEqual(
      Object.fromEntries(result.entitlements.map((entry) => [entry.ownerId, entry.amountYocto.toString()])),
      vector.expected
    );
    assert.equal(result.entitlements.reduce((sum, entry) => sum + entry.amountYocto, 0n), result.grossYocto);
  });
}

test("MONEY-04 supports zero shares and u128-scale gross without precision loss", () => {
  const participants: readonly ParticipantShare[] = [
    { ownerId: "a.testnet", basisPoints: "10000" },
    { ownerId: "b.testnet", basisPoints: "0" }
  ];
  const result = allocateEntitlements({
    grossYocto: U128_MAX,
    remainingRecoupmentYocto: 0n,
    recoupmentBeneficiaryId: null,
    participants
  });
  assert.equal(result.entitlements[0]?.amountYocto, U128_MAX);
  assert.equal(result.entitlements[1]?.amountYocto, 0n);
});

test("MONEY-04 seeded allocation traces always conserve gross", () => {
  let state = 0x5eed1234;
  const next = (): number => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
  for (let iteration = 0; iteration < 250; iteration += 1) {
    const first = BigInt(next() % 10_001);
    const participants: readonly ParticipantShare[] = [
      { ownerId: "a.testnet", basisPoints: first.toString() },
      { ownerId: "b.testnet", basisPoints: (10_000n - first).toString() }
    ];
    const gross = BigInt((next() % 1_000_000) + 1);
    const remaining = BigInt(next() % 1_000_000);
    const result = allocateEntitlements({ grossYocto: gross, remainingRecoupmentYocto: remaining, recoupmentBeneficiaryId: "b.testnet", participants });
    assert.equal(result.entitlements.reduce((sum, entry) => sum + entry.amountYocto, 0n), gross);
    assert.ok(result.entitlements.every((entry) => entry.amountYocto >= 0n));
  }
});

test("MONEY-04 rejects zero gross, bad shares, and missing recoupment beneficiary", () => {
  const participants: readonly ParticipantShare[] = [
    { ownerId: "a.testnet", basisPoints: "6000" },
    { ownerId: "b.testnet", basisPoints: "4000" }
  ];
  assert.throws(() => allocateEntitlements({ grossYocto: 0n, remainingRecoupmentYocto: 0n, recoupmentBeneficiaryId: null, participants }));
  assert.throws(() => allocateEntitlements({ grossYocto: 1n, remainingRecoupmentYocto: 1n, recoupmentBeneficiaryId: null, participants }));
  assert.throws(() => allocateEntitlements({
    grossYocto: 1n,
    remainingRecoupmentYocto: 0n,
    recoupmentBeneficiaryId: null,
    participants: [{ ownerId: "a.testnet", basisPoints: "5000" }, { ownerId: "b.testnet", basisPoints: "4000" }]
  }));
});
