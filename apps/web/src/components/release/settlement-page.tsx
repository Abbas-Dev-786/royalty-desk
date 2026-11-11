"use client";

import { useState } from "react";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowRight, CircleCheck, HandCoins, ShieldAlert } from "lucide-react";
import { ActionNotice, type Notice } from "@/components/action-notice";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ChainSettlement } from "@/lib/chain-types";
import { errorMessage, jsonRequest, nearToYocto, sendApi, viewSettlement, yoctoToNear } from "@/lib/royaltydesk-client";
import { useRelease } from "./release-context";

const periodSchema = z.object({ period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Choose a valid payment month.") });
const amountSchema = z.object({ amountNear: z.string().regex(/^\d+(?:\.\d{1,24})?$/, "Enter a NEAR amount with up to 24 decimal places.").refine((value) => /^\d+(?:\.\d{1,24})?$/.test(value) && BigInt(nearToYocto(value)) > 0n, "Enter an amount greater than zero.") });
const reasonSchema = z.object({ reason: z.string().trim().min(10, "Explain the problem in at least 10 characters.").max(1000) });

async function sha256(value: string): Promise<string> { const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join(""); }
function settlementDigest(settlement: ChainSettlement): Promise<string> { return sha256([settlement.period, settlement.revision, settlement.agreement_version, settlement.normalized_statement_hash, settlement.gross_yocto, settlement.deduction_evidence_hash, settlement.allocation_preview_hash].join("|")); }

export function SettlementPage() {
  const { releaseId, release, accountId } = useRelease();
  const [period, setPeriod] = useState("");
  const [settlement, setSettlement] = useState<ChainSettlement | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const periodForm = useForm<z.infer<typeof periodSchema>>({ resolver: zodResolver(periodSchema), defaultValues: { period: new Date().toISOString().slice(0, 7) } });
  const amountForm = useForm<z.infer<typeof amountSchema>>({ resolver: zodResolver(amountSchema), defaultValues: { amountNear: "" } });
  const reasonForm = useForm<z.infer<typeof reasonSchema>>({ resolver: zodResolver(reasonSchema), defaultValues: { reason: "" } });
  if (!release) return null;
  const administrator = accountId === release.administrator_id;
  const owner = !!accountId && release.accepted_owner_ids.includes(accountId);
  const funder = accountId === release.funder_id;
  const review = settlement?.status === "Review" || settlement?.status === "Held";

  async function loadPeriod(selected: string): Promise<void> {
    setPeriod(selected); setNotice(null);
    try { const current = await viewSettlement(releaseId, selected); setSettlement(current); amountForm.setValue("amountNear", yoctoToNear(current.gross_yocto)); }
    catch { setSettlement(null); }
  }

  async function act(label: string, url: string, init: RequestInit): Promise<void> {
    setBusy(true); setNotice(null);
    try { const result = await sendApi(url, init); if (period) await loadPeriod(period); setNotice({ title: `${label} sent`, description: "The wallet action was submitted to the testnet contract. Refresh this month to see the final state.", transactionHash: result.transactionHash }); }
    catch (cause) { setNotice({ title: `${label} could not be sent`, description: errorMessage(cause), error: true }); }
    finally { setBusy(false); }
  }

  function action(label: string, actionName: string, extra: Record<string, unknown> = {}): void { void act(label, `/api/releases/${encodeURIComponent(releaseId)}/settlements/actions`, jsonRequest({ action: actionName, period, ...extra })); }
  function prepare(operation: "open" | "revise"): void { void act(operation === "open" ? "Open statement" : "Statement revision", `/api/releases/${encodeURIComponent(releaseId)}/settlements`, jsonRequest({ period, operation })); }

  async function approve(): Promise<void> { if (!settlement) return; action("Approval", "approve_settlement", { digest: await settlementDigest(settlement) }); }
  async function dispute(reason: string): Promise<void> { action("Evidence hold", "dispute_settlement", { reasonHash: await sha256(reason.trim()) }); }

  return <div className="page-stack"><header className="page-heading"><span className="page-kicker">Payments</span><h2>Review first. Fund only what is approved.</h2><p>Each month has its own statement, owner decisions, reserve, and payout receipts. All amounts shown here are testnet NEAR.</p></header><Card><CardContent><form className="inline-form" onSubmit={periodForm.handleSubmit(({ period: value }) => { void loadPeriod(value); })}><Controller name="period" control={periodForm.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="payment-period">Payment month</FieldLabel><Input {...field} id="payment-period" type="month" aria-invalid={fieldState.invalid} />{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</Field>} /><Button type="submit" variant="outline">View month</Button></form></CardContent></Card>
  {period && !settlement && <Card><CardContent className="empty-state"><strong>No payment period is open for {period}.</strong><p>Import a payable statement and activate an agreement first. Then the administrator can open this month.</p><div className="empty-actions"><Link href={`/releases/${encodeURIComponent(releaseId)}/statements`} className={buttonVariants({ variant: "outline" })}>Review statements <ArrowRight size={15} /></Link>{administrator && <Button onClick={() => prepare("open")} disabled={busy}>Open validated statement</Button>}</div></CardContent></Card>}
  {settlement && <><div className="payment-metrics"><div><span>Reported gross</span><strong>{yoctoToNear(settlement.gross_yocto)} <small>NEAR</small></strong></div><div><span>In reserve</span><strong>{yoctoToNear(settlement.total_deposited_yocto)} <small>NEAR</small></strong></div><div><span>Paid to owners</span><strong>{yoctoToNear(settlement.successful_payouts_yocto)} <small>NEAR</small></strong></div></div><div className="content-with-aside"><div className="page-stack"><Card><CardHeader><div className="panel-header"><CardTitle>{period} settlement</CardTitle><Badge variant={settlement.status === "Complete" ? "secondary" : "outline"}>{settlement.status}</Badge></div></CardHeader><CardContent><p className="card-intro">Agreement version {settlement.agreement_version} · statement revision {settlement.revision}</p><div className="owner-list">{settlement.entitlements.map((entry) => <div className="owner-row" key={entry.owner_id}><span className="owner-icon"><HandCoins size={18} /></span><div><strong>{entry.owner_id}</strong><small>{yoctoToNear(entry.amount_yocto)} NEAR entitled</small></div><Badge variant={entry.status === "Paid" ? "secondary" : "outline"}>{entry.status}</Badge>{["Finalized", "Paying"].includes(settlement.status) && entry.status !== "Paid" && <Button variant="outline" size="sm" onClick={() => action("Payout", "execute_payout", { ownerId: entry.owner_id })} disabled={busy}>Pay</Button>}</div>)}</div><div className="settlement-foot"><span>Still owed: {yoctoToNear(settlement.unpaid_entitlements_yocto)} NEAR</span><span>Refundable: {yoctoToNear(settlement.refundable_yocto)} NEAR</span></div></CardContent></Card>
  {review && owner && <Card><CardHeader><CardTitle>Owner decision</CardTitle></CardHeader><CardContent><p>Approve the current statement if the evidence and allocation look right. A hold blocks finalization until it is cleared or the statement is corrected.</p><div className="action-row"><Button onClick={() => { void approve(); }} disabled={busy}><CircleCheck size={16} /> Approve this month</Button>{settlement.status === "Held" && <Button variant="outline" onClick={() => action("Hold clearance", "clear_dispute")} disabled={busy}>Clear my hold</Button>}</div><form onSubmit={reasonForm.handleSubmit(({ reason }) => { void dispute(reason); })} className="form-block"><Controller name="reason" control={reasonForm.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="hold-reason">Need to raise a hold?</FieldLabel><Textarea {...field} id="hold-reason" rows={3} placeholder="Describe the deduction or amount that needs evidence." aria-invalid={fieldState.invalid} /><FieldDescription>Only a hash of this reason goes on-chain. Keep the wording in your private records.</FieldDescription>{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</Field>} /><Button type="submit" variant="outline" disabled={busy}>Raise evidence hold</Button></form><div className="cancellation-action"><p>If this month should not be paid, all owners can vote to cancel it. Reserved funds then become refundable to the funder.</p><Button variant="ghost" onClick={() => action("Cancellation vote", "approve_cancellation")} disabled={busy}>Vote to cancel this month</Button></div></CardContent></Card>}
  {review && administrator && <Card><CardHeader><CardTitle>Administrator actions</CardTitle></CardHeader><CardContent><p>After owners approve, finalize this month to lock the payout amounts. If the statement changed, import a corrected revision first.</p><div className="action-row"><Button onClick={() => action("Finalization", "finalize_settlement")} disabled={busy}>Finalize approved month</Button><Button variant="outline" onClick={() => prepare("revise")} disabled={busy}>Use corrected statement</Button></div></CardContent></Card>}
  {funder && (review || BigInt(settlement.refundable_yocto) > 0n) && <Card><CardHeader><CardTitle>Funder actions</CardTitle></CardHeader><CardContent>{review && <><p>Deposits belong to the registered funder. Check the amount before signing the wallet transfer.</p><form className="inline-form" onSubmit={amountForm.handleSubmit(({ amountNear }) => action("Reserve deposit", "fund_settlement", { amountYocto: nearToYocto(amountNear) }))}><Controller name="amountNear" control={amountForm.control} render={({ field, fieldState }) => <Field data-invalid={fieldState.invalid}><FieldLabel htmlFor="fund-amount">Amount (testnet NEAR)</FieldLabel><Input {...field} id="fund-amount" inputMode="decimal" aria-invalid={fieldState.invalid} />{fieldState.invalid && <FieldError errors={[fieldState.error]} />}</Field>} /><Button type="submit" disabled={busy}>Deposit to reserve</Button></form></>}{BigInt(settlement.refundable_yocto) > 0n && <Button variant="outline" onClick={() => action("Refund", "withdraw_refundable")} disabled={busy}>Withdraw {yoctoToNear(settlement.refundable_yocto)} refundable NEAR</Button>}</CardContent></Card>}</div><aside className="guidance-panel"><ShieldAlert size={22} /><h2>What the contract protects</h2><ul><li>An owner must approve the exact current revision.</li><li>Funds stay in the reserve until payout calls succeed.</li><li>Failed transfers remain owed and can be retried.</li></ul><p>View the latest contract state after every wallet action.</p></aside></div></>}
  <ActionNotice notice={notice} /></div>;
}
