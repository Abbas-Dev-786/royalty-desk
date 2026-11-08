# Phase 05 — Application Identity, Persistence and Jobs

Status: not started. Depends on: [Phase 01](PHASE_01_DOMAIN.md), [Phase 02](PHASE_02_CONTRACT_AUTHORITY.md), [Phase 04](PHASE_04_TRANSFERS.md). Next: [Phase 06](PHASE_06_ADMINISTRATION.md).

## Outcome and source basis

An authenticated application and persistent worker can safely store private evidence, queue work and reconcile NEAR actions across restarts. Sources: [technical design sections 2, 3, 9, 10, 13](../../docs/TECHNICAL_DESIGN.md), [F-01, F-02, F-10](../../docs/FEATURES.md). Next.js authorization belongs at the data boundary, including route handlers and mutations, as established in the master's external references.

## Tasks

### P05-01 — Implement wallet authentication and sessions

- Implement challenge and verification routes using the actual wallet path selected in Phase 00. Challenge binds nonce, account, domain, network, issued time and expiry.
- Verify wallet signature/key authority or the exact finalized challenge transaction. Consume nonce atomically so concurrent verification cannot create replay sessions.
- Use secure HttpOnly sessions, configured cookie lifetime, logout and same-origin/CSRF protection. Reject missing or mismatched production secrets at startup.
- Acceptance: AUTH-01/02 pass; a wallet connection without account-control proof does not create an authenticated session.

### P05-02 — Implement migrations and private storage

- Create SQLite migrations and repositories for users, challenges, membership projections, agent profiles, document metadata, drafts, imports, settlement projections, jobs, actions and chain operations.
- Store money in lossless text fields, not floating-point SQL values. Add unique constraints for account/network, release-period identity, logical job key and chain-operation identity.
- Define WAL/busy-timeout behavior where supported, short transaction boundaries, lease compare-and-swap and schema-version checks. Only local processes on the selected persistent host access the database.
- Encrypt private preferences/files at rest using an established authenticated-encryption primitive and a secret outside the database. Generate opaque storage keys; validate paths and sizes; never serve from a public/static directory.
- Acceptance: migrations work on a fresh database and restart; duplicate requests cannot create duplicate jobs; encryption/decryption failures never return plaintext or secrets.

### P05-03 — Establish authorization at every resource boundary

- Implement server-only access helpers for current session, release membership, administrator actions and owner-private resources. Apply them to routes, actions, jobs, file downloads and exports.
- Derive account/release/agent context from verified server state, not request-supplied ownership. Project finalized chain membership into the app; stale/unverified membership cannot grant access.
- Provide minimal DTOs and sanitized structured logs with correlation IDs. Public chain events and browser data exclude private instructions, raw documents and credentials.
- Acceptance: an authenticated outsider and another member both fail to access owner-private material; UI hiding is not the enforcement mechanism.

### P05-04 — Implement durable jobs and bounded recovery

- Implement queued/leased/running/awaiting_human/succeeded/failed transitions with unique logical keys, attempt limits, lease expiry, cancellation and restart recovery.
- Lease transactions atomically; heartbeat long work. A recovered computation may rerun only idempotent computation; submitted financial operations go to reconciliation first.
- Keep an append-only action history and current job result. Version the job input digest so a revised agreement or settlement cannot accidentally reuse old work.
- Acceptance: two workers racing a job yield one current lease; stale lease holders cannot commit new results or sign after losing their lease.

### P05-05 — Integrate restricted signing and operation persistence

- Store only approved agent function-call keys in the worker keystore; owners sign through their wallets. Keep recovery/full-access credentials outside worker configuration.
- Serialize transaction construction per signing key and revalidate current mandate/input digest before signing. Persist intent and signed transaction identity before broadcast.
- Record broadcast/receipt outcomes through Phase 04's chain adapter. Reconcile unknown operations without constructing a new transfer. Handle RPC timeout/rate limit through bounded retries of reads.
- For owner-wallet actions whose signed bytes the server never sees, persist the requested operation before wallet launch; record returned hash when available and recover from contract state. Never automatically re-open a deposit request after an ambiguous wallet response.
- Acceptance: account A's job cannot reach B's signer, and a crash after broadcast does not become a new financial action.

## Verification

Run `npm run test:server`, `npm run test:recovery`, `npm run check`, `npm run build`. Use real SQLite and child processes for persistence/recovery cases, not only repository mocks.

- Replay, expired and wrong-domain/network challenges; simultaneous nonce verification; logout; unauthorized mutation; CSRF; direct file traversal; cross-owner export.
- Duplicate job submission, lease race, worker termination before/after lease, stale lease write, concurrent per-key signing.
- Kill the worker before broadcast, after broadcast before acknowledgment, after receipt before projection update, and during DB write. Assert no duplicate operation, reconstructed state and visible pending/reconciliation outcome.
- Database/file restart and backup restore; missing decryption secret fails closed. Logs and built browser assets contain no configured secrets.

## Evidence and exit

Targets: `packages/persistence`, `apps/web/src/server`, `apps/web/.../api/auth`, `apps/worker/src/{jobs,signer,reconciliation}`, recovery/server tests and `plans/evidence/PHASE_05.md`.

Evidence includes migration versions, crash points, operation IDs, SQL uniqueness outcomes, denied access cases and successful recovery state. Exit requires durable execution and verified authorization. Do not move SQLite to ephemeral hosting or replace unknown transaction status with assumed failure to make recovery tests pass.
