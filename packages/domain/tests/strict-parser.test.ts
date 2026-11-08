import assert from "node:assert/strict";
import test from "node:test";
import { DomainError } from "../src/errors.ts";
import { parseStrictCsv } from "../src/statements/strict-parser.ts";

test("CSV-PARSER-01 handles quoted commas, escaped quotes, and multiline fields", () => {
  assert.deepEqual(parseStrictCsv('a,b,c\n"hello, world","say ""hi""","line one\nline two"\n'), [
    ["a", "b", "c"],
    ["hello, world", 'say "hi"', "line one\nline two"]
  ]);
});

test("CSV-PARSER-02 handles CRLF, CR, empty fields, and trailing fields", () => {
  assert.deepEqual(parseStrictCsv("a,,c\r\n1,2,\r3,4,5"), [["a", "", "c"], ["1", "2", ""], ["3", "4", "5"]]);
});

test("CSV-PARSER-03 rejects malformed quote syntax and NUL", () => {
  for (const input of ['a,"unclosed', 'a,b"bad"', "a,\u0000b"]) assert.throws(() => parseStrictCsv(input), DomainError);
});
