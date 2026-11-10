// Contract regression checks against a disposable sandbox.
import { readFile, writeFile, unlink, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runSandboxCommand, startSandbox, stopSandbox } from "./sandbox/process.mjs";

const scenarioPath = resolve("scripts/sandbox/audit-scenario.generated.mjs");
let source = (await readFile("scripts/sandbox/scenario.mjs", "utf8")).replace(/\r\n/g, "\n");
source = source.replace('  await call(ownerTwo, "clear_dispute", { release_id: releaseId, period: revisedPeriod }, contractId);', '  // Audit: preserve the dispute across correction, as required by the product.');
source = source.replace('  assert.equal(String(revisedSettlement.revision), "2");', `
  assert.equal(String(revisedSettlement.revision), "2");
  const clearAfterCorrection = await call(ownerTwo, "clear_dispute", { release_id: releaseId, period: revisedPeriod }, contractId);

  console.log("REGRESSION PASSED: original disputing owner clears the preserved hold after revision");
  await call(ownerTwo, "dispute_settlement", { release_id: releaseId, period: revisedPeriod, reason_hash: "workaround-reraise" }, contractId);
  await call(ownerTwo, "clear_dispute", { release_id: releaseId, period: revisedPeriod }, contractId);
`);
source = source.replace('  return {\n    rpc: RPC_URL,', `
  await call(owner, "freeze_agreement", { release_id: releaseId, input: agreementInput }, contractId);
  const amendedRelease = await provider.callFunction({ contractId, method: "get_release", args: { release_id: releaseId } });
  const amendment = amendedRelease.agreements.at(-1);
  assert.equal(amendment.recoupment.cap_yocto, "1000000000000000000");
  assert.equal(amendment.recoupment.consumed_yocto, "1000000000000000000");
  for (const participant of [owner, ownerTwo, ownerThree]) await call(participant, "approve_agreement", { release_id: releaseId, version: amendment.version, approval_digest: amendment.approval_digest }, contractId);
  const rejectedPeriod = await rejectedCall(owner, "open_settlement", { release_id: releaseId, input: { period: "2025-01", agreement_version: amendment.version, normalized_statement_hash: "audit", gross_yocto: "1000000000000000000", deduction_evidence_hash: "audit", allocation_preview_hash: "audit" } }, contractId);
  assertIncludes(rejectedPeriod, "ERR_PERIOD_ORDER");
  const auditPeriod = "2026-07";
  await call(owner, "open_settlement", { release_id: releaseId, input: { period: auditPeriod, agreement_version: amendment.version, normalized_statement_hash: "audit", gross_yocto: "1000000000000000000", deduction_evidence_hash: "audit", allocation_preview_hash: "audit" } }, contractId);
  console.log("REGRESSION PASSED: period preceding effective/finalized period rejected");
  const auditSettlement = await provider.callFunction({ contractId, method: "get_settlement", args: { release_id: releaseId, period: auditPeriod } });
  for (const participant of [owner, ownerTwo, ownerThree]) await call(participant, "approve_settlement", { release_id: releaseId, period: auditPeriod, digest: settlementDigestFor(auditSettlement) }, contractId);
  await call(funder, "fund_settlement", { release_id: releaseId, period: auditPeriod }, contractId, 1000000000000000000n);
  await call(owner, "finalize_settlement", { release_id: releaseId, period: auditPeriod }, contractId);
  const auditFinal = await provider.callFunction({ contractId, method: "get_settlement", args: { release_id: releaseId, period: auditPeriod } });
  assert.equal(auditFinal.entitlements.find((entry) => entry.owner_id === ownerId).amount_yocto, "500000000000000000");
  console.log("REGRESSION PASSED: unchanged amendment preserves exhausted advance (beneficiary gets 50%)");
  return {
    rpc: RPC_URL,`);
await writeFile(scenarioPath, source);
const home = await mkdtemp(join(tmpdir(), "royaltydesk-audit-"));
let sandbox;
try {
  await runSandboxCommand(home, "init");
  sandbox = await startSandbox(home);
  const { runScenario } = await import("./sandbox/audit-scenario.generated.mjs");
  await runScenario({ home, wasmPath: resolve("contracts/royaltydesk/target/near/royaltydesk_contract.wasm") });
} finally {
  stopSandbox(sandbox);
  await unlink(scenarioPath);
  const resolvedHome = resolve(home);
  if (!resolvedHome.startsWith(resolve(tmpdir()) + "\\") && !resolvedHome.startsWith(resolve(tmpdir()) + "/")) throw new Error("Unexpected audit temporary path");
  await rm(resolvedHome, { recursive: true, force: true });
}
