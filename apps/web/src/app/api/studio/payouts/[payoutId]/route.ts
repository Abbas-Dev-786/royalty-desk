import { currentUser } from "@/server/runtime";
import { studioContractClient } from "@/server/studio-catalogue";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ payoutId: string }> }): Promise<Response> {
  const user = await currentUser();
  if (!user) return Response.json({ error: "ERR_UNAUTHORIZED" }, { status: 401 });
  const { payoutId } = await context.params;
  if (!/^[a-zA-Z0-9-]{1,64}$/.test(payoutId)) return Response.json({ error: "ERR_INPUT" }, { status: 400 });
  try {
    const chain = studioContractClient();
    if (user.accountId !== await chain.admin()) return Response.json({ error: "ERR_FORBIDDEN" }, { status: 403 });
    return Response.json({ payout: await chain.payout(payoutId) }, { headers: { "cache-control": "no-store" } });
  } catch { return Response.json({ error: "CHAIN_UNAVAILABLE" }, { status: 503 }); }
}
