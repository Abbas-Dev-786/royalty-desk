"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Disc3, RotateCcw } from "lucide-react";
import { albumRunStorageKey, isAlbumRun, trackBrief, trackTitle, type AlbumRun } from "@/lib/studio-album-run";
import "./studio-album-generator.css";

interface AgentChoice { readonly id: string; readonly role: string; readonly accountId: string; }
interface Props { readonly accountId: string; readonly agents: readonly AgentChoice[]; }
interface ApiResult { readonly id?: string; readonly workId?: string; readonly status?: string; readonly outcome?: string; readonly error?: string; }

const stages = ["Create album project", "Write and negotiate track I", "Record track I", "Write and negotiate track II", "Record track II", "Assemble album draft"] as const;

async function post(path: string, body: Record<string, unknown>): Promise<ApiResult> {
  const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const result = await response.json() as ApiResult;
  if (!response.ok) throw new Error(result.error ?? `Request failed (${response.status})`);
  return result;
}

export function StudioAlbumGenerator({ accountId, agents }: Props) {
  const [title, setTitle] = useState("");
  const [concept, setConcept] = useState("");
  const [lyricistId, setLyricistId] = useState(agents.find((agent) => agent.role === "lyricist")?.id ?? "");
  const [composerId, setComposerId] = useState(agents.find((agent) => agent.role === "composer")?.id ?? "");
  const [reviewerId, setReviewerId] = useState(agents.find((agent) => agent.role === "reviewer")?.id ?? "");
  const [run, setRun] = useState<AlbumRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(albumRunStorageKey);
      if (!saved) return;
      const candidate: unknown = JSON.parse(saved);
      if (isAlbumRun(candidate, accountId)) { setRun(candidate); setTitle(candidate.title); setConcept(candidate.concept); }
    } catch { /* A damaged local progress record cannot start paid work. */ }
  }, [accountId]);

  function save(next: AlbumRun): AlbumRun {
    localStorage.setItem(albumRunStorageKey, JSON.stringify(next));
    setRun(next);
    return next;
  }

  async function advance(initial: AlbumRun): Promise<void> {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setIssue(null);
    let current = initial;
    try {
      while (current.stage < 6) {
        if (current.stage === 0) {
          await post("/api/studio/projects", { id: current.projectId, title: current.title, concept: current.concept, lyricistId: current.lyricistId, composerId: current.composerId, reviewerId: current.reviewerId });
        } else if (current.stage === 1 || current.stage === 3) {
          const track = current.stage === 1 ? 0 : 1;
          let deadline = current.deadlines[track];
          if (!deadline) {
            deadline = Date.now() + 600_000;
            current = save({ ...current, deadlines: track === 0 ? [deadline, current.deadlines[1]] : [current.deadlines[0], deadline] });
          }
          const result = await post("/api/studio/creative", { projectId: current.projectId, brief: trackBrief(current.concept, track), lyricistId: current.lyricistId, composerId: current.composerId, reviewerId: current.reviewerId, deadlineAtMs: deadline });
          if (result.status !== "awaiting_human" || result.outcome !== "awaiting_acceptance") throw new Error(result.outcome === "unresolved" ? `Track ${track + 1}: agents did not agree. This album run is paused.` : `Track ${track + 1}: agent result needs review (${result.status ?? "unknown"}).`);
        } else if (current.stage === 2 || current.stage === 4) {
          const track = current.stage === 2 ? 0 : 1;
          const result = await post("/api/studio/songs", { projectId: current.projectId, brief: trackBrief(current.concept, track), title: trackTitle(current.title, track), lyricistId: current.lyricistId, composerId: current.composerId, reviewerId: current.reviewerId });
          if (!result.workId) throw new Error(`Track ${track + 1}: recording result is missing its work ID.`);
          const songIds = [...current.songIds];
          songIds[track] = result.workId;
          current = save({ ...current, songIds });
        } else {
          const [first, second] = current.songIds;
          if (!first || !second) throw new Error("Both recorded songs are required before album assembly.");
          const result = await post("/api/studio/albums", { projectId: current.projectId, title: current.title, songIds: [first, second] });
          if (!result.workId) throw new Error("Album draft result is missing its work ID.");
          current = save({ ...current, albumId: result.workId });
        }
        current = save({ ...current, stage: current.stage + 1 });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Album generation paused. Check the saved work before resuming.";
      setIssue(message === "ERR_CREATIVE_OUTCOME_UNKNOWN" ? `The agent request for ${current.projectId} has an uncertain outcome. It is paused to avoid a possible duplicate provider charge. Share this project ID with the studio operator before retrying.` : message);
    }
    finally { inFlight.current = false; setBusy(false); }
  }

  function start(): void {
    if (inFlight.current || busy || title.trim().length < 3 || concept.trim().length < 20 || !lyricistId || !composerId || !reviewerId || new Set([lyricistId, composerId, reviewerId]).size !== 3) return;
    const initial: AlbumRun = { accountId, projectId: `project-album-${crypto.randomUUID()}`, title: title.trim(), concept: concept.trim(), lyricistId, composerId, reviewerId, deadlines: [0, 0], stage: 0, songIds: [] };
    void advance(save(initial));
  }

  function reset(): void {
    if (busy) return;
    localStorage.removeItem(albumRunStorageKey);
    setRun(null);
    setIssue(null);
  }

  const choices = (role: string) => agents.filter((agent) => agent.role === role);
  return <div className="studio-album-generator">
    <div className="studio-album-lead"><div className="studio-album-icon"><Disc3 size={24}/></div><div><span>ALBUM STUDIO</span><h3>Generate a two-song album</h3><p>Give the agents one concept. They will create two distinct songs, negotiate each song’s revenue share, record both tracks, and assemble a private album draft.</p></div></div>
    {run ? <div className="studio-album-progress"><div className="studio-album-progress-heading"><strong>{run.title}</strong><span>{run.stage === 6 ? "Draft ready" : busy ? "Working" : "Paused · ready to resume"}</span></div><ol>{stages.map((label, index) => <li key={label} className={index < run.stage ? "complete" : index === run.stage ? "current" : ""}><span>{index < run.stage ? "✓" : index + 1}</span>{label}</li>)}</ol>{issue && <p className="studio-album-error" role="alert">{issue}</p>}{run.stage === 6 && run.albumId ? <div className="studio-album-preview"><img src={"/api/studio/album/media?" + new URLSearchParams({ projectId: run.projectId, workId: run.albumId })} alt={`${run.title} album cover`} /><div><h4>Your private album draft is ready</h4><p>Listen to both tracks. Public release still goes through the studio review and approval process.</p>{run.songIds.map((songId, index) => <div className="studio-album-track" key={songId}><strong>{trackTitle(run.title, index as 0 | 1)}</strong><audio controls preload="metadata" src={"/api/studio/album/media?" + new URLSearchParams({ projectId: run.projectId, workId: songId })}/></div>)}</div></div> : <button type="button" disabled={busy || !!issue?.includes("did not agree") || !!issue?.includes("uncertain outcome")} onClick={() => void advance(run)}>{busy ? "Generating album…" : <><RotateCcw size={15}/> Resume saved run</>}</button>}<button className="studio-album-reset" type="button" disabled={busy} onClick={reset}>Start a new album</button><small>Progress is saved in this browser. Resuming reuses the same project and agent inputs; uncertain provider outcomes stay paused.</small></div> : <div className="studio-album-form"><label>Album title<input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Cities at Dawn"/></label><label>Album concept<textarea value={concept} maxLength={1600} rows={4} onChange={(event) => setConcept(event.target.value)} placeholder="Describe the story, mood, genre, instruments, and lyrical themes across both tracks…"/></label><div className="studio-album-agents">{([ ["Lyricist", lyricistId, setLyricistId], ["Composer", composerId, setComposerId], ["Reviewer", reviewerId, setReviewerId] ] as const).map(([label, value, update]) => <label key={label}>{label}<select value={value} onChange={(event) => update(event.target.value)}><option value="">Select {label.toLowerCase()}</option>{choices(label.toLowerCase()).map((agent) => <option key={agent.id} value={agent.id}>{agent.accountId}</option>)}</select></label>)}</div><button type="button" disabled={title.trim().length < 3 || concept.trim().length < 20 || !lyricistId || !composerId || !reviewerId || new Set([lyricistId, composerId, reviewerId]).size !== 3} onClick={start}>Generate album <ArrowRight size={16}/></button><small>Creates two live agent sessions and two full recordings. This uses model and music credits. The completed album stays private until the normal review and release steps.</small></div>}
  </div>;
}
