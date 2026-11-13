import { guestAccountId, guestSong } from "@/server/studio-guest";
import { openStudioCatalogueDatabase, studioContractClient } from "@/server/studio-catalogue";

export async function GET(): Promise<Response> {
  const headers = { "cache-control": "private, no-store" };
  try {
    const accountId = await guestAccountId();
    const guest = guestSong(accountId);
    if (!guest?.work_id) return Response.json({ error: "ERR_GUEST_SONG_NOT_READY" }, { status: 409, headers });
    const chain = studioContractClient();
    const guardianId = await chain.guardian();
    const database = openStudioCatalogueDatabase();
    let assetHash: string | undefined;
    try {
      assetHash = (database.prepare("SELECT asset_hash FROM studio_work_versions WHERE work_id = ? AND version = 1 AND state = 'accepted'").get(guest.work_id) as { asset_hash: string } | undefined)?.asset_hash;
    } finally { database.close(); }
    if (!assetHash) return Response.json({ error: "ERR_GUEST_SONG_NOT_READY" }, { status: 409, headers });
    const [policy, release] = await Promise.all([chain.policy(), chain.release(guest.work_id, 1)]);
    if (!release || release.media_hash !== assetHash || release.published || policy.paused || release.policy_epoch !== policy.epoch) return Response.json({ error: "ERR_GUEST_RELEASE_CHANGED" }, { status: 409, headers });
    const approved = await chain.hasApprovedRelease(guest.work_id, 1, release.policy_epoch);
    return Response.json({ contractId: chain.contractId, guardianId, workId: guest.work_id, version: 1, commitment: release.commitment, policyEpoch: release.policy_epoch, approved, requiresApproval: policy.human_review }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERR_GUEST_APPROVAL";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : 503, headers });
  }
}
