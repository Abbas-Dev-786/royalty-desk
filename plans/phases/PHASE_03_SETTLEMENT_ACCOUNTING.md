# Phase 03 — Settlement State and Reserve Accounting

Status: verified. Rebuilt contract, funding, revision, cancellation, conservation, and finalization flow pass. Depends on: [Phase 02](PHASE_02_CONTRACT_AUTHORITY.md). Next: [Phase 04](PHASE_04_TRANSFERS.md).

## Outcome and source basis

Contract-enforced settlement review, holds, funding, deterministic finalization and refundable balances. Sources: [technical design sections 5–8](../../docs/TECHNICAL_DESIGN.md), [F-07, F-08](../../docs/FEATURES.md). This phase allocates obligations; actual transfers are implemented next.

## Tasks

### P03-01 — Implement permanent period identity and revisions

- Implement `open_settlement`/`revise_settlement` over `(release_id, period)` with monotonically increasing revision and exact commitment digest. Enforce active agreement/effective period, gross greater than zero and increasing finalized periods.
- Enforce one live settlement per release. Revisions retain deposits and disputes, clear all prior approvals and use the same permanent period identity.
- Treat cancelled periods as tombstones. A new filename, source statement ID, correction or cancelled record cannot create a second payable instance of the same period.
- Acceptance: invalid transitions and concurrent opens fail atomically; no revision silently moves principal or recoupment.

### P03-02 — Implement review, approval and dispute authority

- Implement owner/agent `approve_settlement`, `dispute_settlement` and owner-only `clear_dispute`. Actor identity comes from the contract caller and registered mapping.
- Store approval source, digest and mandate epoch. Owner approval supersedes their agent's approval. Validate agent scope and cap against gross.
- Each disputing owner's hold persists until that owner clears it for the current revision. Coordinator/admin cannot clear another participant's hold.
- Acceptance: stale revisions, wrong identity, coordinator substitution and unauthorized clearing are rejected; no timeout implies consent.

### P03-03 — Fund isolated reserves and allocate refunds

- Implement payable `fund_settlement` for the immutable registered funder, using attached amount only. Track per-period principal separately from operator gas/storage.
- Define accepted funding states: review/held only; reject funding after finalization/cancellation. Allow multiple deposits from the same funder with checked addition.
- Implement unanimous owner cancellation before finalization; votes refer to the current revision and are invalidated by revision changes. Move unallocated principal into that funder's refundable obligation without changing recoupment.
- Reserve excess deposits separately at finalization. Later withdrawal is Phase 04; do not mark a refund paid here.
- Acceptance: wrong funder, late deposit and arithmetic overflow fail without damaging existing obligations.

### P03-04 — Finalize with independent Rust arithmetic

- Implement permissionless `finalize_settlement` guarded by exact current approvals, no holds, valid current mandates, sufficient reserve, agreement match and release lock.
- Independently calculate recoupment and largest-remainder allocation in Rust using safe wide multiplication or decomposition. Compare against shared independently checked vectors, not supplied model amounts.
- Atomically consume the period, decrement remaining recoupment once, allocate immutable destinations/amounts and separate excess refundable funds. A second finalize has no financial effect and returns an explicit error.
- Validate canonical preview commitment against computed allocations where specified; do not accept a preview as authoritative arithmetic or claim that it authenticates private source data.
- Acceptance: ledger conservation holds before and after every transition; payout retries cannot call this allocation path again.

### P03-05 — Integrate amendments, locks and accounting views

- Wire Phase 02 amendment checks to actual consumed-recoupment and live-settlement state.
- Retain release lock through finalized/paying; Phase 04 completion releases it. Cancellation unlocks only after assigning refunds; outstanding refunds remain backed.
- Expose readiness reasons, per-period categories, consumed recoupment and immutable entitlements. Raw account balance is not the available royalty reserve.
- Acceptance: another period never consumes the same remaining recoupment concurrently; an amendment never rewrites finalized rights.

## Verification

Run `npm run test:contract` and `npm run test:sandbox`. Extend MONEY-01–06, SET-01–05, AGR-04 and MAND-03.

- Snapshot ledger before/after review, held, revision, cancellation and finalization. Assert `deposited = unallocated + refundable + unpaid + in_flight + successful_payouts + successful_refunds` throughout; transfer categories remain zero until Phase 04.
- Attempt finalization with missing approval, stale digest, hold, expired/revoked/replaced agent after approval, insufficient reserve, wrong agreement and already consumed period. Assert unchanged balances/recoupment.
- Cover 10 NEAR/2 NEAR recoupment vectors, dust/ties, overfunding, capped recoupment, near-bound amounts and cancellation without recoupment consumption.
- Cancel with partial votes, stale cancellation votes and repeated attempts; verify only unanimous current owners unlock refunds.
- Test sequence/property traces for revisions, revocations and funding, with deterministic seeds and explicit invariants.
- Exercise storage-pressure rejection after funds exist; earmarked principal must remain reserved.

## Evidence and exit

Targets: `contracts/royaltydesk/src/{settlements,accounting}`, ABI updates, contract/sandbox suites, `plans/evidence/PHASE_03.md`.

Evidence includes expected allocation vectors, full state-transition results, ledger snapshots and errors for every guard. Exit requires real sandbox funding/finalization and all invariant checks. Multi-period completion tests awaiting transfers are explicitly handed to Phase 04. No actual successful payout claim is valid yet.
