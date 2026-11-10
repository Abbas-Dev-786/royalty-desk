# Phase 08 Evidence - Integrated Participant Experience

## Status

Implemented and locally verified for the authenticated application journey and browser-accessible state boundaries. The screens expose wallet state, release administration, private evidence import, agreement freezing, agent mode, settlement preview, approval/dispute requests, and operation/authentication feedback.

## Implemented paths

- `apps/web/src/components/ReleaseConsole.tsx`: responsive owner workspace with explicit fixture/live labels, role-sensitive disabled actions, settlement categories, and human-approval handoff.
- `apps/web/src/app/api/releases/[releaseId]/agents/run`: server-derived agent context proxy to the durable worker API.
- `apps/web/src/app/api/chain/operations`: operation identity and receipt/reconciliation status surface.
- `scripts/test-e2e.mjs`: isolated Next development server smoke journey covering home rendering, challenge creation, and unauthorized mutation/agent rejection; the Windows process-tree cleanup removes generated e2e artifacts after the run.
- `contracts/royaltydesk/src/lib.rs`: bounded mandate metadata is available to the application state inspector.

## Verification

| Check | Result |
| --- | --- |
| `npm run test:e2e` | pass - home, auth challenge, unauthorized release mutation, and unauthorized agent request |
| `npm run test:domain` | pass - 32 tests |
| `npm run test:server` | pass - 14 tests |
| `npm run test:agents` | pass |
| `npm run test:recovery` | pass |
| `npm run test:sandbox` | pass - compiled contract journey and receipt/retry invariants |
| `npm run test:fault-injection` | pass - callback interruption and replay safety |
| `npm run check` | pass |
| web/worker/package build | pass |
| Docker contract build | pass |

The browser never treats a database projection as a receipt. Wallet transaction requests remain explicit, contract state remains authoritative, unknown transfers remain reconciliation-required, and private evidence routes enforce server-side membership.
