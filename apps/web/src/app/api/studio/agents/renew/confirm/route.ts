import { JsonRpcProvider } from "near-api-js";
import { currentUser, requireOrigin } from "@/server/runtime";
import { openStudioCatalogueDatabase, studioContractClient } from "@/server/studio-catalogue";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const user = await currentUser();
    if (!user) return Response.json({ error: "ERR_UNAUTHORIZED" }, { status: 401 });
    const body = await request.json() as { accountId?: unknown; expiresAtMs?: unknown; maxActions?: unknown; transactionHash?: unknown };
    if (typeof body.accountId !== "string" || !/^[a-z0-9._-]+\.testnet$/.test(body.accountId) || !Number.isSafeInteger(body.expiresAtMs) || !Number.isSafeInteger(body.maxActions) || typeof body.transactionHash !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(body.transactionHash)) return Response.json({ error: "ERR_INPUT" }, { status: 400 });
    const chain = studioContractClient();
    if (await chain.guardian() !== user.accountId) return Response.json({ error: "ERR_FORBIDDEN" }, { status: 403 });
    const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" });
    const receipt = await provider.viewTransactionStatus({ txHash: body.transactionHash, accountId: user.accountId, waitUntil: "FINAL" });
    if (receipt.transaction.hash !== body.transactionHash || receipt.transaction.signer_id !== user.accountId || receipt.transaction.receiver_id !== chain.contractId || receipt.transaction.actions.length !== 1 || typeof receipt.status !== "object" || !("SuccessValue" in receipt.status || "SuccessReceiptId" in receipt.status)) throw new Error("ERR_RENEW_RECEIPT");
    const action = receipt.transaction.actions[0];
    if (!action || typeof action !== "object" || !("FunctionCall" in action) || action.FunctionCall.method_name !== "renew_agent" || action.FunctionCall.deposit !== "1") throw new Error("ERR_RENEW_ACTION");
    const args = JSON.parse(Buffer.from(action.FunctionCall.args, "base64").toString("utf8")) as { account_id?: unknown; expires_at_ms?: unknown; max_actions?: unknown };
    if (args.account_id !== body.accountId || args.expires_at_ms !== body.expiresAtMs || args.max_actions !== body.maxActions) throw new Error("ERR_RENEW_ARGUMENTS");
    const agent = await chain.agent(body.accountId);
    if (!agent?.active || agent.expires_at_ms !== body.expiresAtMs || agent.max_actions !== body.maxActions) throw new Error("ERR_RENEW_CHAIN_MISMATCH");
    const database = openStudioCatalogueDatabase();
    try {
      const result = database.prepare("UPDATE studio_agents SET expires_at_ms = ? WHERE account_id = ? AND active = 1 AND studio_id IN (SELECT id FROM studios WHERE admin_account_id = ?)").run(body.expiresAtMs, body.accountId, chain.contractId);
      if (result.changes !== 1) throw new Error("ERR_RENEW_LOCAL_AGENT_MISSING");
    } finally { database.close(); }
    return Response.json({ accountId: body.accountId, expiresAtMs: body.expiresAtMs, maxActions: body.maxActions, transactionHash: body.transactionHash });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "ERR_RENEW_CONFIRM" }, { status: 409 }); }
}
