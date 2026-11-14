"use client";

import { useEffect, useState } from "react";
import { StudioAlbumGenerator } from "./studio-album-generator";

interface AgentChoice { readonly id: string; readonly role: string; readonly accountId: string; }
interface AlbumOptions { readonly accountId: string; readonly agents: readonly AgentChoice[]; }

export function StudioAlbumEntry() {
  const [options, setOptions] = useState<AlbumOptions | null>(null);
  const [state, setState] = useState<"loading" | "connect" | "unavailable">("loading");

  useEffect(() => {
    let active = true;
    const load = async () => {
      setState("loading");
      try {
        const response = await fetch("/api/studio/album/options", { cache: "no-store" });
        if (!active) return;
        if (response.status === 401) { setOptions(null); setState("connect"); return; }
        if (!response.ok) throw new Error("Album options unavailable");
        const result = await response.json() as AlbumOptions;
        if (!result.accountId || !Array.isArray(result.agents)) throw new Error("Invalid album options");
        setOptions(result);
      } catch {
        if (active) { setOptions(null); setState("unavailable"); }
      }
    };
    void load();
    const changed = () => { void load(); };
    window.addEventListener("studio-session-changed", changed);
    return () => { active = false; window.removeEventListener("studio-session-changed", changed); };
  }, []);

  if (!options) return <div className="studio-album-generator" role="status">{state === "connect" ? "Connect a NEAR testnet wallet above to create an album." : state === "unavailable" ? "Album creation is temporarily unavailable. Refresh this page and try again." : "Loading album studio…"}</div>;
  if (!["lyricist", "composer", "reviewer"].every((role) => options.agents.some((agent) => agent.role === role))) return <div className="studio-album-generator" role="status">The album agents are unavailable right now. Try again after the studio restores their access.</div>;
  return <StudioAlbumGenerator key={options.accountId} accountId={options.accountId} agents={options.agents} />;
}
