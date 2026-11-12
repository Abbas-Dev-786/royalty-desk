import assert from "node:assert/strict";
import test from "node:test";
import { nearToYocto, yoctoToNear } from "../src/lib/studio-money.ts";
import { parseSingleByteRange } from "../src/server/media-range.ts";

test("CAT-05 single-range seeking and suffix ranges stay inside the media blob", () => {
  assert.deepEqual(parseSingleByteRange("bytes=0-499", 1000), { start: 0, end: 499 });
  assert.deepEqual(parseSingleByteRange("bytes=500-", 1000), { start: 500, end: 999 });
  assert.deepEqual(parseSingleByteRange("bytes=-50", 1000), { start: 950, end: 999 });
  assert.deepEqual(parseSingleByteRange("bytes=0-5000", 1000), { start: 0, end: 999 });
  assert.throws(() => parseSingleByteRange("bytes=1000-", 1000));
  assert.throws(() => parseSingleByteRange("bytes=0-1,3-4", 1000));
});

test("PAY-01/02 checkout amounts use exact integer yoctoNEAR", () => {
  assert.equal(nearToYocto("0.01"), "10000000000000000000000");
  assert.equal(nearToYocto("0.015"), "15000000000000000000000");
  assert.equal(nearToYocto("0.001"), "1000000000000000000000");
  assert.equal(yoctoToNear("15000000000000000000000"), "0.015");
  assert.throws(() => nearToYocto("0.0000000000000000000000001"));
  assert.throws(() => nearToYocto("1e3"));
});
