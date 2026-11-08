# Phase 06 — Agreement, Statement and Settlement Workflows

Status: not started. Depends on: [Phase 03](PHASE_03_SETTLEMENT_ACCOUNTING.md) and [Phase 05](PHASE_05_APPLICATION_FOUNDATION.md). Next: [Phase 07](PHASE_07_AGENTS.md).

## Outcome and source basis

Participants can complete the administration workflow through authenticated APIs and functional screens before model automation is attached. Sources: [PRD journeys A–E](../../docs/PRD.md), [technical design sections 4–7, 10](../../docs/TECHNICAL_DESIGN.md), [F-01, F-04, F-06, F-07, F-08](../../docs/FEATURES.md).

Manual proposal editing is a supported product path and lets the workflow be verified independently of model availability. It does not satisfy the later live-agent acceptance criterion.

## Tasks

### P06-01 — Release membership and transaction requests

- Implement create/invite/accept workflows using confirmed contract membership and authenticated profiles. Add minimal account/workspace screens.
- Return typed wallet transaction requests for owner actions; display network, contract, action and expected effect. Match returned outcomes to the requested identity and refresh from chain.
- Preserve in-progress operations across refresh. Reject unsupported networks and stale terms before requesting a signature.
- Acceptance: three distinct owners can join; unaccepted invitations cannot approve, sign on another owner's behalf or read private release material.

### P06-02 — Render and freeze exact agreement versions

- Build the deterministic Markdown agreement renderer and download route. Include roles, shares, recoupment cap/beneficiary, effective period and template version alongside structured rules.
- Hash exact rendered bytes, freeze the proposal, and display the same bytes/rules/digest to every owner. Record wallet approval receipts and activate UI state only from confirmed chain state.
- Amendments show a change summary and require a new frozen version plus fresh approvals. Existing entitlements remain immutable; mandates must be renewed for new versions.
- Acceptance: a document edit after freezing cannot retain its old hash; an agent-generated draft has no approval authority.

### P06-03 — Import private statements and retain provenance

- Implement authenticated administrator upload with streaming/file-size limits, supported parser, private storage and row-level errors.
- Store original and normalized hashes, source label and evidence references. Scope referenced private documents to the release; reject inaccessible or arbitrary external evidence URLs as execution instructions.
- Use release-period idempotency under DB constraints and contract identity. A semantically identical reimport returns the existing import/revision; a meaningful correction creates an explicit new revision.
- Keep structurally valid unsupported deduction claims visible for review. Deterministic policy blocks approval and can create a hold workflow; it must not silently remove a claim or pretend the chain authenticated the CSV.
- Acceptance: CSV-01–05 and duplicate concurrent import cases pass; unsupported currencies never become implicit conversions.

### P06-04 — Assemble settlement commitments and review actions

- Build preview from the confirmed agreement, current recoupment and normalized evidence using domain functions. Persist commitment/version and prepare open/revise transactions.
- Display invalid claim reasons and row/evidence IDs. Permit owner/authorized agent dispute; request disputing owners' explicit clearance after correction.
- Revision invalidates all approvals and retains holds. Check current digest immediately before any approval request; never copy an old signature to a new proposal.
- Acceptance: a corrected revision cannot finalize until every hold is cleared and every current approval exists.

### P06-05 — Connect funding, cancellation and readiness

- Show reported gross, funded reserve, approved recoupment, expected entitlements and excess separately. Build deposits only for the registered funder.
- Derive finalize readiness from chain conditions; a helpful frontend check never replaces the contract check. Provide clear blocked reasons with next authorized actions.
- Implement unanimous current-revision cancellation and funder refund availability. Explain the permanent period tombstone before requesting cancellation signatures.
- Acceptance: unfunded revenue cannot appear spendable; stale database readiness cannot force finalization; excess remains funder-owned.

## Verification

Run `npm run test:domain`, `npm run test:server`, targeted `npm run test:e2e`, and applicable `npm run test:sandbox` cases.

Cover owner wallet refusal, wrong account/network, direct API access, changed document bytes, old agreement approval, duplicate imports, unsupported claim, corrected revision, held finalization attempt, owner-only clearance, underfunding, overfunding and cancellation votes. Assert no unauthorized state change as well as visible error text.

Use a supported local test wallet for automated browser runs and clearly label it. Real selected-wallet compatibility comes from Phase 00 and the final live journey; browser mocks cannot claim real wallet consent.

## Evidence and exit

Targets: release/agreement/statement/settlement route groups, corresponding feature services/screens, private agreement renderer, test fixtures, `plans/evidence/PHASE_06.md`.

Retain sanitized canonical agreement, import error report, correction revision history, wallet/chain operation references and ledger/readiness snapshots. Exit requires a functional owner-driven workflow with the same validation the agents will use. Screens may be visually simple, but they must be real and accessible enough to verify behavior.
