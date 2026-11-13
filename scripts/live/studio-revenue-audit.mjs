import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { JsonRpcProvider } from "near-api-js";
import { resolve } from "node:path";

const contractId = process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID;
if (!contractId?.endsWith(".testnet")) throw new Error("Studio contract is not configured");
const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" });
const app = new DatabaseSync(resolve(process.env.STUDIO_APP_DB_PATH ?? "data/studio-app.sqlite"), { readOnly: true });
const studio = new DatabaseSync(resolve(process.env.STUDIO_CATALOGUE_DB_PATH ?? "private/studio-v2/phase05/studio.sqlite"), { readOnly: true });
const digest = (value) => createHash("sha256").update(value).digest("hex");

async function retryRead(read) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try { return await read(); }
    catch (error) { lastError = error; await new Promise((done) => setTimeout(done, 1_500 * (attempt + 1))); }
  }
  throw lastError;
}

try {
  const orders = app.prepare("SELECT payment_id, work_id, work_version, buyer_account_id, kind, amount_yocto, commitment FROM studio_orders WHERE status = 'finalized' ORDER BY created_at_ms").all();
  const payouts = studio.prepare("SELECT logical_key, provider_request_id FROM studio_external_operations WHERE operation_type = 'chain_auto_payout' AND status = 'finalized' ORDER BY created_at_ms").all();
  for (const order of orders) {
    const payment = await retryRead(() => provider.callFunction({ contractId, method: "get_payment", args: { payment_id: order.payment_id } }));
    assert.ok(payment, `Missing on-chain payment ${order.payment_id}`);
    assert.equal(payment.status, "finalized");
    assert.equal(payment.allocated_yocto, payment.gross_yocto);
    assert.equal(payment.work_id, order.work_id);
    assert.equal(payment.version, order.work_version);
    assert.equal(payment.buyer_id, order.buyer_account_id);
    assert.equal(payment.kind, order.kind);
    assert.equal(payment.gross_yocto, order.amount_yocto);
    assert.equal(payment.commitment, order.commitment);
    const allocation = studio.prepare("SELECT status, provider_request_id FROM studio_external_operations WHERE id = ?").get(digest(`allocation-auto:${order.payment_id}`));
    assert.equal(allocation?.status, "finalized");
    assert.ok(allocation.provider_request_id, "Allocation receipt hash missing");
  }
  for (const entry of payouts) {
    const payoutId = entry.logical_key.split(":").at(-1);
    assert.ok(payoutId && entry.provider_request_id, "Payout journal is incomplete");
    const payout = await retryRead(() => provider.callFunction({ contractId, method: "get_payout", args: { payout_id: payoutId } }));
    assert.equal(payout?.status, "paid", `Payout ${payoutId} is not paid`);
    assert.ok(BigInt(payout.amount_yocto) > 0n);
    assert.equal(entry.logical_key, `payout-auto:${payout.recipient_id}:${payoutId}`);
  }
  console.log(JSON.stringify({ status: "pass", contractId, finalizedOrders: orders.length, fullyAllocated: orders.length, paidAgentPayouts: payouts.length }));
} finally { app.close(); studio.close(); }
