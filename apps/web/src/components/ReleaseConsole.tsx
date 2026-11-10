"use client";

import { useEffect, useState } from "react";

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
  const [accountId, setAccountId] = useState<string | null>(null);
  const [agentMode, setAgentMode] = useState<"fixture" | "live">("fixture");
  const [agentPeriod, setAgentPeriod] = useState("2026-01");
  const [settlementDigest, setSettlementDigest] = useState("a".repeat(64));
  const [settlementGross, setSettlementGross] = useState("10000000000000000000000000");

  async function run(action: () => Promise<Result>): Promise<void> {
    setBusy(true);
    try { setResult(await action()); } catch (error) { setResult({ message: error instanceof Error ? error.message : "Request failed.", error: true }); } finally { setBusy(false); }
  }

  useEffect(() => { void fetch("/api/auth/me").then(async (response) => { if (response.ok) { const body = await response.json() as { accountId?: string }; setAccountId(body.accountId ?? null); } }); }, []);

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
        <div className="control-panel">
          <div className="panel-title"><span>Personal agent</span><span className="state-dot">{accountId ? "owner session" : "wallet required"}</span></div>
          <label>Settlement period<input value={agentPeriod} onChange={(event) => setAgentPeriod(event.target.value)} /></label>
          <label>Inference mode<select value={agentMode} onChange={(event) => setAgentMode(event.target.value === "live" ? "live" : "fixture")}><option value="fixture">Deterministic fixture</option><option value="live">NEAR AI Cloud</option></select></label>
          <button disabled={busy || !accountId} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/agents/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: agentMode, period: agentPeriod }) }))}>{agentMode === "live" ? "Ask NEAR AI agent" : "Run agent fixture"}</button>
          <p className="field-note">Recommendations remain awaiting human approval. Agent output cannot sign an agreement or redirect a payout.</p>
        </div>
        <div className="control-panel">
          <div className="panel-title"><span>Authority ledger</span><span className="state-dot">NEAR testnet</span></div>
          <p className="field-note">Every action carries a release, revision, digest, mandate epoch, and receipt state. A database projection never authorizes a contract call.</p>
          <button className="secondary" disabled={busy} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/statements?period=${encodeURIComponent(agentPeriod)}`))}>Refresh evidence state</button>
          <button className="secondary" disabled={busy} onClick={() => run(() => request("/api/auth/logout", { method: "POST" }))}>End owner session</button>
        </div>
        <div className="control-panel wide">
          <div className="panel-title"><span>Settlement review</span><span className="state-dot">reported · reserve · receipts stay separate</span></div>
          <div className="inline-fields"><label>Period<input value={agentPeriod} onChange={(event) => setAgentPeriod(event.target.value)} /></label><label>Gross yoctoNEAR<input value={settlementGross} onChange={(event) => setSettlementGross(event.target.value)} /></label></div>
          <label>Current settlement digest<input value={settlementDigest} onChange={(event) => setSettlementDigest(event.target.value)} maxLength={64} /></label>
          <div className="action-row">
            <button disabled={busy || !accountId} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/settlements`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ commitment: { releaseId, period: agentPeriod, agreementVersion: "1", revision: "1", normalizedStatementHash: settlementDigest, grossYocto: settlementGross, deductionEvidenceHash: settlementDigest, allocationPreviewHash: settlementDigest }, participants: [{ ownerId: "alice.testnet", basisPoints: "6000" }, { ownerId: "bob.testnet", basisPoints: "4000" }], remainingRecoupmentYocto: "0", fundedYocto: "0", holds: [], approvals: [] }) }))}>Build deterministic preview</button>
            <button className="secondary" disabled={busy || !accountId} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/settlements/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "approve_settlement", period: agentPeriod, digest: settlementDigest }) }))}>Request owner approval</button>
            <button className="secondary" disabled={busy || !accountId} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/settlements/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "dispute_settlement", period: agentPeriod, reasonHash: settlementDigest }) }))}>Raise evidence hold</button>
          </div>
        </div>
      </div>
      <pre className={result.error ? "result error" : "result"} aria-live="polite">{result.message}</pre>
    </section>
  );
}
