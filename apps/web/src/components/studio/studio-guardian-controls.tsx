"use client";

import { useState } from "react";
import type { StudioPolicyView } from "@studio/chain";
import { walletConnector } from "@/components/wallet-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StudioNotice, type StudioNoticeData } from "./studio-notice";
import { flashStudioNotification, notifyStudio } from "./studio-notifications";

interface Release { readonly workId: string; readonly version: number; readonly title: string; readonly commitment: string; readonly policyEpoch: number; readonly published: boolean; }
interface Agent { readonly accountId: string; readonly role: string; readonly active: boolean; readonly expiresAtMs: number | null; readonly maxActions: number; readonly actionsUsed: number; }
type GuardianMethod = "set_policy" | "approve_release" | "unpublish_release" | "request_payout" | "refund_payment" | "revoke_agent" | "renew_agent";

export function StudioGuardianControls({ contractId, guardianId, policy, releases, agents }: { readonly contractId: string; readonly guardianId: string; readonly policy: StudioPolicyView; readonly releases: readonly Release[]; readonly agents: readonly Agent[] }) {
  const [humanReview, setHumanReview] = useState(policy.human_review);
  const [paused, setPaused] = useState(policy.paused);
  const [reason, setReason] = useState("");
  const [recipient, setRecipient] = useState("");
  const [paymentId, setPaymentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<StudioNoticeData | null>(null);

  async function send(methodName: GuardianMethod, args: Record<string, unknown>, deposit: string): Promise<string> {
    const wallet = await walletConnector().wallet();
    const accounts = await wallet.getAccounts({ network: "testnet" });
    if (!accounts.some((account) => account.accountId === guardianId)) throw new Error("Connect the guardian wallet and sign in again.");
    notifyStudio({ id: "guardian-action", tone: "progress", title: "Confirm in your wallet", description: "Review this studio action in your NEAR testnet wallet before signing." });
    const result = await wallet.signAndSendTransaction({ signerId: guardianId, receiverId: contractId, network: "testnet", actions: [{ type: "FunctionCall", params: { methodName, args, gas: "100000000000000", deposit } }] });
    if (!result.transaction?.hash || typeof result.status === "object" && "Failure" in result.status) throw new Error("Chain outcome is uncertain. Inspect your wallet receipt before retrying.");
    return result.transaction.hash;
  }

  async function act(work: () => Promise<string>): Promise<void> {
    setBusy(true);
    setNotice({ tone: "progress", title: "Working on your request", description: "The studio is preparing this action. Your wallet may ask for a signature." });
    try {
      const result = await work();
      if (flashStudioNotification({ tone: "success", title: "Studio action confirmed", description: result })) window.location.reload();
      else setNotice({ tone: "success", title: "Studio action confirmed", description: `${result} Refresh this page to update the controls.` });
    } catch (error) {
      const description = error instanceof Error ? error.message : "Check your wallet and try again.";
      const uncertain = /uncertain|on NEAR|needs reconciliation|check chain receipt/i.test(description);
      const tone = uncertain ? "warning" : "error";
      const title = uncertain ? "Check the wallet result before retrying" : "Studio action needs attention";
      const detail = /^ERR_[A-Z0-9_]+$/.test(description) ? `The action did not complete. Support code: ${description}.` : description;
      setNotice({ tone, title, description: detail });
      notifyStudio({ id: "guardian-action", tone, title, description: detail });
    }
    finally { setBusy(false); }
  }

  async function updatePolicy(): Promise<string> {
    const hash = await send("set_policy", { input: { epoch: policy.epoch + 1, human_review: humanReview, paused, max_price_yocto: policy.max_price_yocto, max_tip_yocto: policy.max_tip_yocto } }, "1");
    const result = await fetch("/api/studio/policy/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ transactionHash: hash }) });
    if (!result.ok) throw new Error(`Policy changed on NEAR (${hash}); local policy sync needs attention.`);
    return `Policy updated on NEAR: ${hash}`;
  }

  async function unpublish(release: Release): Promise<string> {
    const response = await fetch("/api/studio/takedown", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workId: release.workId, version: release.version, reason }) });
    if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? "Takedown preparation failed");
    const hash = await send("unpublish_release", { work_id: release.workId, version: release.version }, "1");
    return `Release unpublished on NEAR: ${hash}`;
  }

  async function refund(): Promise<string> {
    const response = await fetch("/api/studio/refunds", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paymentId }) });
    if (!response.ok) throw new Error((await response.json() as { error?: string }).error ?? "Refund unavailable");
    const hash = await send("refund_payment", { payment_id: paymentId }, "1");
    const confirmed = await fetch("/api/studio/refunds/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ paymentId, transactionHash: hash }) });
    if (!confirmed.ok) throw new Error(`Refund sent (${hash}); check chain receipt before retrying.`);
    return `Buyer refunded: ${hash}`;
  }

  async function recoveryPayout(): Promise<string> {
    const storageKey = `guardian-payout:${contractId}:${recipient}`;
    const payoutId = localStorage.getItem(storageKey) ?? `guardian-${crypto.randomUUID()}`;
    localStorage.setItem(storageKey, payoutId);
    const response = await fetch(`/api/studio/payouts/${encodeURIComponent(payoutId)}`, { cache: "no-store" });
    if (!response.ok) throw new Error("Cannot inspect the previous payout. Check NEAR before retrying.");
    const previous = await response.json() as { payout: { status: string } | null };
    if (previous.payout) {
      if (previous.payout.status === "paid" || previous.payout.status === "failed") localStorage.removeItem(storageKey);
      return `Previous payout ${payoutId}: ${previous.payout.status}. Review earnings before requesting another.`;
    }
    const hash = await send("request_payout", { payout_id: payoutId, recipient_id: recipient }, "0");
    return `Recovery payout ${payoutId} submitted: ${hash}. Recheck its receipt before another request.`;
  }

  async function revokeAgent(agent: Agent): Promise<string> {
    const hash = await send("revoke_agent", { account_id: agent.accountId }, "1");
    const response = await fetch("/api/studio/agents/revoke/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId: agent.accountId, transactionHash: hash }) });
    if (!response.ok) throw new Error(`Agent revoked on NEAR (${hash}); local sync needs attention.`);
    return `Revoked ${agent.role}: ${hash}`;
  }

  async function renewAgent(agent: Agent): Promise<string> {
    if (!agent.expiresAtMs) throw new Error("Agent expiry is unavailable");
    const expiresAtMs = Math.max(Date.now(), agent.expiresAtMs) + 30 * 24 * 60 * 60 * 1000;
    if (expiresAtMs > Date.now() + 365 * 24 * 60 * 60 * 1000) throw new Error("This agent is already near the one-year renewal limit.");
    const maxActions = 1000;
    const hash = await send("renew_agent", { account_id: agent.accountId, expires_at_ms: expiresAtMs, max_actions: maxActions }, "1");
    const response = await fetch("/api/studio/agents/renew/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId: agent.accountId, expiresAtMs, maxActions, transactionHash: hash }) });
    if (!response.ok) throw new Error(`Agent renewed on NEAR (${hash}); local sync needs attention.`);
    return `Renewed ${agent.role}: ${hash}`;
  }

  return <div className="guardian-controls">
    {notice && <StudioNotice notice={notice} className="guardian-notice" />}
    <div className="studio-admin-controls guardian-primary">
      <fieldset disabled={busy}><legend>Publication settings</legend><p>Choose whether every release needs your wallet approval.</p><label><input type="checkbox" checked={humanReview} onChange={(event) => setHumanReview(event.target.checked)} /> Require my approval before a song goes public</label><label><input type="checkbox" checked={paused} onChange={(event) => setPaused(event.target.checked)} /> Pause studio payments and releases</label><Button type="button" onClick={() => void act(updatePolicy)}>Save studio settings</Button></fieldset>
      {policy.human_review && <fieldset disabled={busy}><legend>Awaiting release approval</legend><p>Approving a song lets its producer publish the agreed recording.</p>{releases.filter((release) => !release.published).length === 0 ? <p>No songs are waiting for your approval.</p> : releases.filter((release) => !release.published).map((release) => <Button key={`${release.workId}:${release.version}`} type="button" onClick={() => void act(async () => `Approved ${release.title}: ${await send("approve_release", { work_id: release.workId, version: release.version, commitment: release.commitment, policy_epoch: release.policyEpoch }, "1")}`)}>Approve {release.title} v{release.version}</Button>)}</fieldset>}
    </div>
    <details className="guardian-advanced"><summary>Agent access and recovery tools</summary><p>These controls change agent permissions or handle payment and release incidents.</p><div className="studio-admin-controls">
      <fieldset disabled={busy}><legend>Unpublish a release</legend><label>Reason <Input value={reason} minLength={5} maxLength={500} onChange={(event) => setReason(event.target.value)} /></label>{releases.filter((release) => release.published).map((release) => <Button key={`${release.workId}:${release.version}`} type="button" disabled={reason.trim().length < 5} onClick={() => void act(() => unpublish(release))}>Unpublish {release.title} v{release.version}</Button>)}</fieldset>
      <fieldset disabled={busy}><legend>Revoke an agent</legend><p>Revocation stops future contract actions. Existing releases and payments stay recorded.</p>{agents.filter((agent) => agent.active).map((agent) => <Button key={agent.accountId} type="button" onClick={() => void act(() => revokeAgent(agent))}>Revoke {agent.role} · {agent.accountId}</Button>)}</fieldset>
      <fieldset disabled={busy}><legend>Renew an agent</legend><p>Extend access by 30 days and set the lifetime action ceiling to 1,000.</p>{agents.filter((agent) => agent.active && agent.expiresAtMs !== null).map((agent) => <Button key={agent.accountId} type="button" onClick={() => void act(() => renewAgent(agent))}>Renew {agent.role} · {agent.accountId}</Button>)}</fieldset>
      <fieldset disabled={busy}><legend>Payment recovery</legend><label>Unallocated payment ID <Input value={paymentId} onChange={(event) => setPaymentId(event.target.value)} /></label><Button type="button" disabled={!/^[a-zA-Z0-9-]{1,64}$/.test(paymentId)} onClick={() => void act(refund)}>Refund buyer</Button><label>Creator account ID <Input value={recipient} onChange={(event) => setRecipient(event.target.value)} /></label><Button type="button" disabled={!/^[a-z0-9._-]+\.testnet$/.test(recipient)} onClick={() => void act(recoveryPayout)}>Pay recorded earnings</Button></fieldset>
    </div></details>
  </div>;
}
