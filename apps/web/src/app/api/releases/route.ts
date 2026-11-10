import { upsertMembership } from "@royaltydesk/persistence";
import { requireOrigin } from "@/server/runtime";
import { currentUser, getAppDatabase } from "@/server/runtime";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const user = await currentUser();
    if (!user) return Response.json({ error: "ERR_UNAUTHORIZED" }, { status: 401 });
    const body = await request.json() as { releaseId?: unknown; funderId?: unknown };
    if (typeof body.releaseId !== "string" || typeof body.funderId !== "string") return Response.json({ error: "ERR_INPUT" }, { status: 400 });
    upsertMembership(getAppDatabase(), { releaseId: body.releaseId, accountId: user.accountId, role: "administrator", status: "accepted" });
    upsertMembership(getAppDatabase(), { releaseId: body.releaseId, accountId: body.funderId, role: "funder", status: body.funderId === user.accountId ? "accepted" : "invited" });
    return Response.json({ releaseId: body.releaseId, administratorId: user.accountId, funderId: body.funderId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "release_failed";
    return Response.json({ error: message }, { status: message === "ERR_CSRF_ORIGIN" ? 403 : 400 });
  }
}
