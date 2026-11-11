# Phase 04 Evidence - Native Transfers

## Status

Phase 04 is verified for successful, replay, explicit failed-recipient, retry, payout, and refund Promise paths through the Docker-backed sandbox flow. Payouts and refunds persist attempt IDs, move value to `in_flight` before transfer creation, use immutable destinations, and reconcile through private callbacks.

## Implemented paths

- `contracts/royaltydesk/src/lib.rs`: immutable-entitlement payout, private payout callback, funder-only refund, and private refund callback.
- `packages/chain/src/royaltydesk.ts`: operation descriptors and receipt interpretation that keeps callback-incomplete operations in reconciliation state.
- `scripts/sandbox/scenario.mjs`: three owner payouts and the excess refund, asserting `Complete`, zero unpaid, and zero in-flight value.
- Zero-valued participant entitlements are retained and resolved without scheduling a zero-value transfer.

## Verification

| Check | Result |
| --- | --- |
| `npm run check` | pass |
| `npm run test:recovery` | pass - success, callback-pending, and failed-receipt interpretation |
| `npm run test:sandbox` | pass - payout and refund callbacks completed in real sandbox |
| `npm run test:fault-injection` | pass - separate fault-injection WASM preserved pending entitlement and blocked replay |
| `npm run test:contract` | not rerun in this agent environment; user rebuilt the updated WASM successfully |
| explicit recipient failure / callback interruption | pass - deleted-recipient retry and separate callback-panic WASM |

The separate `fault-injection` feature deliberately panics inside the private payout callback. The user run observed a `Paying` settlement, a `Pending` entitlement, non-zero `in_flight`, and replay protection. Implementation follows the NEAR [private callback](https://docs.near.org/smart-contracts/security/cross-contract-calls/callbacks#the-safe-pattern), [refund](https://docs.near.org/smart-contracts/security/cross-contract-calls/refunds#the-refund-pattern), and [sandbox testing](https://docs.near.org/smart-contracts/testing/integration-test) guidance.

## P04-04 follow-up — 2026-11-11

The chain package now interprets payout and refund outcomes from separate transaction, child transfer, callback, and contract-state evidence. Top-level success alone leaves a transfer operation in `reconciling`. The restricted signer persists signed identity before broadcast and retains its hash after an ambiguous response. The worker checks receipt outcomes against the immutable transfer recipient and reads settlement state before resolving a transfer operation. Zero-value entitlements are handled without requiring a child transfer.

Current local checks: `npm run check` passed; `npm run test:server` passed 21 tests; `npm run test:recovery` passed its receipt-state cases. A fresh `npm run build` and sandbox run were unavailable because the Docker daemon is not running. Earlier sandbox and fault-injection results above refer to the previous source state. Attempt identity is not independently encoded in the signed operation record, and refund attempt identity is not exposed by the contract view; these still require cross-layer verification before treating recovery as fully accepted. Process interruption testing remains Phase 05 work.
