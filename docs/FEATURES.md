# RoyaltyDesk — Feature Catalogue

Status: planned v0.1. No feature is implemented yet. Date: 2026-11-07.

P0 = required current scope. P1 = conditional enhancement. Future capabilities are listed separately in [FUTURE_SCOPE](FUTURE_SCOPE.md). Delivery boundary: [CURRENT_SCOPE](CURRENT_SCOPE.md).

## Feature index

| ID | Feature | Priority | Dependencies |
| --- | --- | --- | --- |
| F-01 | Participant identity and release membership | P0 | Compatible wallet authentication |
| F-02 | Personal agents and private preferences | P0 | F-01, NEAR AI availability |
| F-03 | Structured agent negotiation | P0 | F-02 |
| F-04 | Versioned agreement and participant approval | P0 | F-01, F-03 |
| F-05 | On-chain agent mandates and revocation | P0 | F-01, F-04 |
| F-06 | Statement ingestion and evidence validation | P0 | F-01, F-04 |
| F-07 | Settlement review, disputes, and revisions | P0 | F-02, F-04, F-05, F-06 |
| F-08 | Funded reserve and deterministic entitlements | P0 | F-04, F-07 |
| F-09 | Payout execution and recovery | P0 | F-08 |
| F-10 | Activity, receipts, privacy and operational visibility | P0 | All core workflows |
| F-11 | Reproducible demo and verification fixtures | P0 | F-01 through F-10 |
| F-12 | One supported Intents payout | P1 | Validated route security and authorization |
| F-13 | Verified confidential-inference evidence | P1 | F-02 and supported verification path |
| F-14 | Spotify catalogue metadata | P1 | App credentials and allowed API access |

## F-01 — Participant identity and membership

Users connect their own testnet wallets, prove account control, and create app profiles. A release includes an administrator and explicitly accepted collaborators. Invitations alone confer no approval rights. Membership changes after agreement freezing require a new proposal and approvals.

Acceptance:

- Three distinct account identities can independently sign in and join one release.
- Server verifies a short-lived, single-use, domain/network-bound wallet challenge; a submitted account name is not authentication.
- A user outside the release cannot read private release documents or act as a member.
- The owner remains in control of their wallet. App registration does not silently create a mainnet payout wallet.

## F-02 — Personal agents

Each participant has a profile, private preferences, separate tool context, and a distinct delegated identity for on-chain actions. The coordinator has its own role. NEAR AI Cloud handles actual model inference; orchestrator and policy checks execute outside the model.

Acceptance:

- An agent receives its owner's private preferences and the release's shared evidence only.
- Another participant cannot retrieve private preferences via UI, API, export, or agent tool.
- All model outputs are parsed into validated structured actions; arbitrary text cannot invoke transfers.
- Model timeout, malformed output, or exhausted budget creates an explicit paused/needs-review outcome.
- Logs record model identifier, call status, cost/usage when available, and concise rationale; no secret keys or hidden reasoning.

## F-03 — Negotiation

Agents submit offers/counteroffers over shares and the supported recoupment term. Each offer names the proposal it revises. UI shows a factual transcript, current terms, and differences. Maximum three rounds per session by default; participants can start a fresh session deliberately.

Acceptance:

- At least one real model-generated proposal or evidence-backed objection is demonstrated.
- Invalid shares, nonexistent participants, or unsupported expense terms cannot become an approval-ready agreement.
- Negotiation does not modify the active contract agreement.
- Failure to reach consensus produces unresolved terms; humans can edit a proposal rather than invent agent agreement.

## F-04 — Agreement review and approval

Generate a downloadable Markdown agreement and canonical structured rules. Display participants, basis-point shares, recoupment cap/beneficiary, effective period, version, and document commitment. Freeze proposals before owner approvals.

Acceptance:

- Every listed participant approves the identical version and digest through an owner-wallet action.
- Agent identities cannot approve initial terms or amendments.
- Changing any frozen content creates a new proposal; previous approvals do not carry forward.
- Activation is impossible unless shares total 10,000 and all required approvals exist.
- An amendment cannot silently alter already finalized entitlements or bind old mandates to new terms.

## F-05 — Agent mandates

Owner delegates a release-specific and agreement-specific mandate to an agent account: method set, expiry, maximum gross settlement amount, and current epoch. Owner can revoke or replace it.

Acceptance:

- A wrong owner, release, agreement version, agent identity, method, or expired mandate is rejected on-chain.
- Revoking/replacing a mandate increments the epoch and invalidates its outstanding settlement approvals.
- Owner approval remains possible when an agent is unavailable.
- Agent method access never permits modifying participant destinations or signing agreement amendments.
- Revocation does not claim to reverse already-finalized entitlements or completed transfers.

## F-06 — Statement import

Support one strict CSV schema, maximum 100 rows, one recording and period, and NEAR-denominated decimal amounts for the testnet fixture. Retain original file and normalized rows, with labeled source provenance.

Acceptance:

- Reject invalid decimals, negative amounts, unsupported currencies, inconsistent periods, missing identifiers, and duplicated line IDs within an import.
- Reimporting identical or reformatted data into the same release-period cannot create another payable period.
- Report duplicates, unknown tracks, and total mismatches with row-level reasons.
- Detect unsupported deduction claims before approval; agents can cite them but cannot bypass deterministic validation.
- Source data is labeled synthetic, user-uploaded, or verified by a named integration. A hash is never called source verification.

## F-07 — Settlement review and disputes

Create one versioned settlement per release-period. All parties review its shared evidence and calculated outcome. Owner or authorized agent can approve its exact digest. Any participant can hold it by raising a dispute.

Acceptance:

- A settlement with a dispute, missing approval, invalid computation, or stale mandate cannot finalize.
- Every revision invalidates prior approvals.
- A revision cannot erase disputes; each disputing participant's owner explicitly clears their hold after reviewing the correction.
- The coordinator cannot approve for a participant or clear their hold.
- Whole settlement remains held in MVP; no automatic arbitrator or partial release.

## F-08 — Funding and entitlements

The funding party deposits native NEAR into a specific release-period reserve. Contract computes approved recoupment and share allocation with integer math. Finalization creates immutable entitlements and consumes the period exactly once.

Acceptance:

- Reject insufficient funding and duplicate finalization.
- Contract recomputes allocation rather than accepting model-supplied payout totals.
- Recoupment remaining is updated exactly once at finalization and never again on payout retry.
- Entitlements sum to the exact finalized amount under a documented rounding rule.
- Excess funds remain separately refundable to the funder; contract gas/storage funds are not royalty principal.
- Imported but unfunded earnings cannot be paid.

## F-09 — Payout execution

Anyone may trigger transfer of an already-finalized entitlement to its immutable owner-account destination. The personal agent can do this for its owner without changing the amount or recipient. Withdrawal state is tracked independently per entitlement.

Acceptance:

- State changes to pending before an asynchronous transfer is scheduled.
- A pending or paid entitlement cannot be sent again.
- Only a private callback for the matching attempt can confirm payment or restore retry eligibility after explicit failure.
- Unknown callback/transaction state is reconciled; a timer alone cannot authorize another transfer.
- A failed participant payout does not reverse other confirmed payouts or recoupment accounting.
- Receipt links identify the final transfer outcome, not merely the initial transaction submission.

## F-10 — Evidence and operational UI

Expose source references, approved versions, authority, amounts, funding, disputes, and payment outcomes. Explain errors in terms of missing conditions and next authorized actions.

Acceptance:

- UI distinguishes statement totals, contract-held funds, entitlements, pending transfers, and confirmed payments.
- Pending requests survive browser refresh and worker restart through persisted job identifiers and chain reconciliation.
- Show activity as concise action summaries, with model versus human versus contract origin.
- Network/fixture badges are visible on demo financial views.
- Public chain events contain no private agreement documents, preference text, or uploaded CSV contents.

## F-11 — Demo and verification

Provide a happy-path fixture and cases for invalid deductions, duplicate rows, expired mandate, revoked mandate, stale revision approval, insufficient funds, invalid caller, replayed payout, and failed transfer.

Acceptance:

- Automated deterministic checks run without paid inference.
- At least one separately recorded end-to-end run uses NEAR AI Cloud and actual testnet funds.
- Fresh setup follows documented prerequisites, configuration, fixture load, and visible expected results.
- README lists remaining trust assumptions and unimplemented features.

## F-12 — Intents payout, conditional

Route one supported mainnet payout using recipient-authorized terms, an authenticated quote, bounded input, fixed destination, and explicit refund handling. This requires separate contract/adapter review and cannot be enabled simply by substituting a deposit address for a user's address.

Acceptance: source funds are genuine mainnet funds; entitlement-to-quote binding is enforced; route is supported; destination settlement and refund states are tracked; unknown state never re-pays; transaction receipts prove execution. If only a dry quote exists, label it quote preview.

## F-13 — Inference verification, conditional

Check available gateway attestation and response signatures using the documented supported path. Persist only the required non-sensitive verification evidence.

Acceptance: verified badge appears only when required checks pass; missing evidence is unverified; a valid attestation is never described as proof of correct financial analysis.

## F-14 — Spotify metadata, conditional

Retrieve permitted recording metadata for a supplied link/ID. Manual identity entry remains available.

Acceptance: retain source provenance; never label catalogue metadata an earnings report; never infer royalties by multiplying streams by an invented rate; errors leave the core upload workflow usable.
