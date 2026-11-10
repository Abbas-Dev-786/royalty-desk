import { revokeSession } from "@royaltydesk/persistence";
import { cookies } from "next/headers";
import { getAppDatabase, requireOrigin } from "@/server/runtime";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const cookieStore = await cookies();
    const token = cookieStore.get("royaltydesk_session")?.value;
    if (token) revokeSession(getAppDatabase(), token);
    cookieStore.delete("royaltydesk_session");
    return Response.json({ status: "ok" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "logout_failed";
    return Response.json({ error: message }, { status: message === "ERR_CSRF_ORIGIN" ? 403 : 400 });
  }
}
