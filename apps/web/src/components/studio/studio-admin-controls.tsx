"use client";

import { useState } from "react";
import type { StudioPolicyView } from "@studio/chain";
import { walletConnector } from "@/components/wallet-session";
import { yoctoToNear } from "@/lib/studio-money";

interface AgentBalance { readonly accountId: string; readonly role: string; readonly owedYocto: string; readonly pendingYocto: string; readonly paidYocto: string; }
interface ReleaseOption { readonly workId: string; readonly version: number; readonly title: string; readonly commitment: string; readonly policyEpoch: number; readonly published: boolean; }
interface DraftOption { readonly workId: string; readonly version: number; readonly title: string; readonly kind: string; }
type StudioMethod = "set_policy" | "allocate_payment" | "request_payout" | "approve_release" | "publish_release" | "unpublish_release" | "refund_payment" | "create_release";

export function StudioAdminControls({ contractId, adminId, policy, agents, releases, drafts }: { readonly contractId: string; readonly adminId: string; readonly policy: StudioPolicyView; readonly agents: readonly AgentBalance[]; readonly releases: readonly ReleaseOption[]; readonly drafts: readonly DraftOption[] }) {
  const [humanReview, setHumanReview] = useState(policy.human_review);
  const [paused, setPaused] = useState(policy.paused);
  const [paymentId, setPaymentId] = useState("");
  const [refundId, setRefundId] = useState("");
  const [recipientId, setRecipientId] = useState(agents[0]?.accountId ?? "");
  const [takedownReason, setTakedownReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function send(methodName: StudioMethod, args: Record<string, unknown>, deposit: string): Promise<string | null> {
    setBusy(true);
    setMessage("");
    try {
      const sessionResponse = await fetch("/api/auth/me", { cache: "no-store" });
      if (!sessionResponse.ok) throw new Error("Sign in with the studio administrator wallet first.");
      const session = await sessionResponse.json() as { accountId: string };
      if (session.accountId !== adminId) throw new Error("The administrator session changed. Refresh this page.");
      const wallet = await walletConnector().wallet();
      if (!(await wallet.getAccounts({ network: "testnet" })).some((account) => account.accountId === adminId)) throw new Error("The connected wallet differs from the studio administrator.");
      setMessage(`Confirm ${methodName} for ${contractId} in your testnet wallet.`);
      const result = await wallet.signAndSendTransaction({ signerId: adminId, receiverId: contractId, network: "testnet", actions: [{ type: "FunctionCall", params: { methodName, args, gas: "100000000000000", deposit } }] });
      if (result.status && typeof result.status === "object" && "Failure" in result.status) throw new Error(`${methodName} was rejected by the contract. Check the wallet receipt.`);
      if (!result.transaction?.hash) throw new Error("Wallet outcome is unknown. Check the chain before trying again.");
      setMessage(`${methodName} finalized: ${result.transaction.hash}. Refreshing chain state…`);
      return result.transaction.hash;
    } catch (error) { setMessage(error instanceof Error ? error.message : "The on-chain action failed."); }
    finally { setBusy(false); }
    return null;
  }

  async function payRecipient(): Promise<void> {
    const key = `studio-payout:${contractId}:${recipientId}`;
    const payoutId = localStorage.getItem(key) ?? `web-${crypto.randomUUID()}`;
    localStorage.setItem(key, payoutId);
    const status = await fetch(`/api/studio/payouts/${encodeURIComponent(payoutId)}`, { cache: "no-store" });
    if (!status.ok) { setMessage("Could not reconcile the previous payout. Retry after the chain is available."); return; }
    const prior = await status.json() as { payout: { status: string; amount_yocto: string } | null };
    if (prior.payout) {
      if (prior.payout.status === "pending") { setMessage(`Payout ${payoutId} is pending. Do not submit another transfer.`); return; }
      localStorage.removeItem(key);
      setMessage(`Payout ${payoutId} is ${prior.payout.status}. Refresh earnings before another transfer.`);
      return;
    }
    const hash = await send("request_payout", { payout_id: payoutId, recipient_id: recipientId }, "1");
    if (!hash) { setMessage(`Payout outcome is uncertain. Payment ID ${payoutId} is saved; check it before retrying.`); return; }
    const final = await fetch(`/api/studio/payouts/${encodeURIComponent(payoutId)}`, { cache: "no-store" });
    if (!final.ok) { setMessage(`Transfer ${hash} needs reconciliation. Payout ID ${payoutId} is saved.`); return; }
    const result = await final.json() as { payout: { status: string } | null };
    if (result.payout?.status === "paid" || result.payout?.status === "failed") localStorage.removeItem(key);
    setMessage(`Payout ${payoutId}: ${result.payout?.status ?? "unknown"}. Transaction ${hash}.`);
    window.location.reload();
  }

  async function savePolicy(): Promise<void> {
    const hash = await send("set_policy", { input: { epoch: policy.epoch + 1, human_review: humanReview, paused, max_price_yocto: policy.max_price_yocto, max_tip_yocto: policy.max_tip_yocto } }, "1");
    if (!hash) return;
    const response = await fetch("/api/studio/policy/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transactionHash: hash }) });
    if (!response.ok) { const result = await response.json() as { error?: string }; setMessage(`Policy changed on NEAR in ${hash}, but local synchronization needs attention: ${result.error ?? "unknown error"}.`); return; }
    window.location.reload();
  }

  async function approveRelease(release: ReleaseOption): Promise<void> {
    const hash = await send("approve_release", { work_id: release.workId, version: release.version, commitment: release.commitment, policy_epoch: release.policyEpoch }, "1");
    if (hash) { setMessage(`Human approval finalized: ${hash}.`); window.location.reload(); }
  }

  async function acceptAgentSplits(release: ReleaseOption): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch("/api/studio/releases/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workId: release.workId, version: release.version }) });
      const result = await response.json() as { acceptedAccounts?: readonly string[]; error?: string };
      if (!response.ok || !result.acceptedAccounts) throw new Error(result.error ?? "Agent split acceptance failed");
      setMessage(`Agents accepted ${release.title} v${release.version}: ${result.acceptedAccounts.join(", ")}. Check the on-chain receipts before publishing.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Agent split acceptance failed"); }
    finally { setBusy(false); }
  }

  async function commitDraft(draft: DraftOption): Promise<void> {
    const response = await fetch("/api/studio/releases/drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workId: draft.workId, version: draft.version }) });
    const quote = await response.json() as { error?: string; input?: Record<string, unknown>; contractId?: string; existsOnChain?: boolean; commitment?: string };
    if (!response.ok || !quote.input || quote.contractId !== contractId) { setMessage(quote.error ?? "Could not prepare the exact release commitment."); return; }
    if (quote.existsOnChain) { setMessage(`${draft.title} v${draft.version} is already committed on NEAR: ${quote.commitment}. Refresh this page.`); return; }
    const hash = await send("create_release", { input: quote.input }, "0");
    if (!hash) { setMessage(`Release ${draft.workId} v${draft.version} may have reached NEAR. Recheck the exact commitment before retrying.`); return; }
    const accepted = await fetch("/api/studio/releases/accept", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workId: draft.workId, version: draft.version }) });
    if (!accepted.ok) { const result = await accepted.json() as { error?: string }; setMessage(`Release ${hash} is committed, but agent acceptance needs reconciliation: ${result.error ?? "unknown error"}. Refresh and use Agents accept committed splits.`); return; }
    window.location.reload();
  }

  async function publishRelease(release: ReleaseOption): Promise<void> {
    const hash = await send("publish_release", { work_id: release.workId, version: release.version, commitment: release.commitment, policy_epoch: release.policyEpoch }, "0");
    if (!hash) return;
    const response = await fetch("/api/studio/publications", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workId: release.workId, version: release.version, transactionHash: hash }) });
    if (!response.ok) { setMessage(`Publication ${hash} finalized on NEAR, but the local catalogue needs reconciliation. Keep this transaction hash.`); return; }
    setMessage(`Published ${release.title} on NEAR: ${hash}.`);
    window.location.reload();
  }

  async function takeDown(release: ReleaseOption): Promise<void> {
    if (takedownReason.trim().length < 5) { setMessage("Enter a reason of at least five characters."); return; }
    const response = await fetch("/api/studio/takedown", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workId: release.workId, version: release.version, reason: takedownReason }) });
    if (!response.ok) { const error = await response.json() as { error?: string }; setMessage(error.error ?? "Takedown request failed."); return; }
    const hash = await send("unpublish_release", { work_id: release.workId, version: release.version }, "1");
    if (hash) { setMessage(`Release unpublished on NEAR: ${hash}.`); window.location.reload(); }
    else setMessage("The local asset is quarantined. Complete the on-chain unpublish before restoring access.");
  }

  async function refundPayment(): Promise<void> {
    const response = await fetch("/api/studio/refunds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paymentId: refundId }) });
    const quote = await response.json() as { transactionRequest?: { methodName: string; args: Record<string, unknown>; depositYocto: string }; error?: string };
    if (!response.ok || !quote.transactionRequest || quote.transactionRequest.methodName !== "refund_payment" || quote.transactionRequest.depositYocto !== "1") { setMessage(quote.error ?? "Refund is unavailable for this payment."); return; }
    const hash = await send("refund_payment", quote.transactionRequest.args, "1");
    if (!hash) { setMessage(`Refund outcome is uncertain for ${refundId}. Check the chain before retrying.`); return; }
    const confirmed = await fetch("/api/studio/refunds/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paymentId: refundId, transactionHash: hash }) });
    if (!confirmed.ok) { setMessage(`Refund transaction ${hash} needs reconciliation before local access changes.`); return; }
    setMessage(`Refund finalized for ${refundId}: ${hash}.`);
    window.location.reload();
  }

  return <div className="studio-admin-controls">
    <fieldset disabled={busy}><legend>Release policy</legend><label><input type="checkbox" checked={humanReview} onChange={(event) => setHumanReview(event.target.checked)} /> Require human approval before publication</label><label><input type="checkbox" checked={paused} onChange={(event) => setPaused(event.target.checked)} /> Pause new sales and transfers</label><button type="button" onClick={() => void savePolicy()}>Save policy on NEAR</button></fieldset>
    <fieldset disabled={busy}><legend>Allocate a finalized payment</legend><label>Payment ID <input value={paymentId} maxLength={64} onChange={(event) => setPaymentId(event.target.value)} placeholder="Enter exact payment ID" /></label><button type="button" disabled={!/^[a-zA-Z0-9-]{1,64}$/.test(paymentId) || busy} onClick={() => void send("allocate_payment", { payment_id: paymentId }, "0").then((hash) => { if (hash) window.location.reload(); })}>Allocate committed splits</button><small>The contract computes amounts from the release version. This action cannot change recipients.</small></fieldset>
    <fieldset disabled={busy}><legend>Refund an unallocated purchase</legend><label>Payment ID <input value={refundId} maxLength={64} onChange={(event) => setRefundId(event.target.value)} placeholder="Enter browser order ID" /></label><button type="button" disabled={!/^[a-zA-Z0-9-]{1,64}$/.test(refundId) || busy} onClick={() => void refundPayment()}>Refund buyer</button><small>Only a finalized purchase that has not been allocated can be refunded. The child transfer receipt decides the outcome.</small></fieldset>
    <fieldset disabled={busy}><legend>Pay an agent</legend><label>Recipient <select value={recipientId} onChange={(event) => setRecipientId(event.target.value)}>{agents.map((agent) => <option value={agent.accountId} key={agent.accountId}>{agent.role} · {agent.accountId} · owed {yoctoToNear(agent.owedYocto)} NEAR</option>)}</select></label><button type="button" disabled={!recipientId || busy} onClick={() => void payRecipient()}>Pay recorded earnings</button><small>The contract pays only the fixed agent account and caps each transfer at 0.1 NEAR. The payout ID is kept until the chain outcome is known.</small></fieldset>
    <fieldset className="studio-admin-releases" disabled={busy}><legend>Review and publication</legend><p>Actions use the exact on-chain work version and commitment shown here.</p>{drafts.map((draft) => <div className="studio-admin-release" key={`${draft.workId}:${draft.version}`}><strong>{draft.title} · v{draft.version}</strong><small>{draft.kind} · {draft.workId} · accepted locally</small><button type="button" onClick={() => void commitDraft(draft)}>Commit exact release on NEAR</button></div>)}{releases.map((release) => <div className="studio-admin-release" key={`${release.workId}:${release.version}`}><strong>{release.title} · v{release.version}</strong><small>{release.workId} · epoch {release.policyEpoch} · {release.commitment}</small>{release.published ? <button type="button" disabled={takedownReason.trim().length < 5} onClick={() => void takeDown(release)}>Quarantine and unpublish</button> : <div><button type="button" onClick={() => void acceptAgentSplits(release)}>Agents accept committed splits</button>{policy.human_review && <button type="button" onClick={() => void approveRelease(release)}>Approve release</button>}<button type="button" onClick={() => void publishRelease(release)}>Publish accepted release</button></div>}</div>)}<label>Takedown reason <input value={takedownReason} maxLength={500} onChange={(event) => setTakedownReason(event.target.value)} placeholder="Reason for removing a published work" /></label></fieldset>
    {message && <p role="status">{message}</p>}
  </div>;
}
