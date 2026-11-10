# RoyaltyDesk codebase completion review

Reviewed 2026-11-10 against source revision `24d302569382dc767b9abf7777cc3bc73fa03122`.
This is an implementation/acceptance review, not a claim that every possible execution path is secure.

## Assessment

RoyaltyDesk administers recording-revenue agreements, participant mandates, private statements, disputes, reserves and native NEAR payouts. Its intended differentiator is participant-specific AI assistance under contract-enforced authority. Current scope is a three-participant testnet prototype using synthetic NEAR statements, not automatic collection of real music earnings.

Estimated completion of mandatory P0 scope: **55–65%**, centered on 60%. This is an engineering estimate weighted by usable, integrated acceptance behavior, not a test-coverage statistic or completed-file count. Core primitives are considerably further along than the complete application. The project is not release-ready. Phases 05–08 should not be treated as fully verified against their stated exit conditions.

| Area | Assessment |
| --- | --- |
| Domain schemas, integer allocation, canonicalization, CSV | Substantial implementation with passing tests; application binding and some boundary cases remain |
| Contract authority, reserves and transfers | Substantial and executable in sandbox; amendment accounting, correction and chronology defects block acceptance |
| Authentication and private persistence | Implemented primitives; release authorization and multi-role modeling are incomplete |
| Owner web workflows | Partial developer console; transaction requests are displayed rather than executed by wallet |
| Personal agents | Model adapters, session records, schemas and policy helpers exist; integrated negotiation and delegated execution are incomplete |
| Recovery and operations | Persistence primitives exist; signing crash window and missing running reconciliation prevent acceptance |
| Release/demo | Build and current suites work; fresh setup and complete live three-owner journey unverified |
| Optional Intents, attestation, Spotify | Deferred; excluded from the P0 estimate |

## Checks actually executed

Environment: Windows PowerShell, Node v24.21.0, npm 11.19.0, Docker Linux toolchain.

- `npm run check`: passed all five workspace TypeScript checks and custom source-policy scan. This is not a full linter/formatter or Rust formatting check.
- `npm run build`: passed web production build, TypeScript package checks and contract WASM build after allowing Docker access. Initial sandbox execution failed because Docker access was denied, not because compilation failed.
- Production WASM SHA-256: `460e7c22d6c200cf00c782c32686226b5417cd936413368d7117eb13de2ea8f2`.
- `npm run test:domain`: 32 passed, zero skipped.
- `npm run test:server`: 14 passed, zero skipped.
- `npm run test:agents`: 3 passed, already included in the 14 server tests.
- `npm run test:contract`: 2 Rust unit tests passed.
- `npm run test:recovery`: three receipt-interpretation cases passed using constructed responses; this is not a process-crash test.
- `npm run test:e2e`: four HTTP smoke checks passed; no browser automation or wallet transaction journey is executed by this script.
- `npm run test:sandbox`: passed current 20 reported checks on compiled WASM, including transfers, refund, revoked approval and failed-recipient retry.
- `npm run test:fault-injection`: passed callback interruption, pending entitlement and replay blocking.
- Additional `node scripts/audit-contract.mjs`: completed with exit 0, confirming all three suspected defects against compiled production WASM. Original owner clearance after revision returned `ERR_DISPUTE_OWNER`; an earlier period was accepted and finalized; an unchanged amendment paid the beneficiary 100% of gross rather than their 50% share because the exhausted advance was recouped again. Exit 0 means successful reproduction of defects, not correct product behavior.
- Local in-memory diagnostic: confirmed membership upsert admits a second arbitrary administrator, relative example storage path is rejected, and a mock lost-response signer operation is submitted twice.

The release aggregator itself was not rerun; its individual component commands were. Existing release JSON refers to an older revision. Paid inference, live wallet consent, public testnet deployment/transfers, fresh `npm ci`, backup restore and full browser interaction were not performed. Historical evidence is not counted as newly verified.

## Blocking findings

### 1. High: release creation grants access to existing private releases

`apps/web/src/app/api/releases/route.ts:12` accepts a caller-supplied release ID and upserts the authenticated caller as an accepted administrator, without checking whether the release already exists or verifying chain administration. `requireMembership` then trusts this row. A signed-in outsider who knows a release ID can acquire access to administrator-only agreement/statement routes. Contract checks still protect on-chain actions; private application data is exposed by this independent boundary failure.

Fix: introduce a unique release record, reject duplicate creation, verify administrative authority, and test authenticated outsiders against existing releases.

### 2. High: amendments reset already consumed recoupment

`contracts/royaltydesk/src/lib.rs:63` initializes every proposed recoupment with `consumed_yocto: 0`. The amendment checks inspect the old amount but never carry it into the new agreement. An unchanged, unanimously approved amendment can charge the same advance again in a later settlement. Consent to unchanged terms does not satisfy the specified carry-forward accounting requirement.

Fix: preserve release-level consumed recoupment across versions; test exhausted and partially consumed advances through amendment activation.

### 3. High: correction prevents the original hold from being cleared normally

`revise_settlement` increments the settlement revision while preserving dispute records with their previous revision. `clear_dispute` at `lib.rs:126` requires the dispute revision to equal the new settlement revision. The original owner therefore receives `ERR_DISPUTE_OWNER` after a correction. Raising a new dispute and then clearing it is a workaround, not the specified flow.

The existing sandbox clears the dispute before revision and therefore misses this bug. Fix the explicit reviewed-revision clearance semantics and test dispute → revise → owner clears → approve → finalize.

### 4. High: signed transaction identity is not durable before broadcast

`packages/chain/src/restricted-signer.ts:30–38` records the transaction hash after `signAndSendTransaction` returns. A lost response leaves an unknown operation with no hash; calling the same operation again sends another transaction. The reconciliation helper cannot look up hashless operations. A mock transport diagnostic reproduced two sends for one operation after ambiguous errors. This does not prove duplicate payout on-chain: the contract has separate replay protection. It does violate the stated no-blind-resubmission invariant.

Fix: persist signed bytes/hash/nonce before broadcast and reconcile the same identity before any retry. Add actual process interruption tests, including the pre-hash-persistence window.

### 5. High functional gap: wallet and worker workflows are not connected

`WalletProbe.tsx` signs authentication messages only. `ReleaseConsole.tsx` fetches APIs and prints JSON, including returned transaction requests. It does not invoke wallet transaction signing. Release creation and agreement freezing are local database operations. Mandate management, funding, finalization, payout and receipt journeys are not reachable as complete UI workflows.

`DurableJobRunner`, `AgentToolDispatcher`, `RestrictedSigner` and `reconcileOperation` exist but are not instantiated/called by the running worker service. Agent execution is request-driven model output, without an integrated dispatcher or restart scheduler. There is no complete multi-participant proposal/counterproposal coordination flow.

Fix: connect these paths with explicit owner consent and durable chain reconciliation; prove the entire canonical journey.

### 6. High functional gap: contract payload and digest disagree across layers

The settlement POST route sends the camelCase domain commitment directly as `open_settlement.input`; Rust `SettlementInput` requires snake_case fields. `apps/web/src/server/agent-context.ts:55` uses the allocation preview hash as the settlement digest; Rust computes a hash over period, revision, agreement version, statement hash, gross, deduction hash and preview hash. A normally produced approval therefore does not match contract expectations.

Fix: use explicit typed ABI conversion and one tested settlement digest specification; test real route-produced requests against WASM.

### 7. Medium: period chronology and effective periods are not enforced

`open_settlement` checks duplicate identities and live settlements, but does not require a period after the last finalized period or after the agreement effective period. It also accepts arbitrary period strings. Fix contract-side validation and chronology tests.

## Additional completion issues

- `release_memberships` has one role per `(release_id, account_id)` despite the PRD allowing overlapping roles. Creating a release with yourself as funder overwrites your administrator role. Administrators cannot use owner-only agent/approval routes without losing their administrator role.
- `.env.example` supplies `ROYALTYDESK_FILES_PATH=./private`, while `EncryptedFileStore` requires an absolute path and routes pass the value unchanged. The documented example fails private uploads/preferences even after replacing the secret. Worker start/dev scripts do not load the root `.env`; web and worker default relative databases resolve from different workspace directories.
- UI account state is fetched once. Successful login in the separate wallet component does not refresh console state; logout also leaves stale console state.
- Statement import verifies internal row consistency, but does not compare the recording with registered release/active agreement data. Preview inputs for shares, funding, holds and approvals come from the request body rather than authoritative chain reads.
- Reimporting semantically identical CSV can overwrite the stored raw file while retaining the original raw hash. Private file writes and database inserts are not one recoverable operation.
- Contract releases are stored in an unbounded root vector; several strings and revisions lack planned limits. Anyone can create sponsored state without a global storage budget. This needs bounded storage and resource-exhaustion verification.
- Contract completion waits for refundable excess to be withdrawn, contrary to the decision to permit the next period once participant payouts finish while separately backing refunds.
- Agreement activation leaves prior proposal `active` flags true. Membership can still be accepted after freezing/activation, creating a mismatch with frozen participants and approval counts. These require dedicated regression cases.
- The AI compatibility probe explicitly requests `needs_human / compatibility probe`. Its historical success demonstrates gateway connectivity, not a useful negotiation proposal or evidence-backed objection required by F-03/F-11.
- No runtime/browser proof was obtained for private preference isolation across all routes, real wallet verification negatives, full negotiation rounds, storage pressure or fresh-host recovery.
- The checked-in GitHub Actions workflow builds/checks the toolchain image only; it does not run the application release regression suite on ordinary source changes.

## Documentation reliability

`FEATURES.md`, PRD, technical design and master-plan introduction retain pre-implementation statements. `SETUP.md` says no Dockerfile exists despite `docker/contract-toolchain.Dockerfile`, and describes signature verification as future work despite current server code. The plan/evidence simultaneously overstate integrated completion. README's Node minimum also does not match the project's direct TypeScript execution and built-in SQLite assumptions; validation here used Node 24 only.

The acceptance matrix maps broad feature names to tests; it does not prove each acceptance bullet. Passing test counts cannot compensate for missing authenticated browser, cross-layer, amendment and recovery cases.

## Recommended completion order

1. Repair release authorization and role modeling; add authenticated isolation tests.
2. Repair recoupment carry-forward, correction/clearance, chronology and membership/version invariants on-chain.
3. Correct ABI conversion, digest generation and authoritative evidence/preview binding.
4. Connect owner wallet transactions and restricted agent dispatch to durable operations and reconciliation.
5. Finish participant screens, negotiation, mandates, funding, payouts, receipts and account switching.
6. Replace smoke-only acceptance with three-owner browser/WASM and real crash-recovery tests.
7. Fix setup/environment paths, reproduce from a clean checkout, then record the separately authorized live testnet and useful NEAR AI journey.
8. Reconcile documentation and phase states with the resulting evidence. Optional integrations can remain deferred.
