"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ArrowUpRight, Check, CircleDashed, Headphones, RefreshCw, Sparkles } from "lucide-react";
import { walletConnector } from "@/components/wallet-session";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { StudioNotice, type StudioNoticeData, type StudioNoticeTone } from "./studio-notice";
import { notifyStudio } from "./studio-notifications";
import { AgentInteraction } from "./agent-interaction";
import { finishStudioPublication } from "@/lib/studio-publish";

interface GuestStep { readonly role: string; readonly agentId: string; readonly model: string; readonly content: string; readonly outputHash: string; readonly createdAtMs: number; }
interface GuestDemo { readonly projectId: string; readonly title: string; readonly brief: string; readonly sessionId: string | null; readonly autoGenerate: boolean; readonly status: string; readonly error: string | null; readonly steps: readonly GuestStep[]; readonly song: { readonly workId: string; readonly version: number; readonly state: string; readonly published: boolean; readonly durationMs: number | null; readonly assetHash: string } | null; }
interface GuestSongSummary { readonly projectId: string; readonly title: string; readonly createdAtMs: number; readonly status: string; readonly hasRecording: boolean; readonly published: boolean; }
interface GuestApprovalPending { readonly published: false; readonly contractId: string; readonly guardianId: string; readonly workId: string; readonly version: number; readonly commitment: string; readonly policyEpoch: number; readonly approved: boolean; readonly requiresApproval: boolean; }
interface GuestApprovalPublished { readonly published: true; readonly workId: string; readonly version: number; }
interface GuestApprovalPreparing { readonly ready: false; readonly workId: string; readonly version: number; readonly state: "review" | "preparing"; }
type GuestApprovalResponse = GuestApprovalPending | GuestApprovalPublished | GuestApprovalPreparing | { readonly error: string };
function explainError(error: string): string {
  if (error === "ERR_RELEASE_STATUS_UNAVAILABLE") return "The connection to the publishing worker timed out. Your recording is saved and publication may still be processing. Refresh progress before trying again.";
  if (error === "ERR_NEAR_RPC_TIMEOUT") return "NEAR testnet is taking too long to respond. Your recording is saved. Refresh progress before trying Publish again.";
  if (error === "ERR_GUEST_WORKER_UNAVAILABLE") return "The studio worker is offline. Your song brief is saved. Continue this song after the worker starts.";
  if (error === "ERR_GUEST_RUN_OUTCOME_UNKNOWN") return "The connection to the worker ended after the agent run was requested. Refresh progress before doing anything else; an agent request may still be running or may have used credits.";
  if (error === "ERR_STUDIO_GOVERNANCE_UNAVAILABLE") return "The studio could not reach NEAR testnet to check its policy. Your agent run has not started. Try again when the connection returns.";
  if (error === "ERR_CREATIVE_IDENTITY_OR_DEADLINE") return "The saved agent run window expired before it started. Refresh this song and try starting the agent session again.";
  if (error === "ERR_GUEST_RELEASE_POLICY_STALE") return "Studio policy changed after this recording was committed. The recording remains private; a studio operator must prepare a new release version before it can be published.";
  if (error === "ERR_RELEASE_COMMIT_OUTCOME_UNKNOWN") return "The producer's release transaction has an uncertain outcome. Your recording is saved. A studio operator must check its saved transaction hash and on-chain receipt before this song can be published.";
  if (/(?:\b429\b|rate.?limit)/i.test(error)) {
    const cooldown = /retry after\s+(\d+)\s*seconds?/i.exec(error);
    return `NEAR testnet is limiting requests. ${cooldown ? `Wait about ${cooldown[1]} seconds, then ` : "Wait a minute, then "}refresh this song before trying Publish again. Your recording is saved; check the wallet receipt if you approved a transaction.`;
  }
  if (error === "ERR_ELEVENLABS_BAD_COMPOSITION_PLAN" || error === "ERR_ELEVENLABS_HTTP_400" || error === "ERR_ELEVENLABS_HTTP_422") return "The music provider rejected the approved arrangement or lyrics. No audio was saved. This song needs a revised plan before another recording request.";
  if (error === "ERR_CREATIVE_OUTCOME_UNKNOWN" || error.includes("Multiple errors occurred during superstep")) return "The first NEAR AI request has an uncertain outcome. This song is paused to avoid charging credits twice. The operator must inspect provider usage before retrying.";
  if (error === "ERR_NEAR_AI_OUTPUT_LIMIT") return "NEAR AI ended the reply before producing a usable answer. This attempt may have used model credits; the operator must review it before another run.";
  if (error === "ERR_NEAR_AI_CONTENT" || error === "ERR_CREATIVE_MODEL_FORMAT") return "NEAR AI returned no usable song text. This attempt may have used model credits; the operator must review it before another run.";
  if (error === "ERR_CREATIVE_SPLIT_PROPOSAL_FORMAT") return "The lyricist returned an explanation instead of a valid percentage split. This model call may have used credits. Start a new song or ask the operator to review the failed attempt before retrying.";
  return /^ERR_[A-Z0-9_]+$/.test(error) ? `This step could not finish. Refresh your progress before trying again. Support code: ${error}.` : error;
}

export function StudioGuestDemo() {
  const [demo, setDemo] = useState<GuestDemo | null>(null);
  const [songs, setSongs] = useState<readonly GuestSongSummary[]>([]);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [newMode, setNewMode] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [brief, setBrief] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<StudioNoticeData | null>(null);
  const [approvalInfo, setApprovalInfo] = useState<GuestApprovalPending | null>(null);
  const [approvalIssue, setApprovalIssue] = useState<string | null>(null);

  function showNotice(tone: StudioNoticeTone, title: string, description: string): void {
    setNotice({ tone, title, description });
  }

  async function refresh(requestedProjectId?: string, showLatest = true): Promise<void> {
    const auth = await fetch("/api/auth/me", { cache: "no-store" });
    if (!auth.ok) { setAccountId(null); setDemo(null); setSongs([]); return; }
    const identity = await auth.json() as { accountId: string };
    setAccountId(identity.accountId);
    const query = requestedProjectId ? "?" + new URLSearchParams({ projectId: requestedProjectId }) : "";
    const response = await fetch("/api/studio/guest" + query, { cache: "no-store" });
    const data = await response.json() as { demo?: GuestDemo | null; songs?: readonly GuestSongSummary[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Could not load your song");
    setSongs(data.songs ?? []);
    if (showLatest || requestedProjectId) {
      setDemo(data.demo ?? null);
      if (data.demo) { setProjectId(data.demo.projectId); setTitle(data.demo.title); setBrief(data.demo.brief); }
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedProjectId = params.get("projectId") ?? undefined;
    const fresh = params.get("new") === "1";
    setProjectId(requestedProjectId ?? null);
    setNewMode(fresh);
    void refresh(requestedProjectId, !fresh).catch((error: unknown) => showNotice("error", "Could not load your song", explainError(error instanceof Error ? error.message : "Refresh this page and try again.")));
    const changed = () => { void refresh(requestedProjectId, !fresh).catch(() => showNotice("error", "Could not refresh your wallet session", "Reconnect your wallet, then refresh this page.")); };
    window.addEventListener("studio-session-changed", changed);
    return () => window.removeEventListener("studio-session-changed", changed);
  }, []);

  useEffect(() => {
    if (!accountId || !projectId || (!busy && (!demo?.sessionId || demo.song || demo.error || demo.status === "failed" || demo.status === "unresolved"))) return;
    let inFlight = false;
    const timer = window.setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void refresh(projectId).catch(() => undefined).finally(() => { inFlight = false; });
    }, 2_000);
    return () => window.clearInterval(timer);
  }, [accountId, projectId, busy, demo?.status, demo?.song, demo?.error]);

  useEffect(() => {
    if (!demo?.song || demo.song.published || demo.song.state !== "accepted") { setApprovalInfo(null); setApprovalIssue(null); return; }
    void fetch("/api/studio/guest/approval?" + new URLSearchParams({ projectId: demo.projectId }), { cache: "no-store" }).then(async (response) => {
      const result = await response.json() as GuestApprovalResponse;
      if (response.ok && "published" in result && result.published) { setApprovalInfo(null); setApprovalIssue(null); await refresh(demo.projectId); }
      else if (response.ok && "published" in result && result.published === false) { setApprovalInfo(result); setApprovalIssue(null); }
      else if ("error" in result && result.error === "ERR_GUEST_RELEASE_POLICY_STALE") { setApprovalInfo(null); setApprovalIssue(explainError(result.error)); }
    }).catch(() => undefined);
  }, [demo?.projectId, demo?.song?.workId, demo?.song?.published, demo?.song?.state]);

  async function send(path: string, body: Record<string, unknown> = {}): Promise<void> {
    const targetProjectId = demo?.projectId ?? projectId ?? "project-guest-" + crypto.randomUUID();
    if (!demo) {
      setProjectId(targetProjectId);
      setNewMode(false);
      window.history.replaceState(null, "", "/studio/create?" + new URLSearchParams({ projectId: targetProjectId }));
    }
    setBusy(true);
    showNotice("progress", path.endsWith("/song") ? demo?.song ? "Finishing your release" : "Making your recording" : "Agents are working", path.endsWith("/song") ? demo?.song ? "Checking the saved recording. No new music will be generated." : "Making one private full song recording. This uses music credits." : "The live agent session can take a few minutes and uses model credits.");
    try {
      const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...body, projectId: targetProjectId }) });
      const data = await response.json() as { demo?: GuestDemo | null; error?: string };
      if (data.demo) setDemo(data.demo);
      if (!response.ok) throw new Error(explainError(data.error ?? "The request did not finish"));
      if (data.demo?.error) {
        const description = explainError(data.demo.error);
        const uncertain = /uncertain|credits twice|may have used model credits/i.test(description);
        showNotice(uncertain ? "warning" : "error", uncertain ? "Song paused to protect credits" : "Agent session needs attention", description);
        return;
      }
      if (path.endsWith("/song")) {
        const published = data.demo?.song?.published === true;
        if (!data.demo?.song) showNotice("progress", "Recording is still processing", "Refresh progress in a moment. We will not request a second recording while this one is unresolved.");
        else {
          showNotice("success", published ? "Song published" : "Recording ready", published ? "Your song is now in Discover." : "Your private recording is ready to play below.");
          notifyStudio({ id: "song-action", tone: "success", title: published ? "Song published" : "Recording ready", description: published ? "Your song is now available in Discover." : "Your private full song recording is ready to hear." });
        }
      } else showNotice("success", "Agent session updated", "Read the creative exchange below. If the agents agreed, your recording starts automatically.");
    } catch (error) {
      const description = explainError(error instanceof Error ? error.message : "Refresh your progress before trying again.");
      const uncertain = /uncertain|credits twice|may have used model credits/i.test(description);
      showNotice(uncertain ? "warning" : "error", uncertain ? "Song paused to protect credits" : "This step did not finish", description);
    }
    finally { setBusy(false); await refresh(targetProjectId).catch(() => undefined); }
  }

  async function approveAndPublish(): Promise<void> {
    if (!demo?.song || !accountId) return;
    setBusy(true);
    showNotice("progress", "Preparing your release", "The reviewer is accepting the saved recording and the agents are confirming their split.");
    try {
      const preparedResponse = await finishStudioPublication(demo.projectId);
      const prepared = await preparedResponse.json() as { demo?: GuestDemo; error?: string };
      if (prepared.demo) setDemo(prepared.demo);
      if (!preparedResponse.ok) throw new Error(prepared.error ?? "Could not prepare the saved release.");
      if (prepared.demo?.song?.published) {
        showNotice("success", "Song published", "Your song is now available in Discover.");
        notifyStudio({ id: "song-action", tone: "success", title: "Song published", description: "Your song is now available in Discover." });
        return;
      }
      const response = await fetch("/api/studio/guest/approval?" + new URLSearchParams({ projectId: demo.projectId }), { cache: "no-store" });
      const approval = await response.json() as GuestApprovalResponse;
      if (!response.ok) throw new Error("error" in approval ? approval.error : "Could not verify the saved release.");
      if ("published" in approval && approval.published) {
        showNotice("success", "Song published", "Your song is now available in Discover.");
        notifyStudio({ id: "song-action", tone: "success", title: "Song published", description: "Your song is now available in Discover." });
        return;
      }
      if (!("published" in approval) || approval.published !== false) throw new Error("Publication is still processing. Your recording is saved. Refresh progress in a moment.");
      if (approval.workId !== demo.song.workId || approval.version !== demo.song.version || !/^[0-9a-f]{64}$/.test(approval.commitment) || !Number.isSafeInteger(approval.policyEpoch)) throw new Error("The release changed. Refresh before publishing it.");
      if (approval.requiresApproval && !approval.approved) {
        if (approval.guardianId !== accountId) throw new Error("Your song is ready, but only the studio guardian can approve public release.");
        const wallet = await walletConnector().wallet();
        if (!(await wallet.getAccounts({ network: "testnet" })).some((account) => account.accountId === accountId)) throw new Error("Connect the same guardian wallet before approving this song.");
        showNotice("progress", "Confirm in your wallet", "Approve this exact song in your NEAR testnet wallet. The recording is already saved.");
        const result = await wallet.signAndSendTransaction({ signerId: accountId, receiverId: approval.contractId, network: "testnet", actions: [{ type: "FunctionCall", params: { methodName: "approve_release", args: { work_id: approval.workId, version: approval.version, commitment: approval.commitment, policy_epoch: approval.policyEpoch }, gas: "100000000000000", deposit: "1" } }] });
        if (!result.transaction?.hash || typeof result.status === "object" && "Failure" in result.status) throw new Error("Wallet outcome is uncertain. Refresh status and check your wallet receipt before approving again.");
      }
      showNotice("progress", "Approval recorded", "The producer is publishing your saved recording. No new audio will be generated.");
      const publishedResponse = await finishStudioPublication(demo.projectId);
      const published = await publishedResponse.json() as { demo?: GuestDemo; error?: string };
      if (published.demo) setDemo(published.demo);
      if (!publishedResponse.ok) throw new Error("Your approval is saved. Publication is still processing; refresh status and try this button again. The audio will not be generated again.");
      const publishedNow = published.demo?.song?.published === true;
      showNotice(publishedNow ? "success" : "progress", publishedNow ? "Song published" : "Approval saved", publishedNow ? "Your song is now available in Discover." : "The producer is still finishing publication. Refresh progress in a moment.");
      if (publishedNow) notifyStudio({ id: "song-action", tone: "success", title: "Song published", description: "Your song is now available in Discover." });
    } catch (error) {
      const description = explainError(error instanceof Error ? error.message : "Refresh your progress before trying again.");
      const uncertain = /uncertain|check your wallet receipt|approval is saved|still processing/i.test(description);
      showNotice(uncertain ? "warning" : "error", uncertain ? "Check publication before retrying" : "Could not finish publication", description);
    }
    finally { setBusy(false); await refresh(demo.projectId).catch(() => undefined); }
  }

  const paused = !!demo?.error && ["ERR_CREATIVE_OUTCOME_UNKNOWN", "ERR_NEAR_AI_OUTPUT_LIMIT", "ERR_NEAR_AI_CONTENT", "ERR_CREATIVE_MODEL_FORMAT"].includes(demo.error);
  const working = !!demo?.sessionId && !demo?.song && demo.status !== "failed" && demo.status !== "unresolved" && !demo.error;
  const stage = demo?.song?.published ? 4 : demo?.song ? 3 : demo?.status === "awaiting_human" && !demo.error ? 2 : demo ? 1 : 0;
  return <div className="studio-guest-demo">
    {!accountId && <Alert className="studio-connect-alert"><AlertCircle/><AlertTitle>Connect your wallet to begin</AlertTitle><AlertDescription>Use the button in the top right to create songs and follow your agents.</AlertDescription></Alert>}
    {accountId && <section className="guest-song-library" aria-label="Your songs"><div className="guest-song-library-head"><div><span className="section-eyebrow">Your studio</span><h2>Your songs</h2></div><a className="studio-button studio-button-dark" href="/studio/create?new=1">New song</a></div>{songs.length ? <div className="guest-song-list">{songs.map((song) => <a className={demo?.projectId === song.projectId && !newMode ? "guest-song-link selected" : "guest-song-link"} href={"/studio/create?" + new URLSearchParams({ projectId: song.projectId })} key={song.projectId}><strong>{song.title}</strong><span>{song.published ? "Published" : song.hasRecording ? "Private recording" : song.status === "awaiting_human" ? "Recording next" : song.status === "failed" ? "Needs attention" : "Agents working"}</span></a>)}</div> : <p className="guest-song-empty">Your songs will appear here as soon as you start one.</p>}</section>}
    {notice && <StudioNotice notice={notice} className="session-alert" />}
    {accountId && !demo && <section className="studio-form-panel"><div className="panel-head"><span className="section-eyebrow">Your brief</span><h2>What should we make?</h2><p>Give the agents enough direction to work with. You can be specific about genre, mood, instruments, or theme.</p></div><div className="studio-guest-form"><label htmlFor="song-title">Song title<Input id="song-title" value={title} maxLength={160} disabled={busy} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Midnight in Mumbai" /></label><label htmlFor="music-brief">Describe your sound<Textarea id="music-brief" value={brief} maxLength={2000} rows={6} disabled={busy} onChange={(event) => setBrief(event.target.value)} placeholder="A late-night jazz song with Bollywood strings, a gentle groove, and hopeful lyrics about finding your way home..." /><small>At least 20 characters. Include a mood, style, or story to guide the agents.</small></label><Button className="primary-action" type="button" disabled={busy || title.trim().length < 1 || brief.trim().length < 20} onClick={() => void send("/api/studio/guest", { title: title.trim(), brief: brief.trim() })}><Sparkles size={17}/> {busy ? "Starting session…" : "Start my song"}</Button><p className="form-disclaimer">This starts live NEAR AI agents. When they agree, the studio automatically makes one private recording. Both steps use credits.</p></div></section>}
    {demo && <section className="studio-session-panel"><div className="session-header"><div><span className="section-eyebrow">Your song</span><h2>{demo.title}</h2><p>{demo.brief}</p></div><Badge variant={demo.song?.published ? "default" : "secondary"}>{demo.song?.published ? "Published" : demo.song ? "Private recording" : paused || demo.error ? "Needs attention" : stage === 2 ? "Recording next" : !demo.sessionId ? "Waiting to start" : "Agents at work"}</Badge></div><ol className="session-steps" aria-label="Song progress"><li className={stage >= 1 ? "complete" : ""}><span>{stage >= 1 ? <Check size={15}/> : "1"}</span> Brief shared</li><li className={stage >= 2 ? "complete" : stage === 1 ? "current" : ""}><span>{stage >= 2 ? <Check size={15}/> : "2"}</span> Agents collaborate</li><li className={stage >= 3 ? "complete" : stage === 2 ? "current" : ""}><span>{stage >= 3 ? <Check size={15}/> : "3"}</span> Private recording</li><li className={stage >= 4 ? "complete" : stage === 3 ? "current" : ""}><span>{stage >= 4 ? <Check size={15}/> : "4"}</span> Public release</li></ol>
      {demo.error && <StudioNotice className="session-alert" notice={{ tone: paused ? "warning" : "error", title: paused ? "Song paused to protect credits" : "This session needs help", description: explainError(demo.error) }} />}
      {working && <div className="session-next"><CircleDashed size={22}/><div><h3>The agents are working on your song</h3><p>Their writing, composition, review, and credit discussion will appear below. This can take a few minutes.</p></div></div>}
      {stage === 2 && !demo.song && <div className="session-next"><AudioIcon/><div><h3>The agents agreed. Your recording is next.</h3><p>{demo.autoGenerate ? "Your private full song recording starts automatically and uses music credits." : "This earlier song needs one recording request and uses music credits."} You can listen before choosing whether to publish.</p>{!demo.autoGenerate && <Button type="button" className="primary-action" disabled={busy} onClick={() => void send("/api/studio/guest/song")}>Make my recording</Button>}</div></div>}
      {demo.song && <div className="private-player"><div className="player-icon"><Headphones size={25}/></div><div className="player-main"><span>{demo.song.published ? "Now playing · Public release" : "Now playing · Private to you"}</span><h3>{demo.title}</h3><audio controls preload="metadata" src={"/api/studio/guest/song/media?" + new URLSearchParams({ projectId: demo.projectId })} aria-label={`Play ${demo.title}`}/></div><span className="player-length">{Math.round((demo.song.durationMs ?? 0) / 1000)} sec</span></div>}
      {stage === 3 && <div className="publish-panel"><div><h3>{approvalIssue ? "Release needs attention" : approvalInfo?.requiresApproval && approvalInfo.guardianId !== accountId ? "Waiting for studio approval" : "Ready to share it?"}</h3><p>{approvalIssue ?? (approvalInfo?.requiresApproval && approvalInfo.guardianId !== accountId ? "Your recording is private and playable. The studio guardian must approve this release before it can appear in Discover." : "Your recording is already playable here. Publishing makes it available in Discover. If studio policy requires it, your guardian wallet will ask you to confirm.")}</p></div>{!approvalIssue && (!approvalInfo?.requiresApproval || approvalInfo.guardianId === accountId) && <Button type="button" disabled={busy} onClick={() => void approveAndPublish()}>Publish this song <ArrowUpRight size={17}/></Button>}</div>}
      {stage === 4 && demo.song && <a className="studio-button studio-button-dark" href={`/studio/${encodeURIComponent(demo.song.workId)}?version=${demo.song.version}`}>View public song <ArrowUpRight size={17}/></a>}
      {demo.status === "unresolved" && !demo.song && <p role="status">The agents did not agree on this song, so no recording was requested. Start a new song to try another brief.</p>}
      {demo.status === "awaiting_human" && demo.error && demo.autoGenerate && !demo.song && <Button type="button" disabled={busy} onClick={() => void send("/api/studio/guest/song")}>Check or retry recording</Button>}
      {demo.status !== "awaiting_human" && demo.status !== "unresolved" && !demo.song && !paused && !working && <Button type="button" disabled={busy} onClick={() => void send("/api/studio/guest", { title: title.trim(), brief: brief.trim() })}>{demo.sessionId ? "Continue agent session" : "Start agent session"}</Button>}
      <div className="session-utility"><Button type="button" variant="ghost" disabled={busy} onClick={() => void refresh(demo.projectId).then(() => showNotice("info", "Progress refreshed", "You are seeing the latest saved song state. Any step needing attention is shown above.")).catch((error: unknown) => showNotice("error", "Could not refresh your song", explainError(error instanceof Error ? error.message : "Try again in a moment.")))}><RefreshCw size={15}/> Refresh progress</Button><details><summary>Session details</summary><p>Project {demo.projectId}</p><p>Worker state: {demo.status}</p>{demo.song && <p>Recording hash: {demo.song.assetHash}</p>}</details></div>
      <div className="agent-exchange" id="agent-exchange"><AgentInteraction steps={demo.steps} live={working}/></div>
    </section>}
  </div>;
}

function AudioIcon() { return <Headphones size={23}/>; }
