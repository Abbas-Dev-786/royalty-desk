"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Bot, KeyRound, LockKeyhole } from "lucide-react";
import { ActionNotice, type Notice } from "@/components/action-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, jsonRequest, nearToYocto, readApi, sendApi, yoctoToNear } from "@/lib/royaltydesk-client";
import { useRelease } from "./release-context";

const accountSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{1,63}\.testnet$/, "Enter a NEAR testnet agent account.");
const settingsSchema = z.object({ agentAccountId: accountSchema, instructions: z.string().max(16_384, "Keep instructions under 16 KB.") });
const mandateSchema = z.object({ agentId: accountSchema, capNear: z.string().regex(/^\d+(?:\.\d{1,24})?$/, "Enter a NEAR amount with up to 24 decimals.").refine((value) => /^\d+(?:\.\d{1,24})?$/.test(value) && BigInt(nearToYocto(value)) > 0n, "Enter an amount above zero.") });
const runSchema = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a valid month."), mode: z.enum(["fixture", "live"]) });
interface Profile { readonly agentAccountId: string | null; readonly instructions: string | null; }
interface SharedProposal { readonly id: string; readonly parentId: string | null; readonly ownerAccountId: string; readonly action: { readonly type: "propose_terms" | "counter_terms"; readonly agreement: { readonly participants: readonly { readonly ownerId: string; readonly basisPoints: string }[]; readonly recoupment: { readonly capYocto: string; readonly beneficiaryId: string } | null } }; }

export function AgentPage() {
  const { releaseId, release, accountId, refresh } = useRelease();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [proposals, setProposals] = useState<readonly SharedProposal[]>([]);
  const [busy, setBusy] = useState(false);
  const settings = useForm<z.infer<typeof settingsSchema>>({ resolver: zodResolver(settingsSchema), defaultValues: { agentAccountId: "", instructions: "" } });
  const mandate = useForm<z.infer<typeof mandateSchema>>({ resolver: zodResolver(mandateSchema), defaultValues: { agentId: "", capNear: "1" } });
  const run = useForm<z.infer<typeof runSchema>>({ resolver: zodResolver(runSchema), defaultValues: { period: new Date().toISOString().slice(0, 7), mode: "fixture" } });
  const { reset: resetSettings } = settings;
  const { setValue: setMandateValue } = mandate;
  const owner = !!release && !!accountId && release.accepted_owner_ids.includes(accountId);
  const currentMandate = release?.mandates.find((entry) => entry.owner_id === accountId && !entry.revoked && BigInt(entry.expires_at_nanoseconds) > BigInt(Date.now()) * 1_000_000n);

  useEffect(() => {
    if (!owner) return;
    void readApi<Profile>(`/api/releases/${encodeURIComponent(releaseId)}/agents/me`).then((profile) => {
      resetSettings({ agentAccountId: profile.agentAccountId ?? "", instructions: profile.instructions ?? "" });
      if (profile.agentAccountId) setMandateValue("agentId", profile.agentAccountId);
    }).catch(() => undefined);
  }, [owner, releaseId, resetSettings, setMandateValue]);
  useEffect(() => {
    if (!owner) return;
    void readApi<SharedProposal[]>(`/api/releases/${encodeURIComponent(releaseId)}/agents/proposals`).then(setProposals).catch(() => setProposals([]));
  }, [owner, releaseId, result]);

  if (!release) return null;
  async function save(values: z.infer<typeof settingsSchema>): Promise<void> {
    setBusy(true); setNotice(null);
    try { await sendApi(`/api/releases/${encodeURIComponent(releaseId)}/agents/me`, jsonRequest(values, "PUT")); setNotice({ title: "Instructions saved", description: "Your private instructions are stored for this owner's agent. No wallet transaction was needed." }); }
    catch (cause) { setNotice({ title: "Instructions not saved", description: errorMessage(cause), error: true }); }
    finally { setBusy(false); }
  }

  async function grant(values: z.infer<typeof mandateSchema>): Promise<void> {
    setBusy(true); setNotice(null);
    try {
      if (!release!.active_agreement_version) throw new Error("Activate an agreement before delegating authority.");
      const result = await sendApi(`/api/releases/${encodeURIComponent(releaseId)}/mandates`, jsonRequest({ agentId: values.agentId, agreementVersion: release!.active_agreement_version, actions: ["approve_settlement", "dispute_settlement"], maxGrossYocto: nearToYocto(values.capNear), expiresAtNanoseconds: (BigInt(Date.now() + 86_400_000) * 1_000_000n).toString() }));
      await refresh();
      setNotice({ title: "One-day permission granted", description: "Your agent can approve or dispute a matching settlement within this limit. It cannot change agreements or redirect payouts.", transactionHash: result.transactionHash });
    } catch (cause) { setNotice({ title: "Permission not granted", description: errorMessage(cause), error: true }); }
    finally { setBusy(false); }
  }

  async function revoke(): Promise<void> {
    setBusy(true); setNotice(null);
    try { const response = await sendApi(`/api/releases/${encodeURIComponent(releaseId)}/mandates`, { method: "DELETE" }); await refresh(); setNotice({ title: "Agent permission revoked", description: "The contract will reject further actions under this mandate.", transactionHash: response.transactionHash }); }
    catch (cause) { setNotice({ title: "Permission not revoked", description: errorMessage(cause), error: true }); }
    finally { setBusy(false); }
  }

  async function ask(values: z.infer<typeof runSchema>): Promise<void> {
    setBusy(true); setNotice(null); setResult(null);
    try { const response = await sendApi(`/api/releases/${encodeURIComponent(releaseId)}/agents/run`, jsonRequest(values)); setResult(response.data); setNotice({ title: "Agent run completed", description: values.mode === "fixture" ? "This was a deterministic preview. It did not use a live model." : "The worker returned a live NEAR AI result. Review it before taking a wallet action." }); }
    catch (cause) { setNotice({ title: "Agent could not run", description: errorMessage(cause), error: true }); }
    finally { setBusy(false); }
  }

  return <div className="page-stack"><header className="page-heading"><span className="page-kicker">My agent</span><h2>Give assistance a narrow job and a clear limit.</h2><p>Your agent can review evidence and suggest a response. A wallet mandate is separate, expires after one day, and only allows the actions you choose.</p></header>{!owner ? <Card><CardContent className="empty-state"><strong>Connect an accepted owner wallet to use an agent.</strong><p>Administrators and funders do not receive owner agent permissions unless their wallet is also an accepted owner.</p></CardContent></Card> : <div className="content-with-aside"><div className="page-stack"><Card><CardHeader><div className="panel-header"><CardTitle>Private instructions</CardTitle><Badge variant="outline">Only your agent context</Badge></div></CardHeader><CardContent><form onSubmit={settings.handleSubmit(save)} noValidate><FieldGroup><Controller name="agentAccountId" control={settings.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="profile-agent-id">Agent testnet account</FieldLabel><Input {...field} id="profile-agent-id" placeholder="my-agent.testnet" aria-invalid={fieldState.invalid} />{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</Field>} /><Controller name="instructions" control={settings.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="agent-instructions">What should the agent watch for?</FieldLabel><Textarea {...field} id="agent-instructions" rows={5} placeholder="Flag deductions without a receipt. Ask me before approving a corrected statement." aria-invalid={fieldState.invalid} /><FieldDescription>Keep private details concise. These instructions are encrypted on this server.</FieldDescription>{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</Field>} /><Button type="submit" disabled={busy}>Save instructions</Button></FieldGroup></form></CardContent></Card>
  <Card><CardHeader><div className="panel-header"><CardTitle>Wallet permission</CardTitle><KeyRound size={18} /></div></CardHeader><CardContent>{currentMandate && <div className="mandate-summary"><strong>Active mandate for {currentMandate.agent_id}</strong><p>Limit {yoctoToNear(currentMandate.max_gross_yocto)} NEAR gross · Agreement v{currentMandate.agreement_version}</p><Button variant="outline" onClick={() => { void revoke(); }} disabled={busy}>Revoke permission</Button></div>}<form onSubmit={mandate.handleSubmit(grant)} noValidate><FieldGroup><Controller name="agentId" control={mandate.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="mandate-agent-id">Agent account</FieldLabel><Input {...field} id="mandate-agent-id" placeholder="my-agent.testnet" aria-invalid={fieldState.invalid} />{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</Field>} /><Controller name="capNear" control={mandate.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="mandate-cap">Maximum statement gross (NEAR)</FieldLabel><Input {...field} id="mandate-cap" inputMode="decimal" aria-invalid={fieldState.invalid} /><FieldDescription>This is a limit per settlement, not permission to spend this amount.</FieldDescription>{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</Field>} /><Button type="submit" disabled={busy || !release.active_agreement_version}>Grant one-day permission</Button></FieldGroup></form></CardContent></Card>
  <Card><CardHeader><CardTitle>Ask your agent</CardTitle></CardHeader><CardContent><form onSubmit={run.handleSubmit(ask)} noValidate><FieldGroup><Controller name="period" control={run.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="agent-period">Statement month</FieldLabel><Input {...field} id="agent-period" type="month" aria-invalid={fieldState.invalid} />{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</Field>} /><Controller name="mode" control={run.control} render={({ field }) => <Field><FieldLabel htmlFor="agent-mode">Run mode</FieldLabel><Select value={field.value} onValueChange={field.onChange}><SelectTrigger id="agent-mode" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="fixture">Preview with a test fixture</SelectItem><SelectItem value="live">Use NEAR AI Cloud</SelectItem></SelectContent></Select><FieldDescription>Live mode uses the configured paid gateway and the worker's private context.</FieldDescription></Field>} /><Button type="submit" disabled={busy}><Bot size={16} /> {busy ? "Running…" : "Review with agent"}</Button></FieldGroup></form>{result && <details className="agent-result"><summary>View agent response</summary><pre>{JSON.stringify(result, null, 2)}</pre></details>}</CardContent></Card>
  <Card><CardHeader><CardTitle>Shared terms proposals</CardTitle></CardHeader><CardContent>{proposals.length === 0 ? <p>No agent terms have been proposed. Owners can prepare terms manually on the Agreement page.</p> : proposals.map((proposal) => <div className="owner-row" key={proposal.id}><div><strong>{proposal.action.type === "counter_terms" ? "Counteroffer" : "Proposal"} from {proposal.ownerAccountId}</strong><small>{proposal.parentId ? `Responds to ${proposal.parentId}` : proposal.id}</small><p>{proposal.action.agreement.participants.map((participant) => `${participant.ownerId}: ${participant.basisPoints} bp`).join(" · ")}</p><p>{proposal.action.agreement.recoupment ? `Recoupment ${yoctoToNear(proposal.action.agreement.recoupment.capYocto)} NEAR to ${proposal.action.agreement.recoupment.beneficiaryId}` : "No recoupment"}</p></div></div>)}</CardContent></Card></div><aside className="guidance-panel"><LockKeyhole size={22} /><h2>You stay in control</h2><p>The model cannot sign agreements or change payout addresses. Delegated settlement calls still pass the contract's scope, limit, and expiry checks.</p><p>Keep the agent key on the private worker host. Your browser never receives it.</p></aside></div>}<ActionNotice notice={notice} /></div>;
}
