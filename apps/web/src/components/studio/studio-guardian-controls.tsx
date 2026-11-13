"use client";

import { useState } from "react";
import type { StudioPolicyView } from "@studio/chain";
import { walletConnector } from "@/components/wallet-session";

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
  const [message, setMessage] = useState("");

  async function send(methodName: GuardianMethod, args: Record<string, unknown>, deposit: string): Promise<string> {
    const wallet = await walletConnector().wallet();
    const accounts = await wallet.getAccounts({ network: "testnet" });
    if (!accounts.some((account) => account.accountId === guardianId)) throw new Error("Connect the guardian wallet and sign in again.");
    const result = await wallet.signAndSendTransaction({ signerId: guardianId, receiverId: contractId, network: "testnet", actions: [{ type: "FunctionCall", params: { methodName, args, gas: "100000000000000", deposit } }] });
    if (!result.transaction?.hash || typeof result.status === "object" && "Failure" in result.status) throw new Error("Chain outcome is uncertain. Inspect your wallet receipt before retrying.");
    return result.transaction.hash;
  }

  async function act(work: () => Promise<string>): Promise<void> {
    setBusy(true); setMessage("");
    try { setMessage(await work()); window.location.reload(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Action failed"); }
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

  return <div className="studio-admin-controls">
    <fieldset disabled={busy}><legend>Governance policy</legend><label><input type="checkbox" checked={humanReview} onChange={(event) => setHumanReview(event.target.checked)} /> Require human approval before agent publication</label><label><input type="checkbox" checked={paused} onChange={(event) => setPaused(event.target.checked)} /> Pause new sales and transfers</label><button type="button" onClick={() => void act(updatePolicy)}>Save policy</button></fieldset>
    {policy.human_review && <fieldset disabled={busy}><legend>Approve agent releases</legend>{releases.filter((release) => !release.published).map((release) => <button key={`${release.workId}:${release.version}`} type="button" onClick={() => void act(async () => `Approved ${release.title}: ${await send("approve_release", { work_id: release.workId, version: release.version, commitment: release.commitment, policy_epoch: release.policyEpoch }, "1")}`)}>{release.title} v{release.version}</button>)}</fieldset>}
    <fieldset disabled={busy}><legend>Emergency takedown</legend><label>Reason <input value={reason} minLength={5} maxLength={500} onChange={(event) => setReason(event.target.value)} /></label>{releases.filter((release) => release.published).map((release) => <button key={`${release.workId}:${release.version}`} type="button" disabled={reason.trim().length < 5} onClick={() => void act(() => unpublish(release))}>Unpublish {release.title} v{release.version}</button>)}</fieldset>
    <fieldset disabled={busy}><legend>Emergency agent revocation</legend><p>Revocation stops future agent contract actions. It does not reverse an already published release or payment.</p>{agents.filter((agent) => agent.active).map((agent) => <button key={agent.accountId} type="button" onClick={() => void act(() => revokeAgent(agent))}>Revoke {agent.role} · {agent.accountId}</button>)}</fieldset>
    <fieldset disabled={busy}><legend>Agent renewal</legend><p>Extend an active agent by 30 days and raise its lifetime action ceiling to 1,000. Used actions and its role stay unchanged.</p>{agents.filter((agent) => agent.active && agent.expiresAtMs !== null).map((agent) => <button key={agent.accountId} type="button" onClick={() => void act(() => renewAgent(agent))}>Renew {agent.role} · {agent.accountId}</button>)}</fieldset>
    <fieldset disabled={busy}><legend>Recovery</legend><label>Unallocated payment ID <input value={paymentId} onChange={(event) => setPaymentId(event.target.value)} /></label><button type="button" disabled={!/^[a-zA-Z0-9-]{1,64}$/.test(paymentId)} onClick={() => void act(refund)}>Refund buyer</button><label>Creator account ID <input value={recipient} onChange={(event) => setRecipient(event.target.value)} /></label><button type="button" disabled={!/^[a-z0-9._-]+\.testnet$/.test(recipient)} onClick={() => void act(recoveryPayout)}>Pay recorded earnings</button></fieldset>
    {message && <p role="status">{message}</p>}
  </div>;
}
