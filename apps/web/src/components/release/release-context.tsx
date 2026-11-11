"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ChainRelease } from "@/lib/chain-types";
import { errorMessage, readApi, viewRelease } from "@/lib/royaltydesk-client";

interface ReleaseContextValue {
  readonly releaseId: string;
  readonly release: ChainRelease | null;
  readonly accountId: string | null;
  readonly loading: boolean;
  readonly error: string | null;
  readonly refresh: () => Promise<void>;
}

const ReleaseContext = createContext<ReleaseContextValue | null>(null);

export function ReleaseProvider({ releaseId, children }: Readonly<{ releaseId: string; children: React.ReactNode }>) {
  const [release, setRelease] = useState<ChainRelease | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setRelease(await viewRelease(releaseId)); setError(null); }
    catch (cause) { setRelease(null); setError(errorMessage(cause)); }
    finally { setLoading(false); }
  }, [releaseId]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const refreshSession = () => { void readApi<{ accountId: string }>("/api/auth/me").then((session) => setAccountId(session.accountId)).catch(() => setAccountId(null)); };
    refreshSession();
    window.addEventListener("royaltydesk-session-changed", refreshSession);
    return () => window.removeEventListener("royaltydesk-session-changed", refreshSession);
  }, []);

  return <ReleaseContext.Provider value={{ releaseId, release, accountId, loading, error, refresh }}>{children}</ReleaseContext.Provider>;
}

export function useRelease(): ReleaseContextValue {
  const context = useContext(ReleaseContext);
  if (!context) throw new Error("Release pages must be inside ReleaseProvider");
  return context;
}
