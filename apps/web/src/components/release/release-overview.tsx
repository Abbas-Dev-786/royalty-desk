"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CircleCheck, Clock3, ShieldCheck, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ActionNotice, type Notice } from "@/components/action-notice";
import { errorMessage, jsonRequest, sendApi } from "@/lib/royaltydesk-client";
import { useRelease } from "./release-context";

export function ReleaseOverview() {
  const { releaseId, release, accountId, refresh } = useRelease();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  if (!release) return null;
  const invited = !!accountId && release.invited_owner_ids.includes(accountId);
  const accepted = !!accountId && release.accepted_owner_ids.includes(accountId);
  const administrator = accountId === release.administrator_id;
  const nextHref = release.accepted_owner_ids.length < release.invited_owner_ids.length ? "#owners" : release.active_agreement_version ? `/releases/${encodeURIComponent(releaseId)}/statements` : `/releases/${encodeURIComponent(releaseId)}/agreement`;
  const nextTitle = release.accepted_owner_ids.length < release.invited_owner_ids.length ? "Waiting for owner invitations" : release.active_agreement_version ? "Review the next statement" : "Prepare the ownership agreement";

  async function accept(): Promise<void> {
    setBusy(true); setNotice(null);
    try {
      const result = await sendApi(`/api/releases/${encodeURIComponent(releaseId)}/invitations`, { method: "PUT" });
      try {
        await sendApi(`/api/releases/${encodeURIComponent(releaseId)}/invitations/confirm`, { method: "POST" });
        await refresh();
        setNotice({ title: "Invitation accepted", description: "Your wallet is now recorded as an owner for this release.", transactionHash: result.transactionHash });
      } catch (cause) { setNotice({ title: "Confirm your acceptance", description: `${errorMessage(cause)} Your wallet transaction may already have succeeded; use the confirmation button below.`, error: true, transactionHash: result.transactionHash }); }
    } catch (cause) { setNotice({ title: "Invitation not accepted", description: errorMessage(cause), error: true }); }
    finally { setBusy(false); }
  }

  async function confirmMembership(): Promise<void> {
    setBusy(true);
    try { await sendApi(`/api/releases/${encodeURIComponent(releaseId)}/invitations/confirm`, { method: "POST" }); await refresh(); setNotice({ title: "Membership confirmed", description: "Your owner role is ready in this workspace." }); }
    catch (cause) { setNotice({ title: "Could not confirm membership", description: errorMessage(cause), error: true }); }
    finally { setBusy(false); }
  }

  async function confirmRelease(): Promise<void> {
    setBusy(true);
    try { await sendApi("/api/releases/confirm", jsonRequest({ releaseId })); setNotice({ title: "Release confirmed", description: "The workspace now recognizes the contract release and its invited owners." }); }
    catch (cause) { setNotice({ title: "Could not confirm release", description: errorMessage(cause), error: true }); }
    finally { setBusy(false); }
  }

  return <div className="page-stack"><div className="overview-grid"><Card className="status-card"><CardHeader><div className="status-heading"><span className="status-icon"><ShieldCheck size={22} /></span><Badge variant="outline">On-chain status</Badge></div><CardTitle>Your next step</CardTitle></CardHeader><CardContent><h2>{nextTitle}</h2><p>{release.accepted_owner_ids.length < release.invited_owner_ids.length ? "Each invited owner must accept with their own wallet before the administrator can finalize the agreement." : release.active_agreement_version ? "The agreement is active. Import a statement for a payment month, review it, then fund and settle." : "All invited owners have accepted. The administrator can now set the shares and ask owners to approve them."}</p><Link href={nextHref} className={buttonVariants()}>Continue <ArrowRight size={16} /></Link></CardContent></Card><div className="overview-facts"><div><span>Recording</span><strong>{release.recording_id}</strong></div><div><span>Administrator</span><strong>{release.administrator_id}</strong></div><div><span>Registered funder</span><strong>{release.funder_id}</strong></div><div><span>Agreement</span><strong>{release.active_agreement_version ? `Version ${release.active_agreement_version} active` : "Not active yet"}</strong></div></div></div>
    <section id="owners" className="workspace-section"><div className="section-heading"><div><h2>Owners and invitations</h2><p>The invited list was fixed when this release was created.</p></div><Badge variant="secondary">{release.accepted_owner_ids.length}/{release.invited_owner_ids.length} accepted</Badge></div><div className="owner-list">{release.invited_owner_ids.map((id) => { const isAccepted = release.accepted_owner_ids.includes(id); return <div className="owner-row" key={id}><span className={isAccepted ? "owner-icon accepted" : "owner-icon"}>{isAccepted ? <CircleCheck size={18} /> : <Clock3 size={18} />}</span><div><strong>{id}</strong><small>{id === release.administrator_id ? "Also the administrator" : "Invited owner"}</small></div><Badge variant={isAccepted ? "secondary" : "outline"}>{isAccepted ? "Accepted" : "Waiting"}</Badge></div>; })}</div>{invited && !accepted && <div className="inline-action"><Users size={20} /><div><strong>Your invitation is waiting.</strong><p>Accepting gives your wallet the right to review and approve this release. It does not transfer funds.</p></div><Button onClick={() => { void accept(); }} disabled={busy}>{busy ? "Working…" : "Accept invitation"}</Button></div>}{invited && !accepted && <Button variant="ghost" onClick={() => { void confirmMembership(); }} disabled={busy}>Already accepted in wallet? Confirm here</Button>}{administrator && <Button variant="ghost" onClick={() => { void confirmRelease(); }} disabled={busy}>Recover local release confirmation</Button>}</section>
    <section className="workspace-section"><div className="section-heading"><div><h2>What happens next</h2><p>Move through these sections from left to right; each page explains its required authority.</p></div></div><div className="journey-links"><Link href={`/releases/${encodeURIComponent(releaseId)}/agreement`}>Agreement <ArrowRight size={15} /></Link><Link href={`/releases/${encodeURIComponent(releaseId)}/statements`}>Statements <ArrowRight size={15} /></Link><Link href={`/releases/${encodeURIComponent(releaseId)}/settlement`}>Payments <ArrowRight size={15} /></Link><Link href={`/releases/${encodeURIComponent(releaseId)}/agent`}>My agent <ArrowRight size={15} /></Link></div></section><ActionNotice notice={notice} /></div>;
}
