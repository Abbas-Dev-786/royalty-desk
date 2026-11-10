import { issueWalletChallenge } from "@/server/auth";
import { requireOrigin } from "@/server/runtime";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const body = await request.json() as { accountId?: unknown };
    const accountId = typeof body.accountId === "string" ? body.accountId : undefined;
    const challenge = issueWalletChallenge(request, accountId);
    return Response.json({ nonce: challenge.nonceBytes, message: challenge.message, recipient: challenge.domain, networkId: challenge.networkId, issuedAtMs: challenge.issuedAtMs, expiresAtMs: challenge.expiresAtMs });
  } catch (error) {
    const message = error instanceof Error ? error.message : "challenge_failed";
    return Response.json({ error: message }, { status: message === "ERR_CSRF_ORIGIN" ? 403 : 400 });
  }
}
