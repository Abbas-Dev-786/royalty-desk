import { guestAccountId, guestSong } from "@/server/studio-guest";
import { openStudioCatalogueDatabase, studioContractClient } from "@/server/studio-catalogue";

export async function GET(request: Request): Promise<Response> {
  const headers = { "cache-control": "private, no-store" };
  try {
    const accountId = await guestAccountId();
    const projectId = new URL(request.url).searchParams.get("projectId") ?? undefined;
    const guest = guestSong(accountId, projectId);
    if (!guest?.work_id) return Response.json({ error: "ERR_GUEST_SONG_NOT_READY" }, { status: 409, headers });
    const database = openStudioCatalogueDatabase();
    let version: { state: string; asset_hash: string } | undefined;
    try {
      version = database.prepare("SELECT state, asset_hash FROM studio_work_versions WHERE work_id = ? AND version = 1").get(guest.work_id) as { state: string; asset_hash: string } | undefined;
    } finally { database.close(); }
    if (!version) return Response.json({ error: "ERR_GUEST_SONG_NOT_READY" }, { status: 409, headers });
    if (version.state === "review") return Response.json({ ready: false, workId: guest.work_id, version: 1, state: "review" }, { headers });
    if (version.state !== "accepted") return Response.json({ error: "ERR_GUEST_SONG_NOT_READY" }, { status: 409, headers });
    const chain = studioContractClient();
    const guardianId = await chain.guardian();
    const [policy, release] = await Promise.all([chain.policy(), chain.release(guest.work_id, 1)]);
    if (!release || release.media_hash !== version.asset_hash) return Response.json({ error: "ERR_GUEST_RELEASE_CHANGED" }, { status: 409, headers });
    if (release.published) return Response.json({ published: true, workId: guest.work_id, version: 1 }, { headers });
    if (release.policy_epoch !== policy.epoch) return Response.json({ error: "ERR_GUEST_RELEASE_POLICY_STALE" }, { status: 409, headers });
    if (policy.paused) return Response.json({ error: "ERR_STUDIO_PAUSED" }, { status: 409, headers });
    const approved = await chain.hasApprovedRelease(guest.work_id, 1, release.policy_epoch);
    return Response.json({ published: false, contractId: chain.contractId, guardianId, workId: guest.work_id, version: 1, commitment: release.commitment, policyEpoch: release.policy_epoch, approved, requiresApproval: policy.human_review }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERR_GUEST_APPROVAL";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : 503, headers });
  }
}
