import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { allocateAlbum, allocateRevenue, allocateSong, assertEconomicTransition, assertPayoutTransition, assertStudioTaskTransition, assertWorkTransition, netRevenue, parseYocto, studioSplitDigest, validateAlbumTracks, validateRevenueEvent, validateShares, validateStudioAgent, validateStudioPolicy, validateWorkVersion } from "../src/studio/index.ts";

const shares = [{ agentId: "agent-a", basisPoints: 6000 }, { agentId: "agent-b", basisPoints: 4000 }] as const;
const tracks = [{ songId: "song-a", songVersion: 1, basisPoints: 5000 }, { songId: "song-b", songVersion: 1, basisPoints: 5000 }] as const;

test("DOM-02 rejects invalid splits, duplicate contributors and tracks", () => {
  validateShares(shares);
  assert.throws(() => validateShares([{ agentId: "agent-a", basisPoints: 9999 }]));
  assert.throws(() => validateShares([{ agentId: "agent-a", basisPoints: 5000 }, { agentId: "agent-a", basisPoints: 5000 }]));
  assert.throws(() => validateAlbumTracks([{ songId: "song-a", songVersion: 1, basisPoints: 5000 }, { songId: "song-a", songVersion: 1, basisPoints: 5000 }]));
  assert.throws(() => validateWorkVersion({ workId: "song-a", studioId: "studio-a", version: 0, kind: "song", state: "draft", title: "X", assetHash: "a".repeat(64), metadataHash: "b".repeat(64), priceYocto: "1", split: shares }));
});

test("DOM-03 conserves integer allocations with deterministic dust", () => {
  assert.deepEqual(allocateSong("7", shares), [{ id: "agent-a", amountYocto: "4" }, { id: "agent-b", amountYocto: "3" }]);
  assert.deepEqual(allocateAlbum("5", tracks), [{ id: "song-a", amountYocto: "3" }, { id: "song-b", amountYocto: "2" }]);
  assert.equal(allocateSong("1000000000000000000000000", shares).reduce((sum, row) => sum + BigInt(row.amountYocto), 0n), 1000000000000000000000000n);
  for (const value of ["01", "-1", "1.2", " 1", "1e3", "", (1n << 128n).toString()]) assert.throws(() => parseYocto(value));
});

test("DOM-03 counts only finalized net revenue", () => {
  const event = { id: "order-1", workId: "song-a", workVersion: 1, kind: "purchase" as const, buyerAccountId: "buyer.testnet", grossYocto: "100", feeYocto: "10", refundableYocto: "5", state: "finalized" as const };
  assert.equal(netRevenue(event), "85");
  assert.equal(netRevenue({ ...event, state: "requested" }), "0");
  assert.throws(() => validateRevenueEvent({ ...event, feeYocto: "101" }));
});

test("DOM-02 validates agent policy and work transitions", () => {
  validateStudioAgent({ id: "agent-a", studioId: "studio-a", accountId: "agent-a.testnet", controllerAccountId: "admin.testnet", role: "producer", active: true });
  assert.throws(() => validateStudioAgent({ id: "agent-a", studioId: "studio-a", accountId: "INVALID", controllerAccountId: "admin.testnet", role: "producer", active: true }));
  validateStudioPolicy({ studioId: "studio-a", version: 1, mode: "human_review", maxGenerationCalls: 10, maxPayoutYocto: "100", paused: false });
  assert.throws(() => validateStudioPolicy({ studioId: "studio-a", version: 1, mode: "human_review", maxGenerationCalls: 0, maxPayoutYocto: "100", paused: false }));
  assertWorkTransition("draft", "review");
  assert.throws(() => assertWorkTransition("draft", "published"));
  assert.throws(() => assertWorkTransition("published", "draft"));
  assertEconomicTransition("requested", "finalized");
  assert.throws(() => assertEconomicTransition("refunded", "finalized"));
  assertPayoutTransition("owed", "pending");
  assert.throws(() => assertPayoutTransition("paid", "pending"));
  assertStudioTaskTransition("running", "disputed");
  assertStudioTaskTransition("queued", "timed_out");
  assert.throws(() => assertStudioTaskTransition("accepted", "running"));
});

test("DOM-03 independently specified economic vectors", () => {
  const vectors = JSON.parse(readFileSync(new URL("../../../fixtures/studio/economic-vectors.json", import.meta.url), "utf8")) as readonly { name: string; amountYocto: string; shares: readonly { agentId: string; basisPoints: number }[]; expected: readonly { id: string; amountYocto: string }[] }[];
  for (const vector of vectors) {
    assert.deepEqual(allocateSong(vector.amountYocto, vector.shares), vector.expected, vector.name);
    assert.equal(vector.expected.reduce((sum, part) => sum + BigInt(part.amountYocto), 0n), BigInt(vector.amountYocto), vector.name);
  }
});

test("DOM-03 split digest is stable across contributor ordering and changes on edits", () => {
  assert.equal(studioSplitDigest(shares), studioSplitDigest([...shares].reverse()));
  assert.notEqual(studioSplitDigest(shares), studioSplitDigest([{ agentId: "agent-a", basisPoints: 5000 }, { agentId: "agent-b", basisPoints: 5000 }]));
});

test("DOM-03 album purchase, album tip and refund vectors conserve funds", () => {
  const vectors = JSON.parse(readFileSync(new URL("../../../fixtures/studio/revenue-vectors.json", import.meta.url), "utf8")) as readonly { name: string; kind: "purchase" | "tip"; grossYocto: string; feeYocto: string; refundableYocto: string; state: "finalized" | "refunded"; expected: readonly { id: string; amountYocto: string }[] }[];
  const target = { kind: "album" as const, workId: "album-a", tracks: [{ songId: "song-a", songVersion: 1, basisPoints: 6000 }, { songId: "song-b", songVersion: 1, basisPoints: 4000 }], songShares: { "song-a": shares, "song-b": [{ agentId: "agent-c", basisPoints: 10000 }] } };
  for (const vector of vectors) {
    const event = { id: vector.name.replaceAll(" ", "-"), workId: "album-a", workVersion: 1, buyerAccountId: "buyer.testnet", kind: vector.kind, grossYocto: vector.grossYocto, feeYocto: vector.feeYocto, refundableYocto: vector.refundableYocto, state: vector.state };
    const actual = allocateRevenue(event, target);
    assert.deepEqual(actual, vector.expected, vector.name);
    assert.equal(actual.reduce((sum, row) => sum + BigInt(row.amountYocto), 0n), BigInt(netRevenue(event)));
  }
});
