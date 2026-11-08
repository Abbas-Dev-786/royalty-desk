# Phase 02 Evidence - Contract Authority

## Status

Phase 02 is verified through the rebuilt contract and Docker-backed sandbox flow. The contract provides bounded releases, membership acceptance, canonical agreement commitments, superseded-proposal protection, unanimous activation, scoped mandates, epoch revocation, and typed chain bindings.

## Implemented paths

- `contracts/royaltydesk/src/models.rs`: release, agreement, mandate, settlement, and entitlement state.
- `contracts/royaltydesk/src/lib.rs`: caller checks, release lifecycle, agreement approval, mandate lifecycle, and public views.
- `contracts/royaltydesk/src/accounting.rs`: independent deterministic allocation helper.
- `packages/chain/src/royaltydesk.ts`: typed contract client and operation/receipt descriptors.

## Verification

| Check | Result |
| --- | --- |
| `npm run check` | pass |
| `npm run test:domain` | pass - 32 tests |
| `npm run test:sandbox` | pass - real Docker sandbox authority flow |
| `npm run test:contract` | not rerun in this agent environment; user rebuilt the updated WASM successfully |

The user-recorded sandbox run passed three-owner membership, unanimous agreement approval, scoped agent approval, and prior access-key restrictions. Exhaustive malformed-input and revocation matrix coverage remains follow-up work.
