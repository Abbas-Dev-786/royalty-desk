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
