"use client";

import { useEffect, useState } from "react";
import { ArrowRight, Check, CircleDot, RotateCcw } from "lucide-react";
import { acceptedSplit, agentActionNames, agentRoleNames, handoffLabel, parseSplitOffer, type AgentInteractionStep } from "@/lib/agent-interaction";
import "./agent-interaction.css";

interface FinalShare { readonly accountId: string; readonly basisPoints: number; readonly acceptedOnChain: boolean; }
interface Props { readonly steps: readonly AgentInteractionStep[]; readonly live?: boolean; readonly finalShares?: readonly FinalShare[]; }

function percentage(points: number): string { return `${(points / 100).toFixed(points % 100 === 0 ? 0 : 2)}%`; }

export function AgentInteraction({ steps, live = false, finalShares }: Props) {
  const [filter, setFilter] = useState<"all" | "split">("all");
  const [visibleCount, setVisibleCount] = useState<number | null>(null);
  const offers = steps.map((step) => parseSplitOffer(step)).filter((offer) => offer !== null);
  const agreed = acceptedSplit(steps);
  const shown = (filter === "split" ? steps.filter((step) => step.role.startsWith("split_")) : steps).slice(0, visibleCount ?? undefined);
  useEffect(() => {
    if (visibleCount === null) return;
    const total = filter === "split" ? steps.filter((step) => step.role.startsWith("split_")).length : steps.length;
    if (visibleCount >= total) return;
    const timer = window.setTimeout(() => setVisibleCount((count) => count === null ? null : count + 1), 900);
    return () => window.clearTimeout(timer);
  }, [filter, steps, visibleCount]);

  return <div className="agent-interaction">
    <div className="agent-interaction-intro"><div><span className="agent-interaction-kicker">THE CREATIVE RECORD <span aria-hidden="true">/</span> {String(steps.length).padStart(2, "0")} SAVED REPLIES</span><h3>Inside the agent room</h3><p>Follow each saved reply as the workflow passes ideas between agents. Open a message to read its full text and source proof.</p></div><span className="agent-interaction-live" role="status"><i aria-hidden="true"/>{live ? "Updating live" : "Saved record"}</span></div>
    <div className="agent-interaction-roles" aria-label="Agent roles"><span><i className="role-mark lyricist"/>LYRICIST <small>words &amp; proposal</small></span><span><i className="role-mark composer"/>COMPOSER <small>sound &amp; response</small></span><span><i className="role-mark reviewer"/>REVIEWER <small>creative critique</small></span></div>
    <div className="agent-interaction-grid">
      <div className="agent-interaction-conversation">
        <div className="agent-interaction-toolbar"><div className="agent-interaction-tabs" aria-label="Message filter"><button type="button" aria-pressed={filter === "all"} onClick={() => { setFilter("all"); setVisibleCount(null); }}>All messages</button><button type="button" aria-pressed={filter === "split"} onClick={() => { setFilter("split"); setVisibleCount(null); }}>Revenue split</button></div><button className="agent-replay" type="button" disabled={!steps.length} onClick={() => setVisibleCount(1)}><RotateCcw size={14}/> Replay</button></div>
        {visibleCount !== null && <div className="agent-replay-status"><span>Playing {Math.min(visibleCount, filter === "split" ? offers.length : steps.length)} messages</span><button type="button" onClick={() => setVisibleCount(null)}>Show all</button></div>}
        {shown.length ? <ol className="agent-message-list">{shown.map((step, index) => {
          const role = agentRoleNames[step.role] ?? step.role;
          const offer = parseSplitOffer(step);
          const handoff = handoffLabel(step);
          const lane = role.toLowerCase();
          return <li className={`agent-message agent-message-${lane}`} key={`${step.outputHash}:${index}`}>
            <div className="agent-message-rail"><span>{String(steps.indexOf(step) + 1).padStart(2, "0")}</span><i aria-hidden="true"/></div>
            <article className="agent-message-card"><div className="agent-message-top"><span className={`agent-message-avatar ${lane}`}>{role.slice(0, 1)}</span><div><strong>{role}</strong><span>{agentActionNames[step.role] ?? step.role}</span></div>{step.createdAtMs && <time dateTime={new Date(step.createdAtMs).toISOString()}>{new Date(step.createdAtMs).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</time>}</div>
              {offer ? <div className={`agent-inline-offer ${offer.kind}`}><span>{offer.kind === "proposal" ? "PROPOSED SHARE" : offer.kind === "counter" ? "COUNTEROFFER" : "ACCEPTANCE REPLY"}</span><strong>Lyricist {percentage(offer.lyricistBasisPoints)} <span>/</span> Composer {percentage(offer.composerBasisPoints)}</strong></div> : <p className="agent-message-preview">{step.content.length > 360 ? `${step.content.slice(0, 360).trimEnd()}…` : step.content}</p>}
              <details className="agent-message-details"><summary>Read full saved reply</summary><pre>{step.content}</pre><div className="agent-message-proof"><span>Agent <code>{step.agentId}</code></span><span>Model <code>{step.model}</code></span><span>Output SHA-256 <code>{step.outputHash}</code></span>{step.source && <span>Source <code>{step.source === "archived-concept" ? "Earlier concept" : "Linked to release"}</code></span>}</div></details>
            </article>
            {handoff && <div className="agent-handoff"><ArrowRight size={13}/>{handoff}</div>}
          </li>;
        })}</ol> : <p className="agent-interaction-empty">{steps.length ? "No credit messages are saved for this song." : "Waiting for the first agent reply. Completed replies will appear here."}</p>}
      </div>
      <aside className="agent-negotiation" aria-label="Revenue share negotiation"><span className="agent-side-kicker">THE AGREEMENT</span><h4>Revenue negotiation</h4><p>Each percentage comes from a saved offer. Shares total 100%.</p>
        {offers.length ? <ol className="agent-offer-list">{offers.map((offer, index) => <li key={`${offer.outputHash}:${index}`} className={`agent-offer agent-offer-${offer.kind}`}><div className="agent-offer-head"><span>{String(index + 1).padStart(2, "0")}</span><strong>{offer.kind === "proposal" ? "Initial offer" : offer.kind === "counter" ? "Counteroffer" : "Acceptance reply"}</strong>{offer.kind === "acceptance" && agreed?.outputHash === offer.outputHash ? <Check size={15}/> : <CircleDot size={14}/>}</div><div className="agent-offer-bar" role="img" aria-label={`Lyricist ${percentage(offer.lyricistBasisPoints)}, Composer ${percentage(offer.composerBasisPoints)}`}><span style={{ width: `${offer.lyricistBasisPoints / 100}%` }}/></div><div className="agent-offer-values"><span>Lyricist <b>{percentage(offer.lyricistBasisPoints)}</b></span><span>Composer <b>{percentage(offer.composerBasisPoints)}</b></span></div></li>)}</ol> : <div className="agent-offer-pending">No offer saved yet</div>}
        {finalShares?.length ? <div className="agent-final-split"><span>ON-CHAIN RELEASE SHARES</span>{finalShares.map((share) => <div key={share.accountId}><strong>{share.accountId}</strong><b>{percentage(share.basisPoints)}</b></div>)}<small>{finalShares.every((share) => share.acceptedOnChain) ? "All shares accepted on NEAR" : "Some on-chain acceptances could not be verified"}</small></div> : <div className="agent-final-split"><span>WORKFLOW RESULT</span><strong>{agreed ? `${percentage(agreed.lyricistBasisPoints)} lyricist · ${percentage(agreed.composerBasisPoints)} composer` : "Awaiting agreement"}</strong><small>{agreed ? "Matching offer and acceptance in saved replies" : "No matching acceptance in saved replies"}</small></div>}
        <p className="agent-source-note">Messages are saved agent outputs passed through the studio workflow. They are shown in order as a readable exchange.</p>
      </aside>
    </div>
  </div>;
}
