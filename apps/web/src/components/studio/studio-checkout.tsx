"use client";

import { useEffect, useState } from "react";
import { walletConnector } from "@/components/wallet-session";
import { nearToYocto, yoctoToNear } from "@/lib/studio-money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StudioNotice, type StudioNoticeData, type StudioNoticeTone } from "./studio-notice";
import { notifyStudio } from "./studio-notifications";

interface Order { readonly paymentId: string; readonly status: string; readonly amountYocto: string; readonly transactionHash: string | null; }
interface Quote { readonly order: Order; readonly transactionRequest: { readonly networkId: string; readonly receiverId: string; readonly methodName: "purchase" | "tip"; readonly args: Record<string, unknown>; readonly depositYocto: string } }

export function StudioCheckout({ workId, version, kind, priceYocto }: { readonly workId: string; readonly version: number; readonly kind: "song" | "album"; readonly priceYocto: string }) {
  const [tipNear, setTipNear] = useState("0.001");
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState<StudioNoticeData | null>(null);
  const [showDownloadRefresh, setShowDownloadRefresh] = useState(false);
  const [receiptHash, setReceiptHash] = useState<string | null>(null);
  const [orderIds, setOrderIds] = useState<{ purchase: string | null; tip: string | null }>({ purchase: null, tip: null });
  const storageKey = (paymentKind: "purchase" | "tip") => `studio-order:${workId}:${version}:${paymentKind}`;
  const showNotice = (tone: StudioNoticeTone, title: string, description: string) => setNotice({ tone, title, description });
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
    if (data.status === "finalized") {
      showNotice("success", paymentKind === "purchase" ? "Purchase confirmed" : "Tip sent", paymentKind === "purchase" ? "Your payment is confirmed on NEAR testnet. Refresh this page to show your MP3 download." : "Your tip is confirmed on NEAR testnet. The studio will allocate it to the credited agents.");
      if (paymentKind === "purchase") setShowDownloadRefresh(true);
      notifyStudio({ id: `payment-${paymentId}`, tone: "success", title: paymentKind === "purchase" ? "Purchase confirmed" : "Tip sent", description: `${yoctoToNear(data.amountYocto)} testnet NEAR confirmed.` });
    } else if (data.status === "refunded") showNotice("warning", "Payment refunded", "The payment was returned. No download is unlocked by this order.");
    else if (data.status === "failed" || data.status === "expired") showNotice("error", "Payment did not complete", "No creator revenue was recorded. Check your wallet before starting a new payment.");
    else showNotice("warning", "Payment still being checked", `Order ${paymentId} is ${data.status}. Use the check payment button before trying again.`);
    setReceiptHash(data.transactionHash);
    if (["failed", "expired"].includes(data.status) || paymentKind === "tip" && data.status === "finalized") remember(paymentKind, null);
    return data;
  }

  async function checkOrder(paymentId: string, paymentKind: "purchase" | "tip"): Promise<void> {
    setPending(true);
    showNotice("progress", "Checking payment", "Looking up the saved order on NEAR testnet.");
    try { await reconcile(paymentId, paymentKind); }
    catch (error) { showNotice("error", "Could not check payment", error instanceof Error ? error.message : "Try again in a moment. Do not start another payment until this order is resolved."); }
    finally { setPending(false); }
  }

  async function pay(paymentKind: "purchase" | "tip"): Promise<void> {
    setPending(true);
    setNotice(null);
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
      showNotice("progress", "Confirm in your wallet", `Approve ${yoctoToNear(order.amountYocto)} testnet NEAR for this ${paymentKind}. Order ${order.paymentId} is saved so its status can be checked safely.`);
      const outcome = await wallet.signAndSendTransaction({ signerId: session.accountId, receiverId: request.receiverId, network: "testnet", actions: [{ type: "FunctionCall", params: { methodName: request.methodName, args: request.args, gas: "100000000000000", deposit: request.depositYocto } }] });
      const transactionHash = outcome.transaction?.hash;
      setReceiptHash(transactionHash ?? null);
      if (!transactionHash) { showNotice("warning", "Wallet result is uncertain", `Check order ${order.paymentId} and your wallet receipt before trying to pay again.`); return; }
      const updated = await fetch(`/api/studio/orders/${encodeURIComponent(order.paymentId)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ transactionHash }) });
      if (!updated.ok) throw new Error(`Transaction ${transactionHash} needs reconciliation. Check payment ${order.paymentId}.`);
      await reconcile(order.paymentId, paymentKind);
    } catch (error) {
      const description = error instanceof Error ? error.message : "Check your wallet and try again.";
      const uncertain = description.includes("needs reconciliation") || description.includes("outcome is uncertain") || description.includes("Check payment");
      showNotice(uncertain ? "warning" : "error", uncertain ? "Payment needs a status check" : "Payment could not be completed", /^ERR_[A-Z0-9_]+$/.test(description) ? `Please check this order before trying again. Support code: ${description}.` : description);
    }
    finally { setPending(false); }
  }

  return <div className="studio-checkout"><p className="checkout-intro">Listen for free. Buy to keep the MP3, or tip the agents who made it.</p>
    <Button type="button" disabled={pending} onClick={() => void pay("purchase")}>Buy {kind} · {yoctoToNear(priceYocto)} testnet NEAR</Button>
    <label htmlFor="studio-tip">Tip amount <Input id="studio-tip" inputMode="decimal" value={tipNear} onChange={(event) => setTipNear(event.target.value)} aria-label={`Tip amount for ${workId}`} /> NEAR</label>
    <Button type="button" variant="outline" className="checkout-tip-button" disabled={pending} onClick={() => void pay("tip")}>Send tip</Button>
    {orderIds.purchase && <Button type="button" variant="ghost" disabled={pending} onClick={() => void checkOrder(orderIds.purchase!, "purchase")}>Check purchase</Button>}
    {orderIds.tip && <Button type="button" variant="ghost" disabled={pending} onClick={() => void checkOrder(orderIds.tip!, "tip")}>Check tip</Button>}
    {notice && <StudioNotice notice={notice} className="checkout-notice">{showDownloadRefresh && notice.title === "Purchase confirmed" && <Button type="button" variant="outline" className="checkout-download-refresh" onClick={() => window.location.reload()}>Show my download</Button>}</StudioNotice>}
    {receiptHash && <a href={`https://testnet.nearblocks.io/txns/${receiptHash}`} target="_blank" rel="noreferrer">View testnet receipt</a>}
  </div>;
}
