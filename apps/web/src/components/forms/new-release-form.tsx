"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ActionNotice, type Notice } from "@/components/action-notice";
import { errorMessage, jsonRequest, readApi, sendApi } from "@/lib/royaltydesk-client";

const accountId = /^[a-z0-9][a-z0-9._-]{1,63}\.testnet$/;
const releaseSchema = z.object({
  releaseId: z.string().trim().min(2, "Give this release a short ID.").max(64, "Use 64 characters or fewer.").regex(/^[a-z0-9][a-z0-9._-]*$/, "Use lowercase letters, numbers, dots, hyphens or underscores."),
  recordingId: z.string().trim().min(1, "Enter a recording ID.").max(64),
  funderId: z.string().trim().regex(accountId, "Enter a NEAR testnet account, such as you.testnet."),
  owners: z.string().min(1, "Enter the owner accounts.").superRefine((value, context) => {
    const ids = parseOwners(value);
    if (ids.length < 2 || ids.length > 5) context.addIssue({ code: "custom", message: "List 2 to 5 owner accounts." });
    if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: "Each owner may appear only once." });
    if (ids.some((id) => !accountId.test(id))) context.addIssue({ code: "custom", message: "Every owner must be a valid .testnet account." });
  })
});
type ReleaseValues = z.infer<typeof releaseSchema>;

function parseOwners(value: string): string[] { return value.split(/[\n,]/).map((entry) => entry.trim()).filter(Boolean); }

export function NewReleaseForm() {
  const router = useRouter();
  const [notice, setNotice] = useState<Notice | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const form = useForm<ReleaseValues>({ resolver: zodResolver(releaseSchema), defaultValues: { releaseId: "", recordingId: "", funderId: "", owners: "" } });
  const { getValues, setValue } = form;

  useEffect(() => { void readApi<{ accountId: string }>("/api/auth/me").then((session) => { if (!getValues("funderId")) setValue("funderId", session.accountId); }).catch(() => undefined); }, [getValues, setValue]);

  async function confirm(releaseId: string): Promise<void> {
    await sendApi("/api/releases/confirm", jsonRequest({ releaseId }));
    router.push(`/releases/${encodeURIComponent(releaseId)}`);
  }

  async function create(values: ReleaseValues): Promise<void> {
    setNotice(null);
    const releaseId = values.releaseId.trim();
    try {
      const created = await sendApi("/api/releases", jsonRequest({ releaseId, recordingId: values.recordingId.trim(), funderId: values.funderId.trim(), invitedOwnerIds: parseOwners(values.owners) }));
      setPendingId(releaseId);
      setNotice({ title: "Release sent to testnet", description: "The wallet transaction succeeded. Confirming the release in this workspace…", transactionHash: created.transactionHash });
      try { await confirm(releaseId); } catch (cause) { setNotice({ title: "Confirm this release", description: `${errorMessage(cause)} The wallet transaction may already be on-chain; use the confirmation button below.`, error: true, transactionHash: created.transactionHash }); }
    } catch (cause) { setNotice({ title: "Release not created", description: errorMessage(cause), error: true }); }
  }

  return <div className="page-stack narrow-page"><Link href="/" className="back-link"><ArrowLeft size={16} /> All releases</Link><header className="page-heading"><span className="page-kicker">Start a release</span><h1>Bring the right people into the room.</h1><p>A release holds one recording, its invited owners, an agreement, and later payment periods. The owner list is fixed when you create it on testnet.</p></header><div className="content-with-aside"><Card><CardHeader><CardTitle>Release details</CardTitle></CardHeader><CardContent><form onSubmit={form.handleSubmit(create)} noValidate><FieldGroup>
    <Controller name="releaseId" control={form.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="release-id">Release ID</FieldLabel><Input {...field} id="release-id" autoComplete="off" placeholder="first-single-2026" aria-invalid={fieldState.invalid} /><FieldDescription>A short identifier you can share with the owners.</FieldDescription>{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</Field>} />
    <Controller name="recordingId" control={form.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="recording-id">Recording ID</FieldLabel><Input {...field} id="recording-id" autoComplete="off" placeholder="ISRC or your catalog ID" aria-invalid={fieldState.invalid} />{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</Field>} />
    <Controller name="funderId" control={form.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="funder-id">Who will deposit testnet NEAR?</FieldLabel><Input {...field} id="funder-id" autoComplete="off" placeholder="your-account.testnet" aria-invalid={fieldState.invalid} /><FieldDescription>This account can be the administrator or another testnet wallet.</FieldDescription>{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</Field>} />
    <Controller name="owners" control={form.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="owners">Owner accounts</FieldLabel><Textarea {...field} id="owners" rows={4} placeholder={"owner-one.testnet\nowner-two.testnet"} aria-invalid={fieldState.invalid} /><FieldDescription>Enter 2–5 real .testnet accounts, one per line or comma separated. Include your own wallet only if you are also an owner.</FieldDescription>{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</Field>} />
    <div className="form-footer"><Button type="submit" disabled={form.formState.isSubmitting}>{form.formState.isSubmitting ? "Creating…" : "Create release on testnet"}<ArrowRight size={16} /></Button><p>Your wallet will ask you to approve one contract transaction.</p></div>
  </FieldGroup></form><ActionNotice notice={notice} />{pendingId && notice?.error && <Button variant="outline" onClick={() => { void confirm(pendingId).catch((cause) => setNotice({ title: "Confirmation still pending", description: errorMessage(cause), error: true })); }}>Confirm existing transaction</Button>}</CardContent></Card><aside className="guidance-panel"><LockKeyhole size={22} /><h2>Before you create</h2><ol><li>Connect the wallet that will administer this release.</li><li>Check every owner account carefully. You cannot add owners afterward.</li><li>Owners will connect their own wallets to accept the invitation.</li></ol><p>Creating a release does not move NEAR. Deposits happen later, after owners approve the agreement and statement.</p></aside></div></div>;
}
