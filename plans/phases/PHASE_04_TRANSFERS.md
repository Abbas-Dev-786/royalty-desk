# Phase 04 — Native Transfers and Safe Reconciliation

Status: verified. Production and fault-injection WASM payout, failure/retry, refund, replay, recovery, and callback-liveness checks pass. Depends on: [Phase 03](PHASE_03_SETTLEMENT_ACCOUNTING.md). Next: [Phase 05](PHASE_05_APPLICATION_FOUNDATION.md).

## Outcome and source basis

Finalized entitlements and refunds become real native transfers with idempotent callbacks and conservative handling of uncertainty. Sources: [technical design sections 7–9](../../docs/TECHNICAL_DESIGN.md), [F-09, F-10](../../docs/FEATURES.md), and the master NEAR SDK source references.

## Tasks

### P04-01 — Implement entitlement execution

- Add permissionless `execute_payout` for immutable finalized owner destinations. A caller supplies entitlement identity, never a replacement recipient or arbitrary amount.
- Persist `PENDING(attempt_id)` and move ledger value from unpaid to in-flight before creating the transfer Promise. Allocate measured callback gas.
- Treat a zero entitlement as resolved without scheduling a zero-value transfer. Reject pending/paid triggers; never recompute shares or recoupment.
- Acceptance: concurrent triggers produce at most one scheduled transfer per available entitlement attempt.

### P04-02 — Implement private result callbacks

- Implement private `on_payout_complete` using actual Promise results, matching period/owner/attempt and current state.
- Successful transfer moves in-flight to successful payout; explicit failure restores the same unpaid entitlement. Duplicate/stale callbacks are harmless or rejected without altering another attempt.
- Complete the settlement and release lock only when all participant entitlements are resolved. Other failed recipients remain independent obligations.
- Acceptance: spoofed callers, stale attempt IDs and wrong result cardinality cannot alter ledger categories.

### P04-03 — Implement refunds with equivalent safety

- Add `withdraw_refundable` restricted to the registered funder and immutable funder destination. Track distinct refund attempts and prevent concurrent withdrawals of the same obligation.
- Use a private matching callback and the same success/failure/unknown semantics as payouts. Refunds may coexist with later periods, but retain separate reserve backing.
- Acceptance: cancelling or excess funding cannot withdraw another participant's entitlement or a different period's funds.

### P04-04 — Implement transaction and receipt interpretation

- In `packages/chain`, define operation identities, signed-transaction identity, broadcast status and final receipt interpretation. Persistable descriptors exclude secrets.
- Distinguish application submission, transaction inclusion, child transfer receipt and callback completion. Never mark paid from a transaction hash or top-level success alone.
- Define recovery for failure between signing, durable intent write, broadcast and response persistence. Save signed identity before broadcast; when outcome is unknown, query that identity and on-chain attempt state before any new action. Exact rebroadcast, if supported, uses the same signed bytes rather than a new financial operation.
- If a transfer succeeded but callback failed, keep contract entitlement pending. Surface reconciliation required; no timer/admin mark-failed method may restore it.
- Acceptance: recovery cannot create a second entitlement or a new transfer while a previous attempt remains unresolved.

### P04-05 — Exercise real asynchronous failure paths

- Use compiled WASM in sandbox for successful native transfer, explicit failure and callbacks. For an explicit failure, a sandbox-owned recipient account can be deleted after entitlement creation; retain its fixed entitlement and demonstrate failed transfer. Recreate the same sandbox-owned account only for controlled retry verification.
- Simulate callback interruption with a clearly separate fault-injection test build or sandbox harness; never add a production admin override. Record its WASM hash separately from release WASM.
- Complete two periods sequentially and prove recoupment is consumed only once. Test refunds still pending while unrelated new obligations remain fully backed.
- Acceptance: at most one successful transfer for an entitlement despite concurrency/retry; one recipient's failure does not undo another's confirmed payment.

## Verification

Run `npm run test:contract`, `npm run test:sandbox` and the implemented chain-level cases in `npm run test:recovery`. Full process restart coverage follows in Phase 05.

Required cases: PAY-01–06; pending/paid replay; mismatched callback; explicit payout and refund failure followed by safe retry; success-with-missing-callback remains pending; zero entitlement; insufficient storage/gas headroom; two-period recoupment; refund/principal conservation. Assert receipt outcomes and ledger state, not just final wallet balances, which may also reflect gas.

## Evidence and exit

Targets: `contracts/royaltydesk/src/{payouts,refunds}`, `packages/chain/src/{transactions,receipts}`, sandbox fault harness, `plans/evidence/PHASE_04.md`.

Record transaction/receipt graph IDs, immutable recipients, attempt IDs, before/after ledgers, explicit failure evidence and the pending unknown case. Exit requires genuine sandbox Promise behavior. Mocked callback tests supplement but cannot replace it. Unknown-state liveness remains a documented limitation; preserving funds safely is the expected behavior, not an excuse to label payment complete.
