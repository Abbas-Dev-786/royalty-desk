import assert from "node:assert/strict";
import test from "node:test";
import { nearToYocto, yoctoToNear } from "../src/lib/studio-money.ts";
import { parseSingleByteRange } from "../src/server/media-range.ts";
import { allocateContractShares } from "../src/lib/studio-agent-allocation.ts";
import { acceptedSplit, handoffLabel, parseSplitOffer, type AgentInteractionStep } from "../src/lib/agent-interaction.ts";
import { isAlbumRun, trackBrief, trackTitle } from "../src/lib/studio-album-run.ts";
import { requireAlbumTrackAccess, type StudioProjectAccess } from "../src/lib/studio-album-access.ts";

test("ALBUM-UI-01 two tracks get distinct bounded briefs and resumable inputs", () => {
  const concept = "A warm jazz story about finding home in a changing city.";
  assert.notEqual(trackBrief(concept, 0), trackBrief(concept, 1));
  assert.ok(trackBrief("x".repeat(1600), 1).length <= 2000);
  assert.notEqual(trackTitle("City Lights", 0), trackTitle("City Lights", 1));
  const run = { accountId: "owner.testnet", projectId: "project-album-123e4567-e89b-12d3-a456-426614174000", title: "City Lights", concept, lyricistId: "lyricist", composerId: "composer", reviewerId: "reviewer", deadlines: [0, 0], stage: 0, songIds: [] };
  assert.equal(isAlbumRun(run, "owner.testnet"), true);
  assert.equal(isAlbumRun(run, "another.testnet"), false);
});

test("ALBUM-ACCESS-02 owners can generate only their two assigned tracks", () => {
  const access: StudioProjectAccess = { kind: "album_owner", studioId: "studio-a", accountId: "owner.testnet", title: "City Lights", concept: "A warm jazz story about finding home in a changing city.", lyricistId: "lyricist", composerId: "composer", reviewerId: "reviewer" };
  for (const track of [0, 1] as const) assert.doesNotThrow(() => requireAlbumTrackAccess(access, trackBrief(access.concept, track), "lyricist", "composer", "reviewer", trackTitle(access.title, track)));
  assert.throws(() => requireAlbumTrackAccess(access, trackBrief(access.concept, 0), "other", "composer", "reviewer"), /ERR_ALBUM_AGENT_SCOPE/);
  assert.throws(() => requireAlbumTrackAccess(access, "A different song with no relation to this album.", "lyricist", "composer", "reviewer"), /ERR_ALBUM_TRACK_SCOPE/);
  assert.throws(() => requireAlbumTrackAccess(access, trackBrief(access.concept, 0), "lyricist", "composer", "reviewer", trackTitle(access.title, 1)), /ERR_ALBUM_TRACK_SCOPE/);
});

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
