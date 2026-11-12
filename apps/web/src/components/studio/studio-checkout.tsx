"use client";

import { useEffect, useState } from "react";
import { walletConnector } from "@/components/wallet-session";
import { nearToYocto, yoctoToNear } from "@/lib/studio-money";

interface Order { readonly paymentId: string; readonly status: string; readonly amountYocto: string; readonly transactionHash: string | null; }
interface Quote { readonly order: Order; readonly transactionRequest: { readonly networkId: string; readonly receiverId: string; readonly methodName: "purchase" | "tip"; readonly args: Record<string, unknown>; readonly depositYocto: string } }

export function StudioCheckout({ workId, version, kind, priceYocto }: { readonly workId: string; readonly version: number; readonly kind: "song" | "album"; readonly priceYocto: string }) {
  const [tipNear, setTipNear] = useState("0.001");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [receiptHash, setReceiptHash] = useState<string | null>(null);
  const [orderIds, setOrderIds] = useState<{ purchase: string | null; tip: string | null }>({ purchase: null, tip: null });
  const storageKey = (paymentKind: "purchase" | "tip") => `studio-order:${workId}:${version}:${paymentKind}`;
  useEffect(() => { setOrderIds({ purchase: sessionStorage.getItem(storageKey("purchase")), tip: sessionStorage.getItem(storageKey("tip")) }); }, [workId, version]);

  function remember(paymentKind: "purchase" | "tip", paymentId: string | null): void {
    setOrderIds((previous) => ({ ...previous, [paymentKind]: paymentId }));
    if (paymentId) sessionStorage.setItem(storageKey(paymentKind), paymentId);
    else sessionStorage.removeItem(storageKey(paymentKind));
  }

  async function reconcile(paymentId: string, paymentKind: "purchase" | "tip"): Promise<Order> {
    const response = await fetch(`/api/studio/orders/${encodeURIComponent(paymentId)}`, { cache: "no-store" });
    const data = await response.json() as Order & { error?: string };
    if (!response.ok) {
      if (data.error === "ORDER_NOT_FOUND") remember(paymentKind, null);
      throw new Error(data.error === "ORDER_NOT_FOUND" ? "This saved order belongs to another wallet. Try again to create your own order." : data.error ?? "Could not check payment state");
    }
    setMessage(data.status === "finalized" ? "Payment confirmed on NEAR testnet." : data.status === "refunded" ? "This payment was refunded." : data.status === "failed" ? "Payment failed; no revenue was recorded." : `Payment state: ${data.status}. Keep this payment ID until it resolves.`);
    setReceiptHash(data.transactionHash);
    if (["failed", "expired"].includes(data.status) || paymentKind === "tip" && data.status === "finalized") remember(paymentKind, null);
    return data;
  }

  async function pay(paymentKind: "purchase" | "tip"): Promise<void> {
    setPending(true);
    setMessage("");
    try {
      const priorId = orderIds[paymentKind];
      if (priorId) {
        const previous = await reconcile(priorId, paymentKind);
        if (["submitted", "unknown", "refunded"].includes(previous.status) || paymentKind === "purchase" && previous.status === "finalized") return;
      }
      const wallet = await walletConnector().wallet();
      const sessionResponse = await fetch("/api/auth/me", { cache: "no-store" });
      if (!sessionResponse.ok) throw new Error("Connect your testnet wallet first.");
      const session = await sessionResponse.json() as { accountId: string };
      if (!(await wallet.getAccounts({ network: "testnet" })).some((account) => account.accountId === session.accountId)) throw new Error("The connected wallet differs from your signed-in account.");
      const body = { workId, version, kind: paymentKind, ...(paymentKind === "tip" ? { tipYocto: nearToYocto(tipNear) } : {}) };
      const quoteResponse = await fetch("/api/studio/orders", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const quote = await quoteResponse.json() as Quote & { error?: string };
      if (!quoteResponse.ok) throw new Error(quote.error ?? "Could not create checkout quote");
      const { order, transactionRequest: request } = quote;
      remember(paymentKind, order.paymentId);
      if (order.status !== "requested") { await reconcile(order.paymentId, paymentKind); return; }
      if (request.networkId !== "testnet" || request.methodName !== paymentKind || request.depositYocto !== order.amountYocto || !request.receiverId.endsWith(".testnet")) throw new Error("The wallet request does not match the quote.");
      setMessage(`Confirm ${paymentKind === "purchase" ? "purchase" : "tip"} of ${yoctoToNear(order.amountYocto)} NEAR to ${request.receiverId} in your wallet. Payment ID: ${order.paymentId}`);
      const outcome = await wallet.signAndSendTransaction({ signerId: session.accountId, receiverId: request.receiverId, network: "testnet", actions: [{ type: "FunctionCall", params: { methodName: request.methodName, args: request.args, gas: "100000000000000", deposit: request.depositYocto } }] });
      const transactionHash = outcome.transaction?.hash;
      setReceiptHash(transactionHash ?? null);
      if (!transactionHash) { setMessage(`Wallet outcome is uncertain. Check payment ${order.paymentId} before trying again.`); return; }
      const updated = await fetch(`/api/studio/orders/${encodeURIComponent(order.paymentId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ transactionHash }) });
      if (!updated.ok) throw new Error(`Transaction ${transactionHash} needs reconciliation. Check payment ${order.paymentId}.`);
      await reconcile(order.paymentId, paymentKind);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Payment could not be completed."); }
    finally { setPending(false); }
  }

  return <div className="studio-checkout">
    <button type="button" disabled={pending} onClick={() => void pay("purchase")}>Buy {kind} · {yoctoToNear(priceYocto)} NEAR</button>
    <label>Tip in NEAR <input inputMode="decimal" value={tipNear} onChange={(event) => setTipNear(event.target.value)} aria-label={`Tip amount for ${workId}`} /></label>
    <button type="button" disabled={pending} onClick={() => void pay("tip")}>Send tip</button>
    {orderIds.purchase && <button type="button" disabled={pending} onClick={() => void reconcile(orderIds.purchase!, "purchase")}>Check purchase</button>}
    {orderIds.tip && <button type="button" disabled={pending} onClick={() => void reconcile(orderIds.tip!, "tip")}>Check tip</button>}
    {message && <p role="status">{message}</p>}
    {receiptHash && <a href={`https://testnet.nearblocks.io/txns/${receiptHash}`} target="_blank" rel="noreferrer">View testnet receipt</a>}
  </div>;
}
