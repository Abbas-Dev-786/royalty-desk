# Phase 03 Evidence - Settlement Accounting

## Status

Phase 03 is verified through the rebuilt contract and Docker-backed sandbox flow. The contract tracks permanent `(release, period)` identities, bounded revisions, approvals, disputes, isolated funding, cancellation refunds, recoupment consumption, and exact entitlement allocation.

## Implemented paths

- `contracts/royaltydesk/src/lib.rs`: settlement open/revise, approval/dispute/clear, funding, cancellation, finalization, and accounting views.
- `contracts/royaltydesk/src/accounting.rs`: checked quotient/remainder allocation with deterministic lexicographic dust handling and recoupment consolidation.
- Public amount/version inputs and settlement views use NEAR `U128`/`U64` string wrappers.
- `scripts/sandbox/scenario.mjs`: real sandbox funding, finalization, payouts, refund, and conservation assertions.

## Verification

| Check | Result |
| --- | --- |
| `npm run check` | pass |
| `npm run test:domain` | pass - 32 tests |
| `npm run test:sandbox` | pass - real funding and deterministic finalization |
| `npm run test:contract` | not rerun in this agent environment; user rebuilt the updated WASM successfully |

The scenario used a two-NEAR fund, one-NEAR gross, one-NEAR excess refund, three owners, and one recoupment beneficiary. Property traces and the full dispute/revision rejection matrix remain additional coverage.
