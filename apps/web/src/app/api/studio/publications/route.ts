import { JsonRpcProvider } from "near-api-js";
import { addStudioPublication, recordStudioPublicationReceipt } from "@royaltydesk/persistence";
import { currentUser, requireOrigin } from "@/server/runtime";
import { openStudioCatalogueDatabase, studioContractClient } from "@/server/studio-catalogue";

export async function POST(request: Request): Promise<Response> {
  try {
    requireOrigin(request);
    const user = await currentUser();
    if (!user) return Response.json({ error: "ERR_UNAUTHORIZED" }, { status: 401 });
    const body = await request.json() as { workId?: unknown; version?: unknown; transactionHash?: unknown };
    if (typeof body.workId !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(body.workId) || !Number.isSafeInteger(body.version) || typeof body.transactionHash !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(body.transactionHash)) return Response.json({ error: "ERR_INPUT" }, { status: 400 });
    const version = Number(body.version);
    const client = studioContractClient();
    const rpc = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" });
    const receipt = await rpc.viewTransactionStatus({ txHash: body.transactionHash, accountId: user.accountId, waitUntil: "FINAL" });
    if (receipt.transaction.hash !== body.transactionHash || receipt.transaction.signer_id !== user.accountId || receipt.transaction.receiver_id !== client.contractId || typeof receipt.status !== "object" || !("SuccessValue" in receipt.status || "SuccessReceiptId" in receipt.status)) throw new Error("PUBLICATION_RECEIPT_INVALID");
    const action = receipt.transaction.actions.find((entry) => typeof entry === "object" && entry !== null && "FunctionCall" in entry && entry.FunctionCall.method_name === "publish_release");
    if (!action || typeof action !== "object" || !("FunctionCall" in action) || receipt.transaction.actions.length !== 1 || action.FunctionCall.deposit !== "0") throw new Error("PUBLICATION_ACTION_INVALID");
    const args = JSON.parse(Buffer.from(action.FunctionCall.args, "base64").toString("utf8")) as { work_id?: unknown; version?: unknown; commitment?: unknown; policy_epoch?: unknown };
    if (args.work_id !== body.workId || args.version !== version || typeof args.commitment !== "string" || !Number.isSafeInteger(args.policy_epoch)) throw new Error("PUBLICATION_ARGUMENTS_MISMATCH");
    const logs = [receipt.transaction_outcome, ...receipt.receipts_outcome].flatMap((outcome) => outcome.outcome.logs);
    const event = logs.some((log) => {
      if (!log.startsWith("EVENT_JSON:")) return false;
      try { const parsed = JSON.parse(log.slice(11)) as { event?: string; data?: { work_id?: string; version?: number; commitment?: string }[] }; return parsed.event === "release_published" && parsed.data?.some((entry) => entry.work_id === body.workId && entry.version === version && entry.commitment === args.commitment) === true; }
      catch { return false; }
    });
    if (!event) throw new Error("PUBLICATION_EVENT_MISSING");
    const chain = await client.release(body.workId, version);
    if (!chain?.published || chain.commitment !== args.commitment || chain.policy_epoch !== args.policy_epoch) throw new Error("PUBLICATION_CHAIN_MISMATCH");
    const database = openStudioCatalogueDatabase();
    try {
      const local = database.prepare("SELECT v.asset_hash, v.metadata_hash, v.price_yocto, w.studio_id FROM studio_work_versions v JOIN studio_works w ON w.id = v.work_id WHERE v.work_id = ? AND v.version = ?").get(body.workId, version) as { asset_hash: string; metadata_hash: string; price_yocto: string; studio_id: string } | undefined;
      const studio = local && database.prepare("SELECT admin_account_id FROM studios WHERE id = ?").get(local.studio_id) as { admin_account_id: string } | undefined;
      const agent = local && database.prepare("SELECT role FROM studio_agents WHERE studio_id = ? AND account_id = ? AND active = 1").get(local.studio_id, user.accountId) as { role: string } | undefined;
      if (!local || !studio || (studio.admin_account_id !== user.accountId && agent?.role !== "producer") || chain.media_hash !== local.asset_hash || chain.metadata_hash !== local.metadata_hash || chain.price_yocto !== local.price_yocto) throw new Error("PUBLICATION_LOCAL_MISMATCH");
      const existing = database.prepare("SELECT chain_commitment, chain_tx_hash FROM studio_publications WHERE work_id = ? AND work_version = ?").get(body.workId, version) as { chain_commitment: string; chain_tx_hash: string | null } | undefined;
      if (!existing) addStudioPublication(database, { workId: body.workId, workVersion: version, chainCommitment: chain.commitment, policyVersion: chain.policy_epoch });
      recordStudioPublicationReceipt(database, { workId: body.workId, workVersion: version, chainCommitment: chain.commitment, transactionHash: body.transactionHash, signerAccountId: user.accountId });
      return Response.json({ workId: body.workId, version, commitment: chain.commitment, transactionHash: body.transactionHash }, { headers: { "cache-control": "no-store" } });
    } finally { database.close(); }
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "PUBLICATION_FAILED" }, { status: 409 }); }
}
