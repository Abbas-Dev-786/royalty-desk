"use client";

import { useEffect, useState } from "react";

interface GuestStep { readonly role: string; readonly agentId: string; readonly model: string; readonly content: string; readonly outputHash: string; }
interface GuestDemo { readonly projectId: string; readonly title: string; readonly brief: string; readonly sessionId: string | null; readonly status: string; readonly error: string | null; readonly steps: readonly GuestStep[]; readonly song: { readonly workId: string; readonly version: number; readonly state: string; readonly published: boolean; readonly durationMs: number | null; readonly assetHash: string } | null; }
const labels: Readonly<Record<string, string>> = { lyrics: "Lyricist", composition: "Composer", review: "Reviewer", revision: "Revision", split_proposal: "Split proposal", split_response: "Split response" };
function explainError(error: string): string {
  if (error === "ERR_CREATIVE_OUTCOME_UNKNOWN" || error.includes("Multiple errors occurred during superstep")) return "The first NEAR AI request has an uncertain outcome. This song is paused to avoid charging credits twice. The operator must inspect provider usage before retrying.";
  if (error === "ERR_NEAR_AI_OUTPUT_LIMIT") return "NEAR AI ended the reply before producing a usable answer. This attempt may have used model credits; the operator must review it before another run.";
  if (error === "ERR_NEAR_AI_CONTENT" || error === "ERR_CREATIVE_MODEL_FORMAT") return "NEAR AI returned no usable song text. This attempt may have used model credits; the operator must review it before another run.";
  return error;
}

export function StudioGuestDemo() {
  const [demo, setDemo] = useState<GuestDemo | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function refresh(): Promise<void> {
    const auth = await fetch("/api/auth/me", { cache: "no-store" });
    if (!auth.ok) { setAccountId(null); setDemo(null); return; }
    const identity = await auth.json() as { accountId: string };
    setAccountId(identity.accountId);
    const response = await fetch("/api/studio/guest", { cache: "no-store" });
    const data = await response.json() as { demo?: GuestDemo | null; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Could not load your song");
    setDemo(data.demo ?? null);
    if (data.demo) { setTitle(data.demo.title); setBrief(data.demo.brief); }
  }

  useEffect(() => {
    void refresh().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Could not load your song"));
    const changed = () => { void refresh().catch(() => setMessage("Could not refresh wallet session")); };
    window.addEventListener("studio-session-changed", changed);
    return () => window.removeEventListener("studio-session-changed", changed);
  }, []);

  async function send(path: string, body: Record<string, unknown> = {}): Promise<void> {
    setBusy(true);
    setMessage(path.endsWith("/song") ? demo?.song ? "The agents are checking and publishing the saved recording. This does not request new music." : "Generating one private 20-second recording with ElevenLabs. This uses music credits." : "Running live NEAR AI agents. This can take a few minutes and uses model credits.");
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await response.json() as { demo?: GuestDemo | null; error?: string };
      if (data.demo) setDemo(data.demo);
      if (!response.ok) throw new Error(explainError(data.error ?? "The request did not finish"));
      setMessage(path.endsWith("/song") ? data.demo?.song?.published ? "The agents published your song. Open it in the catalogue." : "Your song is saved. If human approval is enabled, the guardian must approve the exact release before the producer publishes it." : "Agent run updated. Read the steps below, then generate audio if the split was accepted.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "The request did not finish. Refresh before retrying."); }
    finally { setBusy(false); await refresh().catch(() => undefined); }
  }

  return <div className="studio-guest-demo">
    {!accountId ? <p>Connect a NEAR testnet wallet using the button above to create one private song and see the agents work together.</p> : <p>Signed in as <strong>{accountId}</strong>. This wallet can create one private song. Agents publish it after review and split acceptance, or wait for guardian approval if the policy requires it.</p>}
    <div className="studio-guest-form">
      <label>Song title<input value={title} maxLength={160} disabled={busy || !!demo || !accountId} onChange={(event) => setTitle(event.target.value)} placeholder="Name your new song" /></label>
      <label>Music brief<textarea value={brief} maxLength={2000} rows={5} disabled={busy || !!demo || !accountId} onChange={(event) => setBrief(event.target.value)} placeholder="Describe the mood, theme, tempo, and lyrics you want the agents to explore" /></label>
      <button type="button" disabled={busy || !accountId || (!!demo && (demo.status === "awaiting_human" || ["ERR_CREATIVE_OUTCOME_UNKNOWN", "ERR_NEAR_AI_OUTPUT_LIMIT", "ERR_NEAR_AI_CONTENT", "ERR_CREATIVE_MODEL_FORMAT"].includes(demo.error ?? ""))) || title.trim().length < 1 || brief.trim().length < 20} onClick={() => void send("/api/studio/guest", { title: title.trim(), brief: brief.trim() })}>{demo ? "Resume my agent run" : "Create my song with agents"}</button>
      {demo?.status === "awaiting_human" && !demo.song && <button type="button" disabled={busy} onClick={() => void send("/api/studio/guest/song")}>Generate my 20-second song</button>}
      {demo?.song && !demo.song.published && <button type="button" disabled={busy} onClick={() => void send("/api/studio/guest/song")}>Ask agents to finalize release</button>}
      <button type="button" disabled={busy || !accountId} onClick={() => void refresh().catch((error: unknown) => setMessage(error instanceof Error ? error.message : "Refresh failed"))}>Refresh status</button>
    </div>
    {message && <p role="status">{message}</p>}
    {demo && <section className="studio-guest-result"><h2>{demo.title}</h2><p>Project {demo.projectId} · agent status {demo.status}{demo.error ? ` · ${explainError(demo.error)}` : ""}</p>{demo.song && <div><p>{demo.song.published ? "Published song" : "Private review draft"} · {Math.round((demo.song.durationMs ?? 0) / 1000)} seconds · media hash {demo.song.assetHash}</p><audio controls preload="metadata" src="/api/studio/guest/song/media" aria-label={`Play ${demo.title}`} />{demo.song.published && <p><a href={`/studio/${encodeURIComponent(demo.song.workId)}?version=${demo.song.version}`}>Open published song</a></p>}</div>}<h3>Agent collaboration</h3>{demo.steps.length ? <ol className="studio-collab-timeline">{demo.steps.map((step, index) => <li key={`${step.outputHash}:${index}`}><strong>{labels[step.role] ?? step.role} · {step.agentId}</strong><small>{step.model}</small><blockquote>{step.content}</blockquote><details><summary>Output hash</summary><code>{step.outputHash}</code></details></li>)}</ol> : <p>No agent output has been recorded yet. Refresh while the worker runs.</p>}</section>}
  </div>;
}
