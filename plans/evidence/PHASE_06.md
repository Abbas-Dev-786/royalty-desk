# Phase 06 Evidence - Agreement, Statement and Settlement Workflows

## Status

Implemented and locally verified for the authenticated administration path. The browser exposes release, invitation, agreement-freeze, and private statement actions; APIs enforce membership and preserve exact commitments, revisions, holds, and readiness data.

## Implemented paths

- `apps/web/src/app/api/releases`: authenticated release creation and invitation/acceptance flow.
- `apps/web/src/app/api/releases/[releaseId]/invitations/confirm`: local membership is promoted only after a NEAR `get_release` view confirms the owner account is accepted on-chain.
- `apps/web/src/app/api/releases/[releaseId]/agreements`: deterministic Markdown rendering, exact UTF-8 document bytes, structured-rules hash, document hash, and approval digest persistence.
- `apps/web/src/app/api/releases/[releaseId]/statements`: bounded CSV upload, private encrypted retention, normalized/raw hashes, unsupported-claim visibility, and idempotent revision identity.
- `apps/web/src/app/api/releases/[releaseId]/settlements`: validated integer allocation preview, funded-vs-reported readiness, holds/approval projection, and typed NEAR `open_settlement` transaction request.
- Agreement and settlement action routes return typed owner-wallet requests for `approve_agreement`, `approve_settlement`, disputes, clearance, funding, cancellation, and finalization; they never impersonate a wallet.
- `apps/web/src/components/ReleaseConsole.tsx`: functional owner workspace for implemented administration operations.
- `packages/domain/src/agreement-renderer.ts` and `packages/persistence/src/release-store.ts`: shared deterministic agreement and private statement workflows.

## Verification

| Check | Result |
| --- | --- |
| `npm run test:domain` | pass - 32 canonical, schema, parser, and allocation tests |
| `npm run test:server` | pass - duplicate semantic imports, explicit revisions, exact agreement commitments, and persistence checks |
| `npm run check` | pass |
| `npm run build` web/worker/packages | pass |
| `npm run build` contract stage | pass - Docker-backed contract build completed successfully with the configured environment |
| `npm run test:sandbox` | prior Phase 02-04 authority, settlement, payout, refund, cancellation, dispute, and retry evidence remains pass |

Unsupported deduction claims remain review-visible and block the payable preview. Re-importing the same normalized statement returns the existing revision; a meaningful correction creates the next revision. Chain readiness is advisory UI state only; the NEAR contract remains authoritative.
