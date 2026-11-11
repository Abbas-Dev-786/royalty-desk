"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, FileText, ShieldCheck, Upload } from "lucide-react";
import { ActionNotice, type Notice } from "@/components/action-notice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { errorMessage, readApi, sendApi, yoctoToNear } from "@/lib/royaltydesk-client";
import { useRelease } from "./release-context";

interface StatementRow { readonly period: string; readonly revision: string; readonly statementId: string; readonly grossYocto: string; readonly normalizedHash: string; readonly validation: string; readonly createdAtMs: number; }
const schema = z.object({ csv: z.string().trim().min(1, "Choose a CSV or paste its contents.").max(1_048_576, "Use a CSV smaller than 1 MB.") });
type Values = z.infer<typeof schema>;

function validationSummary(raw: string): { payable: boolean; issues: number } {
  try { const value = JSON.parse(raw) as { payable?: unknown; unsupportedClaimLineIds?: unknown }; return { payable: value.payable === true, issues: Array.isArray(value.unsupportedClaimLineIds) ? value.unsupportedClaimLineIds.length : 0 }; }
  catch { return { payable: false, issues: 0 }; }
}

export function StatementsPage() {
  const { releaseId, release, accountId } = useRelease();
  const [rows, setRows] = useState<readonly StatementRow[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { csv: "" } });
  const administrator = !!release && accountId === release.administrator_id;

  useEffect(() => {
    if (!release || !accountId) return;
    void readApi<StatementRow[]>(`/api/releases/${encodeURIComponent(releaseId)}/statements`).then(setRows).catch(() => setRows([]));
  }, [release, accountId, releaseId]);

  async function importCsv(values: Values): Promise<void> {
    setLoading(true); setNotice(null);
    try {
      const result = await sendApi(`/api/releases/${encodeURIComponent(releaseId)}/statements`, { method: "POST", headers: { "content-type": "text/csv" }, body: selectedFile ? await selectedFile.arrayBuffer() : values.csv });
      const period = String(result.data.period ?? "");
      const payable = result.data.payable === true;
      const issues = Array.isArray(result.data.unsupportedClaimLineIds) ? result.data.unsupportedClaimLineIds.length : 0;
      setNotice({ title: payable ? "Statement ready for review" : "Statement imported with a hold", description: payable ? `The ${period} statement passed validation. Review its totals before opening a payment period.` : `${issues} unsupported claim line${issues === 1 ? " needs" : "s need"} evidence or correction before payment.` });
      setRows(await readApi<StatementRow[]>(`/api/releases/${encodeURIComponent(releaseId)}/statements`));
    } catch (cause) { setNotice({ title: "Statement not imported", description: errorMessage(cause), error: true }); }
    finally { setLoading(false); }
  }

  if (!release) return null;
  return <div className="page-stack"><header className="page-heading"><span className="page-kicker">Statements</span><h2>Check the evidence before opening payments.</h2><p>The administrator imports a private CSV for each month. Owners can review its validation summary; a statement with unsupported claims cannot be paid.</p></header><div className="content-with-aside"><div className="page-stack"><Card><CardHeader><CardTitle>Imported statements</CardTitle></CardHeader><CardContent>{rows.length ? <div className="statement-list">{rows.map((row) => { const validation = validationSummary(row.validation); return <div className="statement-row" key={`${row.period}-${row.revision}`}><span className="statement-icon"><FileText size={19} /></span><div><strong>{row.period} · revision {row.revision}</strong><small>{row.statementId} · {yoctoToNear(row.grossYocto)} NEAR gross</small></div><Badge variant={validation.payable ? "secondary" : "destructive"}>{validation.payable ? "Payable" : `${validation.issues} claims to review`}</Badge></div>; })}</div> : <div className="empty-state"><strong>No statements imported yet.</strong><p>Start with a CSV for a month covered by the active agreement.</p></div>}</CardContent></Card>
  {administrator && <Card><CardHeader><CardTitle>Import a statement</CardTitle></CardHeader><CardContent><form onSubmit={form.handleSubmit(importCsv)} noValidate><FieldGroup><Field><FieldLabel htmlFor="statement-file">Choose a CSV file</FieldLabel><Input id="statement-file" type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; if (!file) { setSelectedFile(null); return; } if (file.size > 1_048_576) { setSelectedFile(null); setNotice({ title: "File too large", description: "Choose a CSV smaller than 1 MB.", error: true }); return; } setSelectedFile(file); void file.text().then((text) => form.setValue("csv", text, { shouldValidate: true })); }} /><FieldDescription>The original bytes are kept in private encrypted storage. Maximum 1 MB.</FieldDescription></Field><Controller name="csv" control={form.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="statement-csv">Or paste CSV contents</FieldLabel><Textarea {...field} onChange={(event) => { setSelectedFile(null); field.onChange(event); }} id="statement-csv" rows={7} className="font-mono text-xs" placeholder="statement_id,line_id,period,recording_id,platform,row_type,amount,currency,deduction_code,evidence_ref" aria-invalid={fieldState.invalid} /><FieldDescription>Use the recording ID {release.recording_id}. Amounts are decimal NEAR; the app converts them to integer yoctoNEAR.</FieldDescription>{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</Field>} /><div className="form-footer"><Button type="submit" disabled={loading}>{loading ? "Checking…" : "Import and validate statement"}<Upload size={16} /></Button><p>This step stores evidence. It does not move funds.</p></div></FieldGroup></form></CardContent></Card>}</div><aside className="guidance-panel"><ShieldCheck size={22} /><h2>What gets checked?</h2><p>Each line must use the agreed recording and a valid payment month. Unsupported deductions are held for evidence or correction.</p><p>Owners see the validation summary. The administrator keeps the original private file.</p><Link href={`/releases/${encodeURIComponent(releaseId)}/settlement`} className="text-link">Go to payments <ArrowRight size={16} /></Link></aside></div><ActionNotice notice={notice} /></div>;
}
