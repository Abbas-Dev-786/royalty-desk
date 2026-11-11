"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useRelease } from "./release-context";

const sections = [
  { path: "", label: "Overview" },
  { path: "/agreement", label: "Agreement" },
  { path: "/statements", label: "Statements" },
  { path: "/settlement", label: "Payments" },
  { path: "/agent", label: "My agent" }
] as const;

export function ReleaseWorkspace({ children }: Readonly<{ children: ReactNode }>) {
  const { releaseId, release, accountId, loading, error, refresh } = useRelease();
  const pathname = usePathname();
  if (loading && !release) return <div className="page-stack"><Skeleton className="h-6 w-40" /><Skeleton className="h-32 w-full" /><Skeleton className="h-80 w-full" /></div>;
  if (!release) return <div className="page-stack narrow-page"><Link href="/" className="back-link"><ArrowLeft size={16} /> All releases</Link><Card><CardContent className="empty-state"><strong>Could not load this release.</strong><p>{error ?? "Check the ID or your testnet connection and try again."}</p><Button variant="outline" onClick={() => { void refresh(); }}>Try again</Button></CardContent></Card></div>;
  const role = accountId === release.administrator_id ? "Administrator" : release.accepted_owner_ids.includes(accountId ?? "") ? "Owner" : release.invited_owner_ids.includes(accountId ?? "") ? "Invited owner" : accountId === release.funder_id ? "Funder" : "Viewing public contract state";
  return <div className="page-stack release-page"><Link href="/" className="back-link"><ArrowLeft size={16} /> All releases</Link><header className="release-header"><div><span className="page-kicker">Recording {release.recording_id}</span><h1>{release.release_id}</h1><p>{release.accepted_owner_ids.length} of {release.invited_owner_ids.length} owners accepted · {release.active_agreement_version ? `Agreement v${release.active_agreement_version} active` : "No active agreement yet"}</p></div><div className="release-header-actions"><Badge variant="secondary">{role}</Badge><Button variant="outline" size="sm" onClick={() => { void refresh(); }}><RefreshCw size={14} /> Refresh</Button></div></header><nav className="release-nav" aria-label="Release sections">{sections.map(({ path, label }) => { const href = `/releases/${encodeURIComponent(releaseId)}${path}`; return <Link key={path} href={href} className={pathname === href ? "release-nav-link active" : "release-nav-link"} aria-current={pathname === href ? "page" : undefined}>{label}</Link>; })}</nav>{children}</div>;
}
