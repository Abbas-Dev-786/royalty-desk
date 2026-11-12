"use client";

import { useState } from "react";

interface Draft { readonly workId: string; readonly version: number; readonly title: string; readonly kind: string; readonly state: string; }
interface Reviewer { readonly id: string; readonly accountId: string; }

export function StudioDraftReviewControls({ drafts, reviewers }: { readonly drafts: readonly Draft[]; readonly reviewers: readonly Reviewer[] }) {
  const [reviewerId, setReviewerId] = useState(reviewers[0]?.id ?? "");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function accept(draft: Draft): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch("/api/studio/reviews", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ workId: draft.workId, version: draft.version, reviewerId, listened: confirmed, rightsConfirmed: confirmed }) });
      const result = await response.json() as { error?: string; state?: string };
      if (!response.ok) throw new Error(result.error ?? "Review failed");
      setMessage(`${draft.title} v${draft.version} is ${result.state}. Refresh to see the accepted version.`);
      setConfirmed(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Review failed"); }
    finally { setBusy(false); }
  }

  return <div className="studio-draft-review">
    <p>Open each private recording or cover, then confirm what you heard or saw and the rights you control. This records the administrator’s review of the exact asset hash.</p>
    <label>Reviewer agent record <select value={reviewerId} onChange={(event) => setReviewerId(event.target.value)}>{reviewers.map((reviewer) => <option value={reviewer.id} key={reviewer.id}>{reviewer.accountId}</option>)}</select></label>
    <label><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I inspected the media and confirm catalogue playback, paid purchases, tips and downloads are authorized.</label>
    <div className="studio-ops-list">{drafts.map((draft) => <div className="studio-ops-row" key={`${draft.workId}:${draft.version}`}><div><strong>{draft.title}</strong><small>{draft.kind} · {draft.workId} v{draft.version}</small>{draft.kind === "song" ? <audio controls preload="none" src={`/api/studio/drafts/${encodeURIComponent(draft.workId)}/media?version=${draft.version}`} /> : <a href={`/api/studio/drafts/${encodeURIComponent(draft.workId)}/media?version=${draft.version}`} target="_blank" rel="noreferrer">View private cover</a>}</div><button type="button" disabled={busy || !confirmed || !reviewerId} onClick={() => void accept(draft)}>Accept review draft</button></div>)}</div>
    {message && <p role="status">{message}</p>}
  </div>;
}
