import { verifyWalletChallenge } from "@/server/auth";
import { requireOrigin } from "@/server/runtime";
import { cookies } from "next/headers";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const body = await request.json() as { nonce?: unknown; accountId?: unknown; publicKey?: unknown; signature?: unknown };
    if (typeof body.nonce !== "string" || typeof body.accountId !== "string" || typeof body.publicKey !== "string" || typeof body.signature !== "string") return Response.json({ error: "ERR_AUTH_INPUT" }, { status: 400 });
    const result = await verifyWalletChallenge({ nonce: body.nonce, accountId: body.accountId, publicKey: body.publicKey, signature: body.signature }, request);
    const cookieStore = await cookies();
    cookieStore.set("royaltydesk_session", result.token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: new Date(result.expiresAtMs) });
    return Response.json({ accountId: result.account });
  } catch (error) {
    const message = error instanceof Error ? error.message : "verification_failed";
    return Response.json({ error: message }, { status: message === "ERR_CSRF_ORIGIN" ? 403 : 401 });
  }
}
