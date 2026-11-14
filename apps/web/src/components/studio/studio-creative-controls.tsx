"use client";

import { useEffect, useState } from "react";

interface AgentOption { readonly id: string; readonly role: string; readonly accountId: string; }
interface ProjectOption { readonly id: string; readonly title: string; readonly status: string; }
interface SongOption { readonly workId: string; readonly projectId: string; readonly title: string; readonly version: number; }
interface CreativeRunInput { readonly projectId: string; readonly brief: string; readonly lyricistId: string; readonly composerId: string; readonly reviewerId: string; readonly deadlineAtMs: number; readonly songTitle?: string; }
const pendingRunKey = "studioCreativeRunV1";

export function StudioCreativeControls({ agents, projects, songs }: { readonly agents: readonly AgentOption[]; readonly projects: readonly ProjectOption[]; readonly songs: readonly SongOption[] }) {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [brief, setBrief] = useState("");
  const [songTitle, setSongTitle] = useState("");
  const [albumTitle, setAlbumTitle] = useState("");
  const [firstSongId, setFirstSongId] = useState("");
  const [secondSongId, setSecondSongId] = useState("");
  const [lyricistId, setLyricistId] = useState(agents.find((agent) => agent.role === "lyricist")?.id ?? "");
  const [composerId, setComposerId] = useState(agents.find((agent) => agent.role === "composer")?.id ?? "");
  const [reviewerId, setReviewerId] = useState(agents.find((agent) => agent.role === "reviewer")?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [pendingRun, setPendingRun] = useState<CreativeRunInput | null>(null);
  const [creativeStatus, setCreativeStatus] = useState<string | null>(null);

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(pendingRunKey);
      if (!saved) return;
      const parsed = JSON.parse(saved) as CreativeRunInput;
      if (typeof parsed.projectId !== "string" || typeof parsed.brief !== "string" || typeof parsed.lyricistId !== "string" || typeof parsed.composerId !== "string" || typeof parsed.reviewerId !== "string" || !Number.isSafeInteger(parsed.deadlineAtMs) || parsed.songTitle !== undefined && typeof parsed.songTitle !== "string") throw new Error("Invalid saved run");
      setPendingRun(parsed);
      setProjectId(parsed.projectId);
      setBrief(parsed.brief);
      setLyricistId(parsed.lyricistId);
      setComposerId(parsed.composerId);
      setReviewerId(parsed.reviewerId);
      if (parsed.songTitle) setSongTitle(parsed.songTitle);
    } catch { sessionStorage.removeItem(pendingRunKey); }
  }, []);

  async function createProject(): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch("/api/studio/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });
      const data = await response.json() as { id?: string; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error ?? "Could not create project");
      setProjectId(data.id);
      setMessage(`Project ${data.id} created. Refresh to see it in the task board.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create project"); }
    finally { setBusy(false); }
  }

  async function run(): Promise<void> {
    setBusy(true);
    setMessage(pendingRun ? "Checking the saved agent run. This will not create a second paid session." : "Running a bounded live NEAR AI collaboration. This uses model credits and may take a few minutes.");
    try {
      const input: CreativeRunInput = pendingRun ?? { projectId, brief: brief.trim(), lyricistId, composerId, reviewerId, deadlineAtMs: Date.now() + 600_000, songTitle: songTitle.trim() || projects.find((project) => project.id === projectId)?.title || "Untitled song" };
      if (!pendingRun) { sessionStorage.setItem(pendingRunKey, JSON.stringify(input)); setPendingRun(input); }
      const response = await fetch("/api/studio/creative", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });
      const data = await response.json() as { sessionId?: string; status?: string; outcome?: string; error?: string };
      if (!response.ok) throw new Error(`${data.error ?? "Creative run failed"}${data.sessionId ? `; session ${data.sessionId}` : ""}`);
      setCreativeStatus(data.outcome === "unresolved" ? "unresolved" : data.status ?? null);
      setMessage(`Session ${data.sessionId} is ${data.status}. Refresh to inspect recorded agent activity. Use Start another run only when you intend a new credit-bearing session.`);
      if (data.status === "awaiting_human" && data.outcome === "awaiting_acceptance" && !data.error) await produceSong(input);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Creative run failed"); }
    finally { setBusy(false); }
  }

  function startAnotherRun(): void {
    sessionStorage.removeItem(pendingRunKey);
    setPendingRun(null);
    setCreativeStatus(null);
    setMessage("The next run will create a new session and may use more model credits.");
  }

  async function produceSong(input: CreativeRunInput): Promise<void> {
    setBusy(true);
    setMessage("The agents agreed. Generating their full song with ElevenLabs now. This uses music credits; saved generations are reused on retry.");
    try {
      const response = await fetch("/api/studio/songs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId: input.projectId, brief: input.brief, title: input.songTitle || songTitle.trim() || projects.find((project) => project.id === input.projectId)?.title || "Untitled song", lyricistId: input.lyricistId, composerId: input.composerId, reviewerId: input.reviewerId }) });
      const result = await response.json() as { workId?: string; assetHash?: string; error?: string };
      if (!response.ok || !result.workId) throw new Error(result.error ?? "Song generation failed. Check the recorded operation before starting a new brief.");
      setMessage(`Song ${result.workId} is a private review draft. Asset ${result.assetHash}. Refresh to inspect it.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Song generation failed"); }
    finally { setBusy(false); }
  }

  async function createAlbum(): Promise<void> {
    setBusy(true);
    try {
      const response = await fetch("/api/studio/albums", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ projectId, title: albumTitle.trim(), songIds: [firstSongId, secondSongId] }) });
      const result = await response.json() as { workId?: string; error?: string };
      if (!response.ok || !result.workId) throw new Error(result.error ?? "Album draft failed");
      setMessage(`Album ${result.workId} is a private review draft. Refresh to inspect it.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Album draft failed"); }
    finally { setBusy(false); }
  }

  const byRole = (role: string) => agents.filter((agent) => agent.role === role);
  return <div className="studio-creative-controls">
    <div><h3>Create a project</h3><label>Project title <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} placeholder="Name the album or song project" /></label><button type="button" disabled={busy || title.trim().length < 3} onClick={() => void createProject()}>Create project</button></div>
    <div><h3>Run agent collaboration</h3><label>Project <select value={projectId} disabled={busy || !!pendingRun} onChange={(event) => setProjectId(event.target.value)}><option value="">Select project</option>{projects.map((project) => <option value={project.id} key={project.id}>{project.title} · {project.status}</option>)}{projectId && !projects.some((project) => project.id === projectId) && <option value={projectId}>{projectId} · new</option>}</select></label><label>Music brief <textarea value={brief} disabled={busy || !!pendingRun} maxLength={2000} rows={5} onChange={(event) => setBrief(event.target.value)} placeholder="Describe theme, mood, tempo and lyrical direction" /></label><div className="studio-creative-agents">{([ ["lyricist", lyricistId, setLyricistId], ["composer", composerId, setComposerId], ["reviewer", reviewerId, setReviewerId] ] as const).map(([role, value, setValue]) => <label key={role}>{role}<select value={value} disabled={busy || !!pendingRun} onChange={(event) => setValue(event.target.value)}><option value="">Select agent</option>{byRole(role).map((agent) => <option value={agent.id} key={agent.id}>{agent.accountId}</option>)}</select></label>)}</div><p>Up to six calls per agent and 900 output tokens per call. An accepted agreement starts a paid music recording automatically.</p><button type="button" disabled={busy || !projectId || brief.trim().length < 20 || !lyricistId || !composerId || !reviewerId || lyricistId === composerId} onClick={() => void run()}>{pendingRun ? "Resume saved agent run" : "Run agents with NEAR AI"}</button>{pendingRun && <button type="button" disabled={busy} onClick={startAnotherRun}>Start another run</button>}</div>
    <div><h3>Produce a sung song draft</h3><p>After the agents agree on lyrics and splits, the full song recording starts automatically and becomes a private review draft. This uses ElevenLabs music credits.</p><label>Song title <input value={songTitle} disabled={busy || !!pendingRun} maxLength={160} onChange={(event) => setSongTitle(event.target.value)} placeholder="Defaults to the project title" /></label><button type="button" disabled={busy || creativeStatus !== "awaiting_human" || !pendingRun} onClick={() => pendingRun && void produceSong(pendingRun)}>Check or retry recording</button><small>If you refreshed, resume the saved agent run to restore its status. A timed-out music request may have an unknown provider outcome; the same brief will not submit a second paid call.</small></div>
    <div><h3>Assemble an album draft</h3><p>Select two songs from the same project. The cover and track list are created locally; this action uses no model or music credits.</p><label>Album title <input value={albumTitle} maxLength={160} onChange={(event) => setAlbumTitle(event.target.value)} /></label><label>First song <select value={firstSongId} onChange={(event) => setFirstSongId(event.target.value)}><option value="">Select song</option>{songs.filter((song) => song.projectId === projectId).map((song) => <option key={song.workId} value={song.workId}>{song.title} · v{song.version}</option>)}</select></label><label>Second song <select value={secondSongId} onChange={(event) => setSecondSongId(event.target.value)}><option value="">Select song</option>{songs.filter((song) => song.projectId === projectId).map((song) => <option key={song.workId} value={song.workId}>{song.title} · v{song.version}</option>)}</select></label><button type="button" disabled={busy || !projectId || !albumTitle.trim() || !firstSongId || !secondSongId || firstSongId === secondSongId} onClick={() => void createAlbum()}>Create album review draft</button></div>
    {message && <p role="status">{message}</p>}
  </div>;
}
