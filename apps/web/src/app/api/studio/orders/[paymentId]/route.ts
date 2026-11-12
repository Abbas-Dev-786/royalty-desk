import { currentUser, requireOrigin } from "@/server/runtime";
import { markStudioOrderSubmitted, reconcileStudioOrder } from "@/server/studio-orders";

export async function GET(_: Request, context: { params: Promise<{ paymentId: string }> }): Promise<Response> {
  try {
    const user = await currentUser();
    if (!user) return Response.json({ error: "ERR_UNAUTHORIZED" }, { status: 401 });
    return Response.json(await reconcileStudioOrder((await context.params).paymentId, user.accountId), { headers: { "cache-control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "ORDER_RECONCILE_FAILED" }, { status: 409 }); }
}
export async function PATCH(request: Request, context: { params: Promise<{ paymentId: string }> }): Promise<Response> {
  try {
    requireOrigin(request);
    const user = await currentUser();
    if (!user) return Response.json({ error: "ERR_UNAUTHORIZED" }, { status: 401 });
    const body = await request.json() as { transactionHash?: unknown };
    if (typeof body.transactionHash !== "string") return Response.json({ error: "ERR_INPUT" }, { status: 400 });
    markStudioOrderSubmitted((await context.params).paymentId, user.accountId, body.transactionHash);
    return Response.json(await reconcileStudioOrder((await context.params).paymentId, user.accountId), { headers: { "cache-control": "no-store" } });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "ORDER_SUBMIT_FAILED" }, { status: 409 }); }
}
