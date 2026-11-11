import { requireMembership } from "@/server/authorization";
import { requireOrigin } from "@/server/runtime";
import { getAppDatabase } from "@/server/runtime";
import { JsonRpcProvider } from "near-api-js";

type Action = "approve_settlement" | "dispute_settlement" | "clear_dispute" | "approve_cancellation" | "finalize_settlement" | "fund_settlement" | "execute_payout" | "withdraw_refundable";

export async function POST(request: Request, context: { params: Promise<{ releaseId: string }> }): Promise<Response> {
  try {
    requireOrigin(request);
    const { releaseId } = await context.params;
    const body = await request.json() as { action?: unknown; period?: unknown; digest?: unknown; reasonHash?: unknown; amountYocto?: unknown; ownerId?: unknown };
    if (typeof body.action !== "string" || !["approve_settlement", "dispute_settlement", "clear_dispute", "approve_cancellation", "finalize_settlement", "fund_settlement", "execute_payout", "withdraw_refundable"].includes(body.action) || typeof body.period !== "string") return Response.json({ error: "ERR_INPUT" }, { status: 400 });
    const action = body.action as Action;
    const role = action === "fund_settlement" || action === "withdraw_refundable" ? ["funder"] as const : action === "finalize_settlement" || action === "execute_payout" ? ["administrator", "owner", "funder"] as const : ["owner"] as const;
    const { accountId } = await requireMembership(releaseId, role);
    if (action === "approve_settlement" || action === "finalize_settlement") {
      const row = getAppDatabase().prepare("SELECT normalized_hash, validation_json FROM statement_imports WHERE release_id = ? AND period = ? ORDER BY CAST(revision AS INTEGER) DESC LIMIT 1").get(releaseId, body.period) as { normalized_hash: string; validation_json: string } | undefined;
      if (!row || (JSON.parse(row.validation_json) as { payable?: unknown }).payable !== true) return Response.json({ error: "ERR_EVIDENCE_NOT_PAYABLE" }, { status: 409 });
      const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID;
      if (!contractId?.endsWith(".testnet")) return Response.json({ error: "ERR_CONTRACT_CONFIG" }, { status: 503 });
      const chain = await new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com" }).callFunction<{ normalized_statement_hash: string }>({ contractId, method: "get_settlement", args: { release_id: releaseId, period: body.period } });
      if (!chain || chain.normalized_statement_hash !== row.normalized_hash) return Response.json({ error: "ERR_EVIDENCE_STALE" }, { status: 409 });
    }
    if (action === "approve_settlement" && typeof body.digest !== "string") return Response.json({ error: "ERR_DIGEST" }, { status: 400 });
    if (action === "dispute_settlement" && typeof body.reasonHash !== "string") return Response.json({ error: "ERR_REASON" }, { status: 400 });
    if (action === "fund_settlement" && (typeof body.amountYocto !== "string" || !/^\d+$/.test(body.amountYocto))) return Response.json({ error: "ERR_AMOUNT" }, { status: 400 });
    if (action === "execute_payout" && (typeof body.ownerId !== "string" || !/^[a-z0-9._-]+\.testnet$/.test(body.ownerId))) return Response.json({ error: "ERR_OWNER_ID" }, { status: 400 });
    const args = action === "approve_settlement" ? { release_id: releaseId, period: body.period, digest: body.digest } : action === "dispute_settlement" ? { release_id: releaseId, period: body.period, reason_hash: body.reasonHash } : action === "execute_payout" ? { release_id: releaseId, period: body.period, owner_id: body.ownerId } : { release_id: releaseId, period: body.period };
    return Response.json({ requestedBy: accountId, transactionRequest: { networkId: "testnet", receiverId: process.env.NEXT_PUBLIC_CONTRACT_ID ?? "", methodName: action, args, depositYocto: action === "fund_settlement" ? body.amountYocto : "0" } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "settlement_action_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : 403 });
  }
}
