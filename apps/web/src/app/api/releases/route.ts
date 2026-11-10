import { requireOrigin } from "@/server/runtime";
import { currentUser, getAppDatabase } from "@/server/runtime";
import { parseReleaseDefinition } from "@royaltydesk/domain";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const user = await currentUser();
    if (!user) return Response.json({ error: "ERR_UNAUTHORIZED" }, { status: 401 });
    const body = await request.json() as { releaseId?: unknown; recordingId?: unknown; funderId?: unknown; invitedOwnerIds?: unknown };
    if (!Array.isArray(body.invitedOwnerIds) || body.invitedOwnerIds.length < 2 || body.invitedOwnerIds.length > 5) return Response.json({ error: "ERR_INPUT" }, { status: 400 });
    const release = parseReleaseDefinition({ ...body, administratorId: user.accountId });
    if (!release.invitedOwnerIds.includes(user.accountId)) return Response.json({ error: "ERR_CREATOR_NOT_INVITED" }, { status: 400 });
    if (getAppDatabase().prepare("SELECT 1 FROM release_memberships WHERE release_id = ? LIMIT 1").get(release.releaseId)) return Response.json({ error: "ERR_RELEASE_EXISTS" }, { status: 409 });
    return Response.json({ releaseId: release.releaseId, administratorId: user.accountId, funderId: release.funderId, transactionRequest: { networkId: "testnet", receiverId: process.env.NEXT_PUBLIC_CONTRACT_ID ?? "", methodName: "create_release", args: { release_id: release.releaseId, recording_id: release.recordingId, funder_id: release.funderId, invited_owner_ids: release.invitedOwnerIds }, depositYocto: "0" } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "release_failed";
    return Response.json({ error: message }, { status: message === "ERR_CSRF_ORIGIN" ? 403 : 400 });
  }
}
