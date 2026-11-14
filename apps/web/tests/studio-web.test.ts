import assert from "node:assert/strict";
import test from "node:test";
import { nearToYocto, yoctoToNear } from "../src/lib/studio-money.ts";
import { parseSingleByteRange } from "../src/server/media-range.ts";
import { allocateContractShares } from "../src/lib/studio-agent-allocation.ts";
import { acceptedSplit, handoffLabel, parseSplitOffer, type AgentInteractionStep } from "../src/lib/agent-interaction.ts";

test("COLLAB-01 saved offers show counteroffers and only a matching acceptance", () => {
  const step = (role: string, content: string): AgentInteractionStep => ({ role, content, agentId: role === "split_response" ? "composer" : "lyricist", model: "test-model", outputHash: content });
  const proposal = step("split_proposal", '{"lyricistBasisPoints":6000,"composerBasisPoints":4000}');
  const counter = step("split_response", '{"decision":"counter","lyricistBasisPoints":5500,"composerBasisPoints":4500}');
  const wrongAcceptance = step("split_proposal", '{"decision":"accept","lyricistBasisPoints":6000,"composerBasisPoints":4000}');
  const acceptance = step("split_proposal", '{"decision":"accept","lyricistBasisPoints":5500,"composerBasisPoints":4500}');
  assert.equal(parseSplitOffer(proposal)?.kind, "proposal");
  assert.equal(parseSplitOffer(counter)?.kind, "counter");
  assert.equal(acceptedSplit([proposal, counter, wrongAcceptance]), null);
  assert.equal(acceptedSplit([proposal, counter, acceptance])?.lyricistBasisPoints, 5500);
  assert.equal(handoffLabel(counter), "Counteroffer to Lyricist");
  assert.equal(parseSplitOffer(step("split_response", '{"decision":"counter","lyricistBasisPoints":5500,"composerBasisPoints":4600}')), null);
});

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

test("PAY-03 agent event shares match the contract's last-recipient dust rule", () => {
  assert.deepEqual(allocateContractShares("101", [{ id: "first", basisPoints: 3333 }, { id: "second", basisPoints: 6667 }]), [
    { id: "first", amountYocto: "33" }, { id: "second", amountYocto: "68" }
  ]);
  assert.deepEqual(allocateContractShares("1", [{ id: "first", basisPoints: 5000 }, { id: "second", basisPoints: 5000 }]), [
    { id: "first", amountYocto: "0" }, { id: "second", amountYocto: "1" }
  ]);
  assert.throws(() => allocateContractShares("1.5", [{ id: "first", basisPoints: 10_000 }]));
});
