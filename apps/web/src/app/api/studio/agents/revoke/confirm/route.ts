import { JsonRpcProvider } from "near-api-js";
import { currentUser, requireOrigin } from "@/server/runtime";
import { openStudioCatalogueDatabase, studioContractClient } from "@/server/studio-catalogue";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const user = await currentUser();
    if (!user) return Response.json({ error: "ERR_UNAUTHORIZED" }, { status: 401 });
    const body = await request.json() as { accountId?: unknown; transactionHash?: unknown };
    if (typeof body.accountId !== "string" || !/^[a-z0-9._-]+\.testnet$/.test(body.accountId) || typeof body.transactionHash !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(body.transactionHash)) return Response.json({ error: "ERR_INPUT" }, { status: 400 });
    const chain = studioContractClient();
    if (await chain.guardian() !== user.accountId) return Response.json({ error: "ERR_FORBIDDEN" }, { status: 403 });
    const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" });
    const receipt = await provider.viewTransactionStatus({ txHash: body.transactionHash, accountId: user.accountId, waitUntil: "FINAL" });
    if (receipt.transaction.hash !== body.transactionHash || receipt.transaction.signer_id !== user.accountId || receipt.transaction.receiver_id !== chain.contractId || receipt.transaction.actions.length !== 1 || typeof receipt.status !== "object" || !("SuccessValue" in receipt.status || "SuccessReceiptId" in receipt.status)) throw new Error("ERR_REVOKE_RECEIPT");
    const action = receipt.transaction.actions[0];
    if (!action || typeof action !== "object" || !("FunctionCall" in action) || action.FunctionCall.method_name !== "revoke_agent" || action.FunctionCall.deposit !== "1") throw new Error("ERR_REVOKE_ACTION");
    const args = JSON.parse(Buffer.from(action.FunctionCall.args, "base64").toString("utf8")) as { account_id?: unknown };
    if (args.account_id !== body.accountId) throw new Error("ERR_REVOKE_ARGUMENTS");
    const agent = await provider.callFunction<{ active: boolean }>({ contractId: chain.contractId, method: "get_agent", args: { account_id: body.accountId } });
    if (!agent || agent.active) throw new Error("ERR_REVOKE_CHAIN_MISMATCH");
    const database = openStudioCatalogueDatabase();
    try { database.prepare("UPDATE studio_agents SET active = 0, revoked_at_ms = ? WHERE account_id = ? AND active = 1 AND studio_id IN (SELECT id FROM studios WHERE admin_account_id = ?)").run(Date.now(), body.accountId, chain.contractId); }
    finally { database.close(); }
    return Response.json({ accountId: body.accountId, active: false, transactionHash: body.transactionHash });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "ERR_REVOKE_CONFIRM" }, { status: 409 }); }
}
