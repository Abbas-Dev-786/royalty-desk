import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { DomainError } from "../src/errors.ts";
import { importStatementCsv } from "../src/statements/csv.ts";
import { escapeSpreadsheetCell, STATEMENT_HEADERS } from "../src/statements/normalize.ts";

function fixture(name: string): Uint8Array {
  return readFileSync(new URL(`../../../fixtures/statements/${name}`, import.meta.url));
}

test("CSV-01 canonical statement normalizes to a payable 10 NEAR gross", () => {
  const result = importStatementCsv(fixture("canonical.csv"));
  assert.equal(result.grossYocto, "10000000000000000000000000");
  assert.equal(result.payable, true);
  assert.deepEqual(result.rows.map((row) => row.lineId), ["rev-001", "rev-002"]);
});

test("CSV-02 row order and line endings do not change semantic hash", () => {
  const canonical = readFileSync(new URL("../../../fixtures/statements/canonical.csv", import.meta.url), "utf8");
  const lines = canonical.trimEnd().split("\n");
  const reordered = [lines[0], lines[2], lines[1]].join("\r\n");
  assert.equal(importStatementCsv(canonical).normalizedHash, importStatementCsv(reordered).normalizedHash);
  assert.notEqual(importStatementCsv(canonical).rawHash, importStatementCsv(reordered).rawHash);
});

test("CSV-03 duplicate lines and invalid amounts are rejected with domain errors", () => {
  for (const name of ["duplicate-line.csv", "invalid-amount.csv"]) {
    assert.throws(() => importStatementCsv(fixture(name)), DomainError);
  }
});

test("CSV-04 unsupported deduction remains evidence and blocks payable status", () => {
  const result = importStatementCsv(fixture("unsupported-claim.csv"), "advance-v1");
  assert.equal(result.grossYocto, "10000000000000000000000000");
  assert.deepEqual(result.unsupportedClaimLineIds, ["ded-001"]);
  assert.equal(result.payable, false);
});

test("CSV-05 strict headers, row bounds, and UTF-8/size limits are enforced", () => {
  const wrongHeader = `${STATEMENT_HEADERS.slice(0, -1).join(",")}\n`;
  assert.throws(() => importStatementCsv(wrongHeader), DomainError);
  const header = `${STATEMENT_HEADERS.join(",")}\n`;
  const row = "stmt,row,2026-10,recording,platform,revenue,1,NEAR,,\n";
  assert.throws(() => importStatementCsv(header + row.repeat(101)), DomainError);
  assert.throws(() => importStatementCsv(new Uint8Array([0xff, 0xfe, 0xfd])), DomainError);
  assert.throws(() => importStatementCsv(new Uint8Array(1_048_577)), DomainError);
});

test("CSV-05 spreadsheet formula prefixes are escaped for export", () => {
  for (const prefix of ["=", "+", "-", "@"]) assert.equal(escapeSpreadsheetCell(`${prefix}SUM(A1)`), `'${prefix}SUM(A1)`);
  assert.equal(escapeSpreadsheetCell("Spotify"), "Spotify");
});
