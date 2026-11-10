import { JsonRpcProvider } from "near-api-js";
import { requireMembership } from "@/server/authorization";
import { getAppDatabase, requireOrigin } from "@/server/runtime";

interface ChainAgreement { readonly version: string | number; readonly rules_hash: string; readonly document_hash: string; readonly approval_digest: string; }

export async function POST(request: Request, context: { params: Promise<{ releaseId: string }> }): Promise<Response> {
  try {
    requireOrigin(request);
    const { releaseId } = await context.params;
    const { accountId } = await requireMembership(releaseId, ["administrator"]);
    const body = await request.json() as { version?: unknown };
    if (typeof body.version !== "string" || !/^[1-9]\d*$/.test(body.version)) return Response.json({ error: "ERR_VERSION" }, { status: 400 });
    const row = getAppDatabase().prepare(`SELECT rules_hash, document_hash, approval_digest, status FROM agreement_drafts WHERE release_id = ? AND version = ?`).get(releaseId, body.version) as { rules_hash: string; document_hash: string; approval_digest: string; status: string } | undefined;
    if (!row) return Response.json({ error: "ERR_NOT_FOUND" }, { status: 404 });
    const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID;
    if (!contractId?.endsWith(".testnet")) return Response.json({ error: "ERR_CHAIN_CONFIG" }, { status: 503 });
    const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com" });
    const release = await provider.callFunction<{ administrator_id: string; agreements: readonly ChainAgreement[] }>({ contractId, method: "get_release", args: { release_id: releaseId } });
    if (release?.administrator_id !== accountId) return Response.json({ error: "ERR_CHAIN_AUTHORITY" }, { status: 403 });
    const matching = release?.agreements.find((entry) => String(entry.version) === body.version);
    if (!matching || matching.rules_hash !== row.rules_hash || matching.document_hash !== row.document_hash || matching.approval_digest !== row.approval_digest) return Response.json({ error: "ERR_CHAIN_AGREEMENT_MISMATCH" }, { status: 409 });
    getAppDatabase().prepare(`UPDATE agreement_drafts SET status = 'frozen' WHERE release_id = ? AND version = ? AND status = 'draft'`).run(releaseId, body.version);
    return Response.json({ version: body.version, approvalDigest: row.approval_digest, status: "frozen", confirmedFrom: contractId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "agreement_confirmation_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 400 });
  }
}
