# Phase 05 Evidence - Application Identity, Persistence and Jobs

## Status

Implemented and locally verified for the application foundation. The server has a NEP-413 challenge/session path, durable SQLite records, encrypted private files, authorization helpers, durable job leases, and chain-operation reconciliation state.

## Implemented paths

- `apps/web/src/app/api/auth/*`: challenge, NEP-413 verification, HttpOnly session cookie, logout, and current-user endpoint.
- `apps/web/src/server/{runtime,authorization,auth}.ts`: same-origin checks, server-side session lookup, membership authorization, network/domain binding, and `near-api-js/nep413` verification with FullAccess authority lookup.
- `packages/persistence/src/database.ts`: WAL, foreign keys, busy timeout, schema versioning, and restart-safe tables for users, challenges, sessions, memberships, documents, agreements, imports, settlements, jobs, actions, and chain operations.
- `packages/persistence/src/secure-store.ts`: AES-256-GCM private-file storage with opaque keys, path validation, and a 1 MiB bound.
- `packages/persistence/src/job-store.ts` and `apps/worker/src/jobs/runner.ts`: compare-and-swap leases, heartbeats, state transitions, append-only history, bounded failure handling, and no blind financial retry.
- `packages/persistence/src/operation-store.ts` and `apps/worker/src/reconciliation/chain-operations.ts`: intent identity before broadcast and unknown-outcome reconciliation.
- `packages/chain/src/restricted-signer.ts`: per-key serialized function-call signing, method/deposit allowlist, pre-broadcast operation identity, and unknown-outcome persistence.
- `apps/web/src/app/api/releases/[releaseId]/agents/me`: owner-only encrypted agent profile storage; another member cannot read or mutate the profile.
- `apps/web/src/app/api/chain/operations`: idempotent operation-intent creation and authorized status reads for post-wallet receipt reconciliation.

## Verification

| Check | Result |
| --- | --- |
| `npm run check` | pass |
| `npm run test:server` | pass - 11 tests, including single-use challenges, revoked sessions, encrypted storage, job leases, and chain-operation identity |
| `npm run build` web/worker/packages | pass |
| `npm run build` contract stage | pass - Docker-backed contract build completed successfully with the configured environment |

The server reconstructs the stored message, nonce, and domain before NEAR RPC verification. No client-supplied ownership or role is trusted. A live browser wallet signature remains an environment-specific acceptance artifact and should be recorded separately when the deployed app is exercised.
