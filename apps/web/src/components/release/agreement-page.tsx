"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { CircleCheck, FileDown, LockKeyhole } from "lucide-react";
import { ActionNotice, type Notice } from "@/components/action-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { errorMessage, jsonRequest, nearToYocto, sendApi } from "@/lib/royaltydesk-client";
import { useRelease } from "./release-context";

const schema = z.object({
  effectivePeriod: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose the first payment month."),
  participants: z.array(z.object({ ownerId: z.string(), basisPoints: z.string().regex(/^\d{1,5}$/, "Enter whole basis points.") })).min(2).max(5),
  recoupmentMode: z.enum(["none", "enabled"]),
  recoupmentCode: z.string(), beneficiaryId: z.string(), capNear: z.string()
}).superRefine((values, context) => {
  if (values.participants.some((participant) => !/^\d+$/.test(participant.basisPoints))) return;
  const total = values.participants.reduce((sum, participant) => sum + BigInt(participant.basisPoints || "0"), 0n);
  if (total !== 10_000n) context.addIssue({ code: "custom", path: ["participants"], message: "Owner shares must add up to 10,000 basis points (100%)." });
  if (values.recoupmentMode === "enabled") {
    if (!values.recoupmentCode.trim()) context.addIssue({ code: "custom", path: ["recoupmentCode"], message: "Enter the deduction code used in statements." });
    if (!values.participants.some((entry) => entry.ownerId === values.beneficiaryId)) context.addIssue({ code: "custom", path: ["beneficiaryId"], message: "Choose an owner in this agreement." });
    try { if (BigInt(nearToYocto(values.capNear)) === 0n) throw new Error(); } catch { context.addIssue({ code: "custom", path: ["capNear"], message: "Enter a positive NEAR cap." }); }
  }
});
type Values = z.infer<typeof schema>;

export function AgreementPage() {
  const { releaseId, release, accountId, refresh } = useRelease();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busyVersion, setBusyVersion] = useState<string | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { effectivePeriod: "", participants: [], recoupmentMode: "none", recoupmentCode: "", beneficiaryId: "", capNear: "" } });
  const { reset } = form;

  useEffect(() => {
    if (!release) return;
    const active = release.agreements.find((agreement) => agreement.active);
    const ids = release.accepted_owner_ids;
    const portion = ids.length ? Math.floor(10_000 / ids.length) : 0;
    const shares = ids.map((ownerId, index) => ({ ownerId, basisPoints: String(active?.participants.find((entry) => entry.owner_id === ownerId)?.basis_points ?? (index === 0 ? 10_000 - portion * (ids.length - 1) : portion)) }));
    reset({ effectivePeriod: new Date().toISOString().slice(0, 7), participants: shares, recoupmentMode: "none", recoupmentCode: "", beneficiaryId: ids[0] ?? "", capNear: "" });
  }, [release, reset]);

  if (!release) return null;
  const administrator = accountId === release.administrator_id;
  const owner = !!accountId && release.accepted_owner_ids.includes(accountId);
  const nextVersion = String(release.agreements.length + 1);
  const latest = release.agreements.at(-1);

  async function confirm(version: string): Promise<void> {
    await sendApi(`/api/releases/${encodeURIComponent(releaseId)}/agreements/confirm`, jsonRequest({ version }));
    await refresh();
    setBusyVersion(null);
    setNotice({ title: "Agreement confirmed", description: "The frozen terms now match the document in this workspace." });
  }

  async function prepare(values: Values): Promise<void> {
    setNotice(null);
    try {
      const recoupment = values.recoupmentMode === "enabled" ? { code: values.recoupmentCode.trim(), beneficiaryId: values.beneficiaryId.trim(), capYocto: nearToYocto(values.capNear) } : null;
      const result = await sendApi(`/api/releases/${encodeURIComponent(releaseId)}/agreements`, jsonRequest({ version: nextVersion, rules: { schemaVersion: "1", releaseId, recordingId: release!.recording_id, effectivePeriod: values.effectivePeriod, participants: values.participants, recoupment } }));
      setBusyVersion(nextVersion);
      try { await confirm(nextVersion); }
      catch (cause) { setNotice({ title: "Confirm the frozen agreement", description: `${errorMessage(cause)} The wallet transaction may be complete; confirm it here before owners approve.`, error: true, transactionHash: result.transactionHash }); }
    } catch (cause) { setNotice({ title: "Agreement not prepared", description: errorMessage(cause), error: true }); }
  }

  async function approve(version: string, approvalDigest: string): Promise<void> {
    setNotice(null);
    try { const result = await sendApi(`/api/releases/${encodeURIComponent(releaseId)}/agreements/approve`, jsonRequest({ version, approvalDigest })); await refresh(); setNotice({ title: "Agreement approval sent", description: "Your wallet approved this exact version. The agreement becomes active when every owner approves.", transactionHash: result.transactionHash }); }
    catch (cause) { setNotice({ title: "Approval not sent", description: errorMessage(cause), error: true }); }
  }

  return <div className="page-stack"><header className="page-heading"><span className="page-kicker">Agreement</span><h2>Make the split clear before anyone is paid.</h2><p>The administrator prepares one version. Each accepted owner reviews the frozen document and approves that exact version with their wallet.</p></header><div className="content-with-aside"><div className="page-stack"><Card><CardHeader><CardTitle>Current agreement</CardTitle></CardHeader><CardContent>{latest ? <div className="agreement-summary"><div><strong>Version {latest.version}</strong><Badge variant={latest.active ? "secondary" : "outline"}>{latest.active ? "Active" : latest.superseded ? "Superseded" : "Waiting for approvals"}</Badge></div><p>Document hash: <code>{latest.document_hash.slice(0, 16)}…</code></p><a className="text-link" href={`/api/releases/${encodeURIComponent(releaseId)}/agreements?version=${encodeURIComponent(latest.version)}`} target="_blank" rel="noreferrer"><FileDown size={16} /> Read frozen document</a>{owner && !latest.active && !latest.superseded && <Button onClick={() => { void approve(latest.version, latest.approval_digest); }}>Approve version {latest.version}</Button>}</div> : <div className="empty-state"><strong>No agreement has been prepared.</strong><p>Wait for at least two owners to accept, then set their shares below.</p></div>}</CardContent></Card>
  {administrator && <Card><CardHeader><CardTitle>{latest ? `Prepare version ${nextVersion}` : "Set owner shares"}</CardTitle></CardHeader><CardContent><form onSubmit={form.handleSubmit(prepare)} noValidate><FieldGroup><Controller name="effectivePeriod" control={form.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="effective-period">First payment month</FieldLabel><Input {...field} id="effective-period" type="month" aria-invalid={fieldState.invalid} /><FieldDescription>Statements before this month cannot use this agreement.</FieldDescription>{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</Field>} /><div className="share-table"><div className="share-table-head"><span>Accepted owner</span><span>Share in basis points</span></div>{form.watch("participants").map((participant, index) => <div className="share-row" key={participant.ownerId}><strong>{participant.ownerId}</strong><Controller name={`participants.${index}.basisPoints`} control={form.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel className="sr-only" htmlFor={`share-${index}`}>Share for {participant.ownerId}</FieldLabel><Input {...field} id={`share-${index}`} inputMode="numeric" aria-invalid={fieldState.invalid} />{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</Field>} /></div>)}</div><p className="field-hint">10,000 basis points = 100%. For example, 6,000 means 60%.</p>{form.formState.errors.participants?.message && <p className="form-error" role="alert">{form.formState.errors.participants.message}</p>}
  <Controller name="recoupmentMode" control={form.control} render={({ field }) => <Field><FieldLabel htmlFor="recoupment-mode">Deduction cap</FieldLabel><Select value={field.value} onValueChange={field.onChange}><SelectTrigger id="recoupment-mode" className="w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No recoupment</SelectItem><SelectItem value="enabled">Add a capped recoupment</SelectItem></SelectContent></Select><FieldDescription>Only use this if the owners agreed to recover a documented cost first.</FieldDescription></Field>} />
  {form.watch("recoupmentMode") === "enabled" && <div className="form-grid"><Controller name="recoupmentCode" control={form.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="recoupment-code">Statement deduction code</FieldLabel><Input {...field} id="recoupment-code" aria-invalid={fieldState.invalid} />{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</Field>} /><Controller name="beneficiaryId" control={form.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="beneficiary-id">Owner receiving recovery</FieldLabel><Input {...field} id="beneficiary-id" aria-invalid={fieldState.invalid} />{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</Field>} /><Controller name="capNear" control={form.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="cap-near">Maximum to recover (NEAR)</FieldLabel><Input {...field} id="cap-near" inputMode="decimal" placeholder="0.5" aria-invalid={fieldState.invalid} />{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</Field>} /></div>}
  <div className="form-footer"><Button type="submit" disabled={form.formState.isSubmitting || release!.accepted_owner_ids.length < 2}>{form.formState.isSubmitting ? "Preparing…" : `Freeze version ${nextVersion}`}</Button><p>Your wallet signs the frozen terms. Owners then approve that version separately.</p></div></FieldGroup></form>{busyVersion && <Button variant="outline" onClick={() => { void confirm(busyVersion).catch((cause) => setNotice({ title: "Confirmation pending", description: errorMessage(cause), error: true })); }}>Confirm version {busyVersion} from contract</Button>}</CardContent></Card>}</div><aside className="guidance-panel"><LockKeyhole size={22} /><h2>What approval means</h2><p>Every owner sees the same document hash. A later edit creates a new version and needs fresh approvals.</p><ul><li>Only accepted owners can be included.</li><li>Shares must total exactly 100%.</li><li>Payments use the active version only.</li></ul>{!administrator && !owner && <p>Connect an invited owner wallet to review and approve terms.</p>}</aside></div><ActionNotice notice={notice} /></div>;
}
