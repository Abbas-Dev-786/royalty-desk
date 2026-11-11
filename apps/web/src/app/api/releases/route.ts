import { requireOrigin } from "@/server/runtime";
import { currentUser, getAppDatabase } from "@/server/runtime";
import { parseReleaseDefinition } from "@royaltydesk/domain";

export async function GET(): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ error: "ERR_UNAUTHORIZED" }, { status: 401 });
  const rows = getAppDatabase().prepare("SELECT release_id, role, status FROM release_memberships WHERE account_id = ? AND status != 'revoked' ORDER BY release_id, role").all(user.accountId) as unknown as readonly { release_id: string; role: string; status: string }[];
  const releases = new Map<string, { releaseId: string; roles: string[]; invited: boolean }>();
  for (const row of rows) {
    const entry = releases.get(row.release_id) ?? { releaseId: row.release_id, roles: [], invited: false };
    entry.roles.push(row.role);
    entry.invited ||= row.status === "invited" && row.role === "owner";
    releases.set(row.release_id, entry);
  }
  return Response.json([...releases.values()]);
}

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const user = await currentUser();
    if (!user) return Response.json({ error: "ERR_UNAUTHORIZED" }, { status: 401 });
    const body = await request.json() as { releaseId?: unknown; recordingId?: unknown; funderId?: unknown; invitedOwnerIds?: unknown };
    if (!Array.isArray(body.invitedOwnerIds) || body.invitedOwnerIds.length < 2 || body.invitedOwnerIds.length > 5) return Response.json({ error: "ERR_INPUT" }, { status: 400 });
    const release = parseReleaseDefinition({ ...body, administratorId: user.accountId });
    if (getAppDatabase().prepare("SELECT 1 FROM release_memberships WHERE release_id = ? LIMIT 1").get(release.releaseId)) return Response.json({ error: "ERR_RELEASE_EXISTS" }, { status: 409 });
    return Response.json({ releaseId: release.releaseId, administratorId: user.accountId, funderId: release.funderId, transactionRequest: { networkId: "testnet", receiverId: process.env.NEXT_PUBLIC_CONTRACT_ID ?? "", methodName: "create_release", args: { release_id: release.releaseId, recording_id: release.recordingId, funder_id: release.funderId, invited_owner_ids: release.invitedOwnerIds }, depositYocto: "0" } }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "release_failed";
    return Response.json({ error: message }, { status: message === "ERR_CSRF_ORIGIN" ? 403 : 400 });
  }
}
