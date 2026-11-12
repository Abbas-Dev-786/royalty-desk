import { JsonRpcProvider } from "near-api-js";
import { addStudioPolicy } from "@royaltydesk/persistence";
import { requireOrigin } from "@/server/runtime";
import { requireStudioAdmin } from "@/server/studio-admin";
import { openStudioCatalogueDatabase, studioContractClient } from "@/server/studio-catalogue";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const { accountId, studioId } = await requireStudioAdmin();
    const body = await request.json() as { transactionHash?: unknown };
    if (typeof body.transactionHash !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(body.transactionHash)) return Response.json({ error: "ERR_POLICY_TX" }, { status: 400 });
    const chain = studioContractClient();
    const rpc = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" });
    const receipt = await rpc.viewTransactionStatus({ txHash: body.transactionHash, accountId, waitUntil: "FINAL" });
    if (receipt.transaction.signer_id !== accountId || receipt.transaction.receiver_id !== chain.contractId || receipt.transaction.hash !== body.transactionHash || typeof receipt.status !== "object" || !("SuccessValue" in receipt.status || "SuccessReceiptId" in receipt.status) || receipt.transaction.actions.length !== 1) throw new Error("ERR_POLICY_RECEIPT");
    const action = receipt.transaction.actions[0];
    if (!action || typeof action !== "object" || !("FunctionCall" in action) || action.FunctionCall.method_name !== "set_policy" || action.FunctionCall.deposit !== "1") throw new Error("ERR_POLICY_ACTION");
    const decoded = JSON.parse(Buffer.from(action.FunctionCall.args, "base64").toString("utf8")) as { input?: { epoch?: unknown; human_review?: unknown; paused?: unknown; max_price_yocto?: unknown; max_tip_yocto?: unknown } };
    const input = decoded.input;
    if (!input || !Number.isSafeInteger(input.epoch) || typeof input.human_review !== "boolean" || typeof input.paused !== "boolean") throw new Error("ERR_POLICY_ARGUMENTS");
    const policy = await chain.policy();
    if (policy.epoch !== input.epoch || policy.human_review !== input.human_review || policy.paused !== input.paused || policy.max_price_yocto !== input.max_price_yocto || policy.max_tip_yocto !== input.max_tip_yocto) throw new Error("ERR_POLICY_CHAIN_MISMATCH");
    const database = openStudioCatalogueDatabase();
    try {
      const last = database.prepare("SELECT version, mode, max_generation_calls, max_music_request_duration_ms, max_music_total_duration_ms, max_payout_yocto, paused FROM studio_policies WHERE studio_id = ? ORDER BY version DESC LIMIT 1").get(studioId) as { version: number; mode: string; max_generation_calls: number; max_music_request_duration_ms: number; max_music_total_duration_ms: number; max_payout_yocto: string; paused: number } | undefined;
      if (!last) throw new Error("ERR_LOCAL_POLICY_MISSING");
      if (last.version === policy.epoch) {
        if (last.mode !== (policy.human_review ? "human_review" : "autonomous") || Boolean(last.paused) !== policy.paused) throw new Error("ERR_LOCAL_POLICY_MISMATCH");
      } else if (last.version + 1 === policy.epoch) {
        addStudioPolicy(database, { studioId, version: policy.epoch, mode: policy.human_review ? "human_review" : "autonomous", maxGenerationCalls: last.max_generation_calls, maxMusicRequestDurationMs: last.max_music_request_duration_ms, maxMusicTotalDurationMs: last.max_music_total_duration_ms, maxPayoutYocto: last.max_payout_yocto, paused: policy.paused });
      } else throw new Error("ERR_POLICY_EPOCH_GAP");
      return Response.json({ epoch: policy.epoch, mode: policy.human_review ? "human_review" : "autonomous", paused: policy.paused }, { headers: { "cache-control": "no-store" } });
    } finally { database.close(); }
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERR_POLICY_CONFIRM";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 409 });
  }
}
