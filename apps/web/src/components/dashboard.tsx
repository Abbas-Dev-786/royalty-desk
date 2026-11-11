"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, CircleCheck, FileText, HandCoins, Users } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { readApi } from "@/lib/royaltydesk-client";

interface ListedRelease { readonly releaseId: string; readonly roles: readonly string[]; readonly invited: boolean; }
const openSchema = z.object({ releaseId: z.string().trim().min(1, "Enter a release ID.").max(64) });
type OpenValues = z.infer<typeof openSchema>;

const steps = [
  { icon: Users, title: "Set up the release", text: "Name the recording and choose the people who will approve its terms." },
  { icon: CircleCheck, title: "Agree on ownership", text: "Owners accept the invitation, review their shares, and approve one frozen agreement." },
  { icon: FileText, title: "Review a statement", text: "Import a private CSV. Everyone sees the validation result before approving a period." },
  { icon: HandCoins, title: "Pay from the reserve", text: "The funder deposits testnet NEAR; the contract records each confirmed payout." }
] as const;

export function Dashboard() {
  const router = useRouter();
  const [accountId, setAccountId] = useState<string | null>(null);
  const [releases, setReleases] = useState<readonly ListedRelease[]>([]);
  const [loading, setLoading] = useState(true);
  const form = useForm<OpenValues>({ resolver: zodResolver(openSchema), defaultValues: { releaseId: "" } });

  useEffect(() => {
    const refresh = async () => {
      setLoading(true);
      try {
        const session = await readApi<{ accountId: string }>("/api/auth/me");
        setAccountId(session.accountId);
        setReleases(await readApi<ListedRelease[]>("/api/releases"));
      } catch {
        setAccountId(null);
        setReleases([]);
      } finally {
        setLoading(false);
      }
    };
    void refresh();
    window.addEventListener("royaltydesk-session-changed", refresh);
    return () => window.removeEventListener("royaltydesk-session-changed", refresh);
  }, []);

  return (
    <div className="page-stack">
      <section className="dashboard-hero" aria-labelledby="dashboard-title">
        <div className="hero-copy"><Badge variant="outline">Royalty workspace</Badge><h1 id="dashboard-title">Know where every release stands.</h1><p>Bring owners, evidence, and payments into one clear sequence. Every approval and payout is checked by the NEAR testnet contract.</p><div className="hero-actions"><Link href="/releases/new" className={buttonVariants({ size: "lg" })}>Create a release <ArrowRight size={16} /></Link><span>Using testnet NEAR, not real royalty revenue.</span></div></div>
        <div className="hero-record" aria-hidden="true"><span className="record-ring" /><span className="record-label">RD<br />01</span></div>
      </section>

      <section className="dashboard-section" aria-labelledby="releases-heading">
        <div className="section-heading"><div><h2 id="releases-heading">Your releases</h2><p>Open a release to see its current step and available actions.</p></div><Link href="/releases/new" className="text-link">New release <ArrowRight size={15} /></Link></div>
        {loading ? <Card><CardContent className="py-6 text-muted-foreground">Loading your workspace…</CardContent></Card> : !accountId ? <Card><CardContent className="empty-state"><strong>Connect a testnet wallet to see your releases.</strong><p>Use the button in the top right. Signing the login message does not transfer funds.</p></CardContent></Card> : releases.length ? <div className="release-list">{releases.map((release) => <Link className="release-row" href={`/releases/${encodeURIComponent(release.releaseId)}`} key={release.releaseId}><span className="release-row-mark">{release.releaseId.slice(0, 1).toUpperCase()}</span><span><strong>{release.releaseId}</strong><small>{release.roles.join(" · ")}</small></span>{release.invited && <Badge variant="secondary">Invitation waiting</Badge>}<ArrowRight size={18} /></Link>)}</div> : <Card><CardContent className="empty-state"><strong>No releases are linked to this wallet yet.</strong><p>Create one as an administrator, or ask an administrator to include this wallet in the owner list.</p><Link href="/releases/new" className={buttonVariants({ variant: "outline" })}>Set up a release</Link></CardContent></Card>}
      </section>

      <section className="dashboard-section" aria-labelledby="workflow-heading"><div className="section-heading"><div><h2 id="workflow-heading">How a release moves forward</h2><p>Each step unlocks the next. The contract keeps the final record.</p></div></div><div className="steps-grid">{steps.map(({ icon: Icon, title, text }, index) => <div className="step-item" key={title}><span className="step-number">{String(index + 1).padStart(2, "0")}</span><Icon size={22} strokeWidth={1.7} /><h3>{title}</h3><p>{text}</p></div>)}</div></section>

      <section className="dashboard-section compact" aria-labelledby="open-heading"><Card><CardHeader><CardTitle id="open-heading">Have a release ID?</CardTitle></CardHeader><CardContent><form className="inline-form" onSubmit={form.handleSubmit(({ releaseId }) => router.push(`/releases/${encodeURIComponent(releaseId.trim())}`))}><Controller name="releaseId" control={form.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="open-release-id">Release ID</FieldLabel><Input {...field} id="open-release-id" placeholder="e.g. first-single-2026" aria-invalid={fieldState.invalid} />{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</Field>} /><Button type="submit" variant="outline">Open release</Button></form></CardContent></Card></section>
    </div>
  );
}
