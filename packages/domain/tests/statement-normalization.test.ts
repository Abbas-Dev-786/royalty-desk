import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DomainError } from "../src/errors.ts";
import { escapeSpreadsheetCell, normalizeStatementRecords, STATEMENT_HEADERS } from "../src/statements/normalize.ts";
import { U128_MAX, YOCTO_PER_NEAR } from "../src/limits.ts";

function simpleFixtureRecords(name: string): { readonly records: readonly (readonly string[])[]; readonly bytes: Uint8Array } {
  const bytes = readFileSync(new URL(`../../../fixtures/statements/${name}`, import.meta.url));
  const text = new TextDecoder().decode(bytes).trimEnd();
  return { records: text.split(/\r?\n/).map((line) => line.split(",")), bytes };
}

test("CSV-01 normalized canonical rows produce a payable 10 NEAR gross", () => {
  const source = simpleFixtureRecords("canonical.csv");
  const result = normalizeStatementRecords(source.records, source.bytes);
  assert.equal(result.grossYocto, "10000000000000000000000000");
  assert.equal(result.payable, true);
  assert.deepEqual(result.rows.map((row) => row.lineId), ["rev-001", "rev-002"]);
});

test("CSV-02 normalized row order does not change semantic hash", () => {
  const source = simpleFixtureRecords("canonical.csv");
  const [header, first, second] = source.records;
  assert.ok(header && first && second);
  const original = normalizeStatementRecords([header, first, second], source.bytes);
  const reordered = normalizeStatementRecords([header, second, first], new TextEncoder().encode("reordered-source"));
  assert.equal(original.normalizedHash, reordered.normalizedHash);
  assert.notEqual(original.rawHash, reordered.rawHash);
});

test("CSV-03 duplicate lines and invalid amount records are rejected", () => {
  for (const name of ["duplicate-line.csv", "invalid-amount.csv"]) {
    const source = simpleFixtureRecords(name);
    assert.throws(() => normalizeStatementRecords(source.records, source.bytes), DomainError);
  }
});

test("CSV-03 aggregate revenue cannot exceed u128 even when each row is valid", () => {
  const maximum = `${U128_MAX / YOCTO_PER_NEAR}.${String(U128_MAX % YOCTO_PER_NEAR).padStart(24, "0")}`;
  const records = [STATEMENT_HEADERS, ["stmt", "a", "2026-10", "recording", "platform", "revenue", maximum, "NEAR", "", ""], ["stmt", "b", "2026-10", "recording", "platform", "revenue", "0.000000000000000000000001", "NEAR", "", ""]];
  assert.throws(() => normalizeStatementRecords(records, new Uint8Array()), { code: "ERR_AMOUNT_OVERFLOW" });
});

test("CSV-04 unsupported deduction remains evidence and blocks payable status", () => {
  const source = simpleFixtureRecords("unsupported-claim.csv");
  const result = normalizeStatementRecords(source.records, source.bytes, "advance-v1");
  assert.equal(result.grossYocto, "10000000000000000000000000");
  assert.deepEqual(result.unsupportedClaimLineIds, ["ded-001"]);
  assert.equal(result.payable, false);
});

test("CSV-04 an approved recoupment claim must match the deterministic remaining amount", () => {
  const source = simpleFixtureRecords("unsupported-claim.csv");
  const claim = source.records.find((row) => row[5] === "deduction_claim");
  assert.ok(claim);
  const code = claim[8] ?? "";
  const amount = claim[6] ?? "";
  const [whole, fraction = ""] = amount.split(".");
  const expected = BigInt(whole ?? "0") * YOCTO_PER_NEAR + BigInt(fraction.padEnd(24, "0"));
  const supported = normalizeStatementRecords(source.records, source.bytes, code, expected);
  assert.equal(supported.payable, true);
  assert.equal(normalizeStatementRecords(source.records, source.bytes, code, expected + 1n).payable, false);
  assert.equal(normalizeStatementRecords(source.records, source.bytes, code).payable, false);
});

test("CSV-05 strict headers and row bounds are enforced", () => {
  const row = ["stmt", "row", "2026-10", "recording", "platform", "revenue", "1", "NEAR", "", ""];
  assert.throws(() => normalizeStatementRecords([STATEMENT_HEADERS.slice(0, -1), row], new Uint8Array()), DomainError);
  assert.throws(() => normalizeStatementRecords([STATEMENT_HEADERS, ...Array.from({ length: 101 }, (_, index) => [
    "stmt", `row-${index}`, "2026-10", "recording", "platform", "revenue", "1", "NEAR", "", ""
  ])], new Uint8Array()), DomainError);
});

test("CSV-05 spreadsheet formula prefixes are escaped for export", () => {
  for (const prefix of ["=", "+", "-", "@"]) assert.equal(escapeSpreadsheetCell(`${prefix}SUM(A1)`), `'${prefix}SUM(A1)`);
  assert.equal(escapeSpreadsheetCell("Spotify"), "Spotify");
});
