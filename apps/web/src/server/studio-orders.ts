import "server-only";
import { randomUUID } from "node:crypto";
import { JsonRpcProvider } from "near-api-js";
import { StudioContractClient } from "@studio/chain";
import { getAppDatabase } from "./runtime";
import { listCatalogue } from "./studio-catalogue";

export interface StudioOrder { readonly paymentId: string; readonly workId: string; readonly workVersion: number; readonly buyerAccountId: string; readonly kind: "purchase" | "tip"; readonly amountYocto: string; readonly commitment: string; readonly quoteExpiresAtMs: number; readonly status: string; readonly transactionHash: string | null; }
interface OrderRow { readonly payment_id: string; readonly work_id: string; readonly work_version: number; readonly buyer_account_id: string; readonly kind: "purchase" | "tip"; readonly amount_yocto: string; readonly commitment: string; readonly quote_expires_at_ms: number; readonly status: string; readonly transaction_hash: string | null; }
const idPattern = /^[a-z0-9._-]+\.testnet$/;
const amountPattern = /^(0|[1-9][0-9]*)$/;
const hashPattern = /^[1-9A-HJ-NP-Za-km-z]{32,64}$/;
function client(): StudioContractClient {
  const contractId = process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID;
  if (!contractId || !idPattern.test(contractId) || contractId === "studio.example.testnet") throw new Error("STUDIO_CONTRACT_NOT_CONFIGURED");
  return new StudioContractClient(contractId, new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" }));
}
function toOrder(row: OrderRow): StudioOrder { return { paymentId: row.payment_id, workId: row.work_id, workVersion: row.work_version, buyerAccountId: row.buyer_account_id, kind: row.kind, amountYocto: row.amount_yocto, commitment: row.commitment, quoteExpiresAtMs: row.quote_expires_at_ms, status: row.status, transactionHash: row.transaction_hash }; }
function rowFor(paymentId: string, accountId: string): OrderRow {
  const row = getAppDatabase().prepare("SELECT * FROM studio_orders WHERE payment_id = ? AND buyer_account_id = ?").get(paymentId, accountId) as OrderRow | undefined;
  if (!row) throw new Error("ORDER_NOT_FOUND");
  return row;
}
async function receiptState(row: OrderRow, contractId: string): Promise<"success" | "failure" | "unavailable"> {
  if (!row.transaction_hash) return "unavailable";
  let receipt;
  try { receipt = await new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" }).viewTransactionStatus({ txHash: row.transaction_hash, accountId: row.buyer_account_id, waitUntil: "FINAL" }); }
  catch { return "unavailable"; }
  if (receipt.transaction.hash !== row.transaction_hash || receipt.transaction.signer_id !== row.buyer_account_id || receipt.transaction.receiver_id !== contractId || receipt.transaction.actions.length !== 1) throw new Error("ORDER_RECEIPT_MISMATCH");
  const action = receipt.transaction.actions[0];
  if (!action || typeof action !== "object" || !("FunctionCall" in action) || action.FunctionCall.method_name !== row.kind || action.FunctionCall.deposit !== row.amount_yocto) throw new Error("ORDER_RECEIPT_MISMATCH");
  let args: { payment_id?: unknown; work_id?: unknown; version?: unknown; commitment?: unknown; quote_expires_at_ms?: unknown };
  try { args = JSON.parse(Buffer.from(action.FunctionCall.args, "base64").toString("utf8")) as typeof args; }
  catch { throw new Error("ORDER_RECEIPT_MISMATCH"); }
  if (args.payment_id !== row.payment_id || args.work_id !== row.work_id || args.version !== row.work_version || args.commitment !== row.commitment || args.quote_expires_at_ms !== row.quote_expires_at_ms) throw new Error("ORDER_RECEIPT_MISMATCH");
  return typeof receipt.status === "object" && "Failure" in receipt.status ? "failure" : typeof receipt.status === "object" && ("SuccessValue" in receipt.status || "SuccessReceiptId" in receipt.status) ? "success" : "unavailable";
}
export async function quoteStudioOrder(input: { readonly workId: string; readonly version: number; readonly buyerAccountId: string; readonly kind: "purchase" | "tip"; readonly tipYocto?: string }): Promise<StudioOrder> {
  const item = (await listCatalogue()).find((candidate) => candidate.workId === input.workId && candidate.version === input.version);
  if (!item) throw new Error("WORK_NOT_PUBLISHED");
  const policy = await client().policy();
  if (policy.paused) throw new Error("STUDIO_PAUSED");
  const amount = input.kind === "purchase" ? item.priceYocto : input.tipYocto;
  if (!amount || !amountPattern.test(amount)) throw new Error("AMOUNT_INVALID");
  if (input.kind === "tip" && (BigInt(amount) < 1_000_000_000_000_000_000_000n || BigInt(amount) > BigInt(policy.max_tip_yocto))) throw new Error("TIP_OUT_OF_RANGE");
  const database = getAppDatabase();
  const existing = database.prepare("SELECT * FROM studio_orders WHERE buyer_account_id = ? AND work_id = ? AND work_version = ? AND kind = ? AND amount_yocto = ? AND status IN ('requested','submitted','unknown') ORDER BY created_at_ms DESC LIMIT 1").get(input.buyerAccountId, item.workId, item.version, input.kind, amount) as OrderRow | undefined;
  if (existing) {
    const reconciled = await reconcileStudioOrder(existing.payment_id, input.buyerAccountId);
    if (reconciled.status === "finalized" || reconciled.status === "refunded" || reconciled.status === "submitted" || reconciled.status === "unknown" || reconciled.quoteExpiresAtMs > Date.now()) return reconciled;
    database.prepare("UPDATE studio_orders SET status = 'expired', updated_at_ms = ? WHERE payment_id = ? AND status = 'requested'").run(Date.now(), existing.payment_id);
  }
  const paymentId = randomUUID();
  const now = Date.now();
  const expiry = now + 240_000;
  database.prepare("INSERT INTO studio_orders(payment_id, work_id, work_version, buyer_account_id, kind, amount_yocto, commitment, quote_expires_at_ms, status, transaction_hash, created_at_ms, updated_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'requested', NULL, ?, ?)").run(paymentId, item.workId, item.version, input.buyerAccountId, input.kind, amount, item.commitment, expiry, now, now);
  return toOrder(rowFor(paymentId, input.buyerAccountId));
}
export function markStudioOrderSubmitted(paymentId: string, accountId: string, transactionHash: string): StudioOrder {
  if (!hashPattern.test(transactionHash)) throw new Error("TRANSACTION_HASH_INVALID");
  const row = rowFor(paymentId, accountId);
  if (!new Set(["requested", "submitted", "unknown"]).has(row.status)) throw new Error("ORDER_NOT_PENDING");
  if (row.transaction_hash && row.transaction_hash !== transactionHash) throw new Error("ORDER_TRANSACTION_MISMATCH");
  getAppDatabase().prepare("UPDATE studio_orders SET status = 'submitted', transaction_hash = ?, updated_at_ms = ? WHERE payment_id = ?").run(transactionHash, Date.now(), paymentId);
  return toOrder(rowFor(paymentId, accountId));
}
export async function reconcileStudioOrder(paymentId: string, accountId: string): Promise<StudioOrder> {
  const row = rowFor(paymentId, accountId);
  if (row.status === "refunded" || row.status === "failed" || row.status === "expired") return toOrder(row);
  const chain = client();
  const receipt = await receiptState(row, chain.contractId);
  if (receipt === "failure") {
    getAppDatabase().prepare("UPDATE studio_orders SET status = 'failed', updated_at_ms = ? WHERE payment_id = ?").run(Date.now(), paymentId);
    return toOrder(rowFor(paymentId, accountId));
  }
  const payment = await chain.payment(paymentId);
  if (payment) {
    if (payment.buyer_id !== accountId || payment.work_id !== row.work_id || payment.version !== row.work_version || payment.kind !== row.kind || payment.gross_yocto !== row.amount_yocto || payment.commitment !== row.commitment) throw new Error("ORDER_CHAIN_MISMATCH");
    const status = row.transaction_hash && receipt !== "success" ? "unknown" : payment.status === "refunded" ? "refunded" : payment.status === "finalized" ? "finalized" : "unknown";
    getAppDatabase().prepare("UPDATE studio_orders SET status = ?, updated_at_ms = ? WHERE payment_id = ?").run(status, Date.now(), paymentId);
    return toOrder(rowFor(paymentId, accountId));
  }
  if (row.transaction_hash) getAppDatabase().prepare("UPDATE studio_orders SET status = 'unknown', updated_at_ms = ? WHERE payment_id = ?").run(Date.now(), paymentId);
  else if (row.quote_expires_at_ms < Date.now() && row.status === "requested") getAppDatabase().prepare("UPDATE studio_orders SET status = 'expired', updated_at_ms = ? WHERE payment_id = ?").run(Date.now(), paymentId);
  return toOrder(rowFor(paymentId, accountId));
}
