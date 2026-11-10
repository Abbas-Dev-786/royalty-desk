"use client";

import { useState } from "react";

type Result = { readonly message: string; readonly error?: boolean };

const sampleCsv = "statement_id,line_id,period,recording_id,platform,row_type,amount,currency,deduction_code,evidence_ref\nstatement-demo,line-1,2026-01,recording-demo,synthetic,revenue,10,NEAR,,";
const sampleAgreement = JSON.stringify({ schemaVersion: "1", releaseId: "release-demo", recordingId: "recording-demo", effectivePeriod: "2026-01", participants: [{ ownerId: "alice.testnet", basisPoints: "6000" }, { ownerId: "bob.testnet", basisPoints: "4000" }], recoupment: null }, null, 2);

async function request(url: string, init: RequestInit = {}): Promise<Result> {
  const response = await fetch(url, init);
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) return { message: typeof body.error === "string" ? body.error : "Request was rejected.", error: true };
  return { message: JSON.stringify(body, null, 2) };
}

export function ReleaseConsole() {
  const [releaseId, setReleaseId] = useState("release-demo");
  const [funderId, setFunderId] = useState("funder.testnet");
  const [inviteId, setInviteId] = useState("collaborator.testnet");
  const [agreement, setAgreement] = useState(sampleAgreement);
  const [statement, setStatement] = useState(sampleCsv);
  const [result, setResult] = useState<Result>({ message: "Connect a wallet, then choose an owner action." });
  const [busy, setBusy] = useState(false);

  async function run(action: () => Promise<Result>): Promise<void> {
    setBusy(true);
    try { setResult(await action()); } catch (error) { setResult({ message: error instanceof Error ? error.message : "Request failed.", error: true }); } finally { setBusy(false); }
  }

  return (
    <section className="console" aria-labelledby="console-heading">
      <div className="console-heading"><div><p className="section-kicker">Owner workspace</p><h2 id="console-heading">Move one release from evidence to payment</h2></div><span className="network-chip">NEAR testnet · native NEAR</span></div>
      <div className="console-grid">
        <div className="control-panel">
          <label>Release identifier<input value={releaseId} onChange={(event) => setReleaseId(event.target.value)} /></label>
          <label>Registered funder<input value={funderId} onChange={(event) => setFunderId(event.target.value)} /></label>
          <button disabled={busy} onClick={() => run(() => request("/api/releases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ releaseId, funderId }) }))}>Create release record</button>
          <label>Invite an owner<input value={inviteId} onChange={(event) => setInviteId(event.target.value)} /></label>
          <button className="secondary" disabled={busy} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/invitations`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ accountId: inviteId, role: "owner" }) }))}>Invite collaborator</button>
        </div>
        <div className="control-panel wide">
          <label>Agreement rules (exact JSON)<textarea value={agreement} onChange={(event) => setAgreement(event.target.value)} rows={10} /></label>
          <button disabled={busy} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/agreements`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: "1", rules: JSON.parse(agreement) }) }))}>Freeze agreement version</button>
        </div>
        <div className="control-panel wide">
          <label>Private statement CSV<textarea value={statement} onChange={(event) => setStatement(event.target.value)} rows={5} /></label>
          <button disabled={busy} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/statements`, { method: "POST", headers: { "content-type": "text/csv" }, body: statement }))}>Import private statement</button>
        </div>
      </div>
      <pre className={result.error ? "result error" : "result"} aria-live="polite">{result.message}</pre>
    </section>
  );
}
