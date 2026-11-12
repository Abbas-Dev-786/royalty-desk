import { currentUser, requireOrigin } from "@/server/runtime";
import { quoteStudioOrder } from "@/server/studio-orders";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const user = await currentUser();
    if (!user) return Response.json({ error: "ERR_UNAUTHORIZED" }, { status: 401 });
    const body = await request.json() as { workId?: unknown; version?: unknown; kind?: unknown; tipYocto?: unknown };
    if (typeof body.workId !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(body.workId) || !Number.isSafeInteger(body.version) || Number(body.version) < 1 || (body.kind !== "purchase" && body.kind !== "tip") || (body.tipYocto !== undefined && typeof body.tipYocto !== "string")) return Response.json({ error: "ERR_INPUT" }, { status: 400 });
    const order = await quoteStudioOrder({ workId: body.workId, version: Number(body.version), buyerAccountId: user.accountId, kind: body.kind, ...(typeof body.tipYocto === "string" ? { tipYocto: body.tipYocto } : {}) });
    return Response.json({ order, transactionRequest: { networkId: "testnet", receiverId: process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID, methodName: order.kind === "purchase" ? "purchase" : "tip", args: { payment_id: order.paymentId, work_id: order.workId, version: order.workVersion, commitment: order.commitment, quote_expires_at_ms: order.quoteExpiresAtMs }, depositYocto: order.amountYocto } }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "ORDER_QUOTE_FAILED" }, { status: 409 }); }
}
