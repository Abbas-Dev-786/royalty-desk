import { revokeSession } from "@studio/persistence";
import { cookies } from "next/headers";
import { getAppDatabase, requireOrigin } from "@/server/runtime";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const cookieStore = await cookies();
    const token = cookieStore.get("studio_session")?.value;
    if (token) revokeSession(getAppDatabase(), token);
    cookieStore.delete("studio_session");
    return Response.json({ status: "ok" });
  } catch (error) {
    const message = error instanceof Error ? error.message : "logout_failed";
    return Response.json({ error: message }, { status: message === "ERR_CSRF_ORIGIN" ? 403 : 400 });
  }
}
