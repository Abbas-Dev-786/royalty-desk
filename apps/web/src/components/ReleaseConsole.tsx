"use client";

import { useEffect, useState } from "react";
import { JsonRpcProvider } from "near-api-js";
import { notifyWalletSession, walletConnector } from "./wallet-session";

type Result = { readonly message: string; readonly error?: boolean };
type TransactionRequest = { readonly networkId: string; readonly receiverId: string; readonly methodName: string; readonly args: Record<string, unknown>; readonly depositYocto: string };
type SettlementView = { readonly period: string; readonly revision: string; readonly agreement_version: string; readonly normalized_statement_hash: string; readonly gross_yocto: string; readonly deduction_evidence_hash: string; readonly allocation_preview_hash: string; readonly status: string; readonly entitlements: readonly { readonly owner_id: string; readonly amount_yocto: string; readonly status: string }[] };
type ChainReleaseView = { readonly administrator_id: string; readonly funder_id: string; readonly accepted_owner_ids: readonly string[]; readonly active_agreement_version: string | null; readonly agreements: readonly { readonly version: string; readonly approval_digest: string; readonly active: boolean; readonly superseded: boolean }[] };

const sampleCsv = "statement_id,line_id,period,recording_id,platform,row_type,amount,currency,deduction_code,evidence_ref\nstatement-demo,line-1,2026-01,recording-demo,synthetic,revenue,10,NEAR,,";
const sampleAgreement = JSON.stringify({ schemaVersion: "1", releaseId: "release-demo", recordingId: "recording-demo", effectivePeriod: "2026-01", participants: [{ ownerId: "alice.testnet", basisPoints: "6000" }, { ownerId: "bob.testnet", basisPoints: "2500" }, { ownerId: "carol.testnet", basisPoints: "1500" }], recoupment: null }, null, 2);

async function request(url: string, init: RequestInit = {}): Promise<Result> {
  const response = await fetch(url, init);
  const body = await response.json() as Record<string, unknown>;
  if (!response.ok) return { message: typeof body.error === "string" ? body.error : "Request was rejected.", error: true };
  if (body.transactionRequest && typeof body.transactionRequest === "object") {
    const transaction = body.transactionRequest as TransactionRequest;
    if (transaction.networkId !== "testnet" || !transaction.receiverId.endsWith(".testnet") || !/^\d+$/.test(transaction.depositYocto)) throw new Error("Invalid testnet transaction request");
    const wallet = await walletConnector().wallet();
    const sessionResponse = await fetch("/api/auth/me");
    const session = sessionResponse.ok ? await sessionResponse.json() as { accountId?: string } : null;
    const walletAccounts = await wallet.getAccounts({ network: "testnet" });
    if (!session?.accountId || !walletAccounts.some((account) => account.accountId === session.accountId)) throw new Error("Connected wallet does not match the owner session");
    const outcome = await wallet.signAndSendTransaction({
      signerId: session.accountId,
      receiverId: transaction.receiverId,
      network: "testnet",
      actions: [{ type: "FunctionCall", params: { methodName: transaction.methodName, args: transaction.args, gas: "100000000000000", deposit: transaction.depositYocto } }]
    });
    const failed = typeof outcome.status === "object" && outcome.status !== null && "Failure" in outcome.status;
    if (!failed && transaction.methodName === "freeze_agreement" && typeof body.version === "string" && typeof transaction.args.release_id === "string") {
      const confirmation = await request(`/api/releases/${encodeURIComponent(transaction.args.release_id)}/agreements/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: body.version }) });
      if (confirmation.error) return { message: `Wallet transaction ${outcome.transaction.hash} needs chain confirmation: ${confirmation.message}`, error: true };
    }
    return { message: JSON.stringify({ transactionHash: outcome.transaction.hash, status: failed ? "failed" : "submitted", request: body }, null, 2), error: failed };
  }
  return { message: JSON.stringify(body, null, 2) };
}

export function ReleaseConsole() {
  const [releaseId, setReleaseId] = useState("release-demo");
  const [funderId, setFunderId] = useState("funder.testnet");
  const [recordingId, setRecordingId] = useState("recording-demo");
  const [ownerIds, setOwnerIds] = useState("");
  const [agreement, setAgreement] = useState(sampleAgreement);
  const [statement, setStatement] = useState(sampleCsv);
  const [result, setResult] = useState<Result>({ message: "Connect a wallet, then choose an owner action." });
  const [busy, setBusy] = useState(false);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [agentMode, setAgentMode] = useState<"fixture" | "live">("fixture");
  const [agentId, setAgentId] = useState("");
  const [mandateCap, setMandateCap] = useState("10000000000000000000000000");
  const [agentPeriod, setAgentPeriod] = useState("2026-01");
  const [settlementDigest, setSettlementDigest] = useState("a".repeat(64));
  const [statementHash, setStatementHash] = useState("");
  const [statementRevision, setStatementRevision] = useState("1");
  const [agreementApprovalDigest, setAgreementApprovalDigest] = useState("");
  const [agreementVersion, setAgreementVersion] = useState("1");
  const [settlementGross, setSettlementGross] = useState("10000000000000000000000000");
  const [payoutOwnerId, setPayoutOwnerId] = useState("alice.testnet");

  async function run(action: () => Promise<Result>): Promise<void> {
    setBusy(true);
    try { setResult(await action()); } catch (error) { setResult({ message: error instanceof Error ? error.message : "Request failed.", error: true }); } finally { setBusy(false); }
  }

  async function refreshChainSettlement(): Promise<Result> {
    const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID;
    if (!contractId?.endsWith(".testnet")) throw new Error("Configure a deployed testnet contract ID");
    const provider = new JsonRpcProvider({ url: process.env.NEXT_PUBLIC_NEAR_RPC_URL ?? "https://test.rpc.fastnear.com" });
    const settlement = await provider.callFunction<SettlementView>({ contractId, method: "get_settlement", args: { release_id: releaseId, period: agentPeriod } });
    if (!settlement) throw new Error("Settlement is not present on-chain");
    const data = [settlement.period, settlement.revision, settlement.agreement_version, settlement.normalized_statement_hash, settlement.gross_yocto, settlement.deduction_evidence_hash, settlement.allocation_preview_hash].join("|");
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(data));
    const digest = [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    setSettlementDigest(digest);
    setSettlementGross(settlement.gross_yocto);
    return { message: JSON.stringify({ source: "NEAR testnet contract", digest, settlement }, null, 2) };
  }

  async function refreshChainRelease(): Promise<Result> {
    const contractId = process.env.NEXT_PUBLIC_CONTRACT_ID;
    if (!contractId?.endsWith(".testnet")) throw new Error("Configure a deployed testnet contract ID");
    const provider = new JsonRpcProvider({ url: process.env.NEXT_PUBLIC_NEAR_RPC_URL ?? "https://test.rpc.fastnear.com" });
    const release = await provider.callFunction<ChainReleaseView>({ contractId, method: "get_release", args: { release_id: releaseId } });
    if (!release) throw new Error("Release is not present on-chain");
    const proposal = [...release.agreements].reverse().find((entry) => !entry.superseded);
    if (proposal) { setAgreementVersion(proposal.version); setAgreementApprovalDigest(proposal.approval_digest); }
    setFunderId(release.funder_id);
    return { message: JSON.stringify({ source: "NEAR testnet contract", release }, null, 2) };
  }

  useEffect(() => {
    const refresh = () => { void fetch("/api/auth/me").then(async (response) => { if (response.ok) { const body = await response.json() as { accountId?: string }; setAccountId(body.accountId ?? null); } else setAccountId(null); }); };
    refresh();
    window.addEventListener("royaltydesk-session-changed", refresh);
    return () => window.removeEventListener("royaltydesk-session-changed", refresh);
  }, []);

  return (
    <section className="console" aria-labelledby="console-heading">
      <div className="console-heading"><div><p className="section-kicker">Owner workspace</p><h2 id="console-heading">Move one release from evidence to payment</h2></div><span className="network-chip">NEAR testnet · native NEAR</span></div>
      <div className="console-grid">
        <div className="control-panel">
          <label>Release identifier<input value={releaseId} onChange={(event) => setReleaseId(event.target.value)} /></label>
          <label>Registered funder<input value={funderId} onChange={(event) => setFunderId(event.target.value)} /></label>
          <label>Recording identifier<input value={recordingId} onChange={(event) => setRecordingId(event.target.value)} /></label>
          <label>Owner account IDs, comma separated<input value={ownerIds} onChange={(event) => setOwnerIds(event.target.value)} placeholder="owner-one.testnet,owner-two.testnet" /></label>
          <p>Enter 2–5 real owner accounts before creation. Include your connected account if you are also an owner; the administrator may be separate. The on-chain owner list cannot be changed later.</p>
          <button disabled={busy || !accountId} onClick={() => run(async () => { const submitted = await request("/api/releases", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ releaseId, recordingId, funderId, invitedOwnerIds: ownerIds.split(",").map((id) => id.trim()).filter(Boolean) }) }); if (submitted.error) return submitted; return request("/api/releases/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ releaseId }) }); })}>Create release on testnet</button>
          <button className="secondary" disabled={busy || !accountId} onClick={() => run(() => request("/api/releases/confirm", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ releaseId }) }))}>Confirm existing on-chain release</button>
          <button className="secondary" disabled={busy || !accountId} onClick={() => run(refreshChainRelease)}>Read release from contract</button>
          <button className="secondary" disabled={busy || !accountId} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/invitations`, { method: "PUT" }))}>Accept my owner invitation on testnet</button>
          <button className="secondary" disabled={busy || !accountId} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/invitations/confirm`, { method: "POST" }))}>Confirm my membership</button>
        </div>
        <div className="control-panel wide">
          <label>Agreement rules (exact JSON)<textarea value={agreement} onChange={(event) => setAgreement(event.target.value)} rows={10} /></label>
          <label>Agreement version<input value={agreementVersion} onChange={(event) => setAgreementVersion(event.target.value)} /></label>
          <button disabled={busy} onClick={() => run(async () => { const output = await request(`/api/releases/${encodeURIComponent(releaseId)}/agreements`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: agreementVersion, rules: JSON.parse(agreement) }) }); if (!output.error) { const parsed = JSON.parse(output.message) as { request?: { approvalDigest?: string }; approvalDigest?: string }; const digest = parsed.request?.approvalDigest ?? parsed.approvalDigest; if (digest) setAgreementApprovalDigest(digest); } return output; })}>Freeze agreement version</button>
          <button className="secondary" disabled={busy || !accountId} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/agreements/confirm`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: agreementVersion }) }))}>Confirm frozen version from contract</button>
          <label>Frozen agreement approval digest<input value={agreementApprovalDigest} onChange={(event) => setAgreementApprovalDigest(event.target.value)} /></label>
          <button className="secondary" disabled={busy || !accountId || !/^[a-f0-9]{64}$/.test(agreementApprovalDigest)} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/agreements/approve`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ version: agreementVersion, approvalDigest: agreementApprovalDigest }) }))}>Approve frozen agreement</button>
        </div>
        <div className="control-panel wide">
          <label>Private statement CSV<textarea value={statement} onChange={(event) => setStatement(event.target.value)} rows={5} /></label>
          <button disabled={busy} onClick={() => run(async () => { const output = await request(`/api/releases/${encodeURIComponent(releaseId)}/statements`, { method: "POST", headers: { "content-type": "text/csv" }, body: statement }); if (!output.error) { const imported = JSON.parse(output.message) as { normalizedHash?: string; revision?: string; grossYocto?: string }; if (imported.normalizedHash) setStatementHash(imported.normalizedHash); if (imported.revision) setStatementRevision(imported.revision); if (imported.grossYocto) setSettlementGross(imported.grossYocto); } return output; })}>Import private statement</button>
        </div>
        <div className="control-panel">
          <div className="panel-title"><span>Personal agent</span><span className="state-dot">{accountId ? "owner session" : "wallet required"}</span></div>
          <label>Settlement period<input value={agentPeriod} onChange={(event) => setAgentPeriod(event.target.value)} /></label>
          <label>Delegated agent account<input value={agentId} onChange={(event) => setAgentId(event.target.value)} /></label>
          <label>Maximum gross yoctoNEAR per settlement<input value={mandateCap} onChange={(event) => setMandateCap(event.target.value)} /></label>
          <button className="secondary" disabled={busy || !accountId || !agentId} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/mandates`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agentId, agreementVersion, actions: ["approve_settlement", "dispute_settlement"], maxGrossYocto: mandateCap, expiresAtNanoseconds: (BigInt(Date.now() + 24 * 60 * 60 * 1000) * 1_000_000n).toString() }) }))}>Set one-day mandate</button>
          <button className="secondary" disabled={busy || !accountId} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/mandates`, { method: "DELETE" }))}>Revoke my mandate</button>
          <label>Inference mode<select value={agentMode} onChange={(event) => setAgentMode(event.target.value === "live" ? "live" : "fixture")}><option value="fixture">Deterministic fixture</option><option value="live">NEAR AI Cloud</option></select></label>
          <button disabled={busy || !accountId} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/agents/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: agentMode, period: agentPeriod }) }))}>{agentMode === "live" ? "Ask NEAR AI agent" : "Run agent fixture"}</button>
          <p className="field-note">Recommendations remain awaiting human approval. Agent output cannot sign an agreement or redirect a payout.</p>
        </div>
        <div className="control-panel">
          <div className="panel-title"><span>Authority ledger</span><span className="state-dot">NEAR testnet</span></div>
          <p className="field-note">Every action carries a release, revision, digest, mandate epoch, and receipt state. A database projection never authorizes a contract call.</p>
          <button className="secondary" disabled={busy} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/statements?period=${encodeURIComponent(agentPeriod)}`))}>Refresh evidence state</button>
          <button className="secondary" disabled={busy} onClick={() => run(async () => { const response = await request("/api/auth/logout", { method: "POST" }); notifyWalletSession(); return response; })}>End owner session</button>
        </div>
        <div className="control-panel wide">
          <div className="panel-title"><span>Settlement review</span><span className="state-dot">reported · reserve · receipts stay separate</span></div>
          <div className="inline-fields"><label>Period<input value={agentPeriod} onChange={(event) => setAgentPeriod(event.target.value)} /></label><label>Gross yoctoNEAR<input value={settlementGross} onChange={(event) => setSettlementGross(event.target.value)} /></label></div>
          <label>Current settlement digest<input value={settlementDigest} onChange={(event) => setSettlementDigest(event.target.value)} maxLength={64} /></label>
          <label>Imported statement hash<input value={statementHash} onChange={(event) => setStatementHash(event.target.value)} maxLength={64} /></label>
          <div className="action-row">
            <button className="secondary" disabled={busy || !accountId} onClick={() => run(refreshChainSettlement)}>Read settlement from contract</button>
            <button disabled={busy || !accountId} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/settlements`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ period: agentPeriod }) }))}>Open validated statement</button>
            <button className="secondary" disabled={busy || !accountId} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/settlements`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ period: agentPeriod, operation: "revise" }) }))}>Revise from corrected statement</button>
            <button className="secondary" disabled={busy || !accountId} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/settlements/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "approve_settlement", period: agentPeriod, digest: settlementDigest }) }))}>Request owner approval</button>
            <button className="secondary" disabled={busy || !accountId} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/settlements/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "dispute_settlement", period: agentPeriod, reasonHash: settlementDigest }) }))}>Raise evidence hold</button>
            <button className="secondary" disabled={busy || !accountId} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/settlements/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "clear_dispute", period: agentPeriod }) }))}>Clear my hold</button>
            <button className="secondary" disabled={busy || !accountId} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/settlements/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "fund_settlement", period: agentPeriod, amountYocto: settlementGross }) }))}>Fund reserve</button>
            <button className="secondary" disabled={busy || !accountId} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/settlements/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "finalize_settlement", period: agentPeriod }) }))}>Finalize settlement</button>
            <label>Payout owner account<input value={payoutOwnerId} onChange={(event) => setPayoutOwnerId(event.target.value)} /></label>
            <button className="secondary" disabled={busy || !accountId || !payoutOwnerId} onClick={() => run(() => request(`/api/releases/${encodeURIComponent(releaseId)}/settlements/actions`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "execute_payout", period: agentPeriod, ownerId: payoutOwnerId }) }))}>Execute selected payout</button>
          </div>
        </div>
      </div>
      <pre className={result.error ? "result error" : "result"} aria-live="polite">{result.message}</pre>
    </section>
  );
}
