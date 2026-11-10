# Phase 08 — Integrated Participant Experience

Status: verified. Depends on: [Phase 04](PHASE_04_TRANSFERS.md) through [Phase 07](PHASE_07_AGENTS.md). Next: [Phase 09](PHASE_09_RELEASE.md).

## Outcome and source basis

An understandable, complete user journey connects real backend/contract behavior with agent decisions and evidence. Sources: [PRD sections 6–8](../../docs/PRD.md), [current scope example workflow](../../docs/CURRENT_SCOPE.md), [F-01–F-11](../../docs/FEATURES.md). This phase finishes and integrates the functional screens introduced earlier; it does not postpone all user interaction until the end.

## Tasks

### P08-01 — Complete navigation and role-aware screens

- Complete account, release workspace, agent settings, negotiation, agreement review, statement review, settlement, payouts and activity views.
- Show the currently authenticated owner and network; separate administrator, funder, participant and coordinator capabilities. Render disabled actions with specific missing conditions.
- Provide empty, loading, wallet-rejected, provider-unavailable, validation-failed and reconciliation-required states. Keep core tasks usable by keyboard and on narrow screens; errors remain associated with fields/actions.
- Acceptance: every P0 feature has a reachable real workflow; no button fakes success or changes authority only in frontend state.

### P08-02 — Make financial and authority state inspectable

- Show agreement version/digest, approval owner or agent, mandate epoch/expiry, settlement revision and each hold/clearance.
- Separate reported gross, reserve deposits, approved recoupment, participant entitlement, pending transfer, confirmed payout and refundable excess.
- Link the relevant transaction and final receipt outcomes on the correct network. Display freshness/reconciliation state; stale projection data must not look final.
- Show synthetic/testnet/live-model labels and concise action origins: human, agent or contract. Explain hosting trust without exposing implementation internals unnecessarily.
- Acceptance: a user can identify why payment is blocked and distinguish a submission from confirmed money movement.

### P08-03 — Execute the canonical three-party journey

- Use artist/producer/collaborator owners, separate agents and the 6000/2500/1500 agreement with 2 NEAR producer recoupment.
- Demonstrate negotiation, exact human approval, mandates, 10 NEAR synthetic statement with unsupported deduction, evidence-backed dispute, rejected finalization, corrected revision, explicit owner clearance and fresh approvals.
- Fund with actual sandbox NEAR, finalize 4.8/4.0/1.2 entitlements and complete transfers with receipts. Preserve account IDs and exact expected amounts in the scenario fixture.
- Replay import/finalization/payout requests and attempt revoked-agent approval. Show actual rejections instead of staged transcript messages.
- Acceptance: visible results match chain state, valid money conservation and the user's authorized action at every stage.

### P08-04 — Integrate interruption and multi-period cases

- Refresh/browser reconnect during approval and payouts; restart worker after submission; interrupt RPC reads; simulate explicit transfer failure and unknown callback outcome using the established sandbox harness.
- Run a second period after settlement completion, confirming exhausted recoupment and no duplicate period. Test amendment blocked during live settlement and fresh mandates after an accepted amendment.
- Verify cancellation/refund UI, held funds without unanimous cancellation and owner fallback when agent unavailable.
- Acceptance: each outcome has truthful state and an authorized next action; no automatic retry of unknown money movement.

### P08-05 — Eliminate cross-layer inconsistencies

- Compare contract values, domain preview, persisted projection and rendered amounts for the same revision.
- Review access to every private page/download/action, including direct URL/API entry and browser caches after account switch/logout.
- Remove dead placeholders and false integration badges. Conditional integrations remain absent or explicitly preview-only.
- Acceptance: no P0 requirement depends on a manually edited database, fake receipt or hidden developer action.

## Verification and artifacts

Run `npm run test:e2e`, `npm run test:recovery`, `npm run test:server`, `npm run check` and `npm run build`. Re-run contract suites only for relevant contract changes; the full suite runs in Phase 09.

Create browser scenarios under `tests/e2e` with separate owner sessions and a supported test-wallet adapter. Save sanitized screenshots/video for agreement, invalid claim, corrected approval, payout receipts and revoked authority. Attach underlying ledger/receipt artifacts so screenshots cannot stand in for chain evidence.

Targets include completed `apps/web` views, scenario fixtures, cross-layer tests and `plans/evidence/PHASE_08.md`.

## Exit and handoff

Every required screen works against real services and compiled sandbox contract; canonical and interruption scenarios pass; financial categories and labels are correct; private data remains isolated. The remaining Phase 09 work is reproducibility, full regression and the separately configured live testnet run, not finishing missing P0 flows.
