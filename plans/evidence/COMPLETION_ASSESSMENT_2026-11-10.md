# RoyaltyDesk current completion assessment

Reviewed 2026-11-10 at source revision `ee669b40a3dc12521e0275d507ff3a0e6e893f52`.

## Current deployment update

The newer contract WASM SHA-256 `c319324997714c43ba10712a00487cfb125bd5ee7e8d7e49e5154b61604b7a3f` was deployed to `sickhat6192.testnet` on 2026-11-10 in upgrade transaction `BRHdcjbqqD5GAk9aXkTuNmmiQTRf4JtcVGSY5tFUjPio`, without calling `new`. `npm run verify:deployment -- BRHdcjbqqD5GAk9aXkTuNmmiQTRf4JtcVGSY5tFUjPio --upgrade` and the release manifest confirm the final on-chain bytes. The sampled release and completed settlement remained intact; see `TESTNET_UPGRADE_2026-11-10.md`. Earlier sections below document the sequence of local changes and may refer to the previous deployment. The browser wallet journey and fresh-checkout acceptance remain open, so the overall completion estimate is unchanged.

## Assessment and method

Estimated mandatory MVP completion: **70–80%, approximately 75%**. This is an engineering estimate of implemented, integrated, acceptance-backed behavior, not measured code coverage or a file-count statistic. The project is not release-ready. Optional Phase 10 and FUTURE_SCOPE are excluded.

Compared current application, worker, domain, chain, persistence, contract, verification scripts, phase plans, product requirements, acceptance matrix and recorded evidence. Distinguished source inspection, checks executed now and historical execution records. This is a completion review, not an exhaustive security certification. The old CODEBASE_REVIEW report describes an earlier revision; several of its highest-priority findings have since been repaired.

## Phase assessment

| Phase | Current assessment | Implemented / evidenced | Remaining or needing repair |
| --- | --- | --- | --- |
| 00 Foundation | Mostly complete | Pinned workspaces, lockfiles, Docker contract tooling, config, wallet probe, gateway adapter, command harness | Fresh install proof; real lint/format checks instead of only TypeScript and regex policy; normal application regression CI; storage sponsorship measurement |
| 01 Domain | Substantially complete; unit checks pass | Schemas, integer allocation, deterministic commitments, strict CSV parser, 32 passing tests | Broaden Rust/TypeScript parity to escaped recoupment codes and zero shares; check aggregate CSV overflow and approved-claim amount reconciliation, rather than only individual-row bounds/code matching |
| 02 Contract authority | Implemented, fixes required | Owner approvals, mandate scope/epoch/revocation, restricted keys, bounded agreements/settlements | Freeze participant membership; clear old active flags; global storage sponsorship and byte bounds; strict period/hash/string validation; canonical JSON escaping; complete views/events and cross-language edge cases |
| 03 Accounting | Substantial; targeted regressions pass | Reserve funding, independent integer entitlements, revisions, holds, cancellation, recoupment carry-forward, chronology comparison | Separate participant completion from outstanding refunds; reject malformed periods on chain; use frozen agreement membership for approval requirements; broader multi-period/amendment tests |
| 04 Transfers | Substantial; recovery acceptance incomplete | Pending-before-transfer, private attempt-matched callbacks, replay blocking, restricted signer saves signed identity before broadcast; recorded sandbox/fault tests | Actual process interruption around signing/broadcast/projection; browser-wallet operation persistence; receipt/reconciliation integration; documented recovery for signed-but-never-broadcast or hashless operations |
| 05 Application foundation | Partial integration | Wallet challenge verification, sessions, overlapping roles, encrypted files, SQLite jobs/leases, running signed-operation reconciliation | Authenticated cross-owner API negatives; owner-wallet operation persistence; actual killed-process and backup/restore tests; recover queued/running agent jobs without manual intervention |
| 06 Administration | Partial workflow | Wallet requests for creation, acceptance, agreements, mandates, correction, funding, approvals and payouts; chain-derived settlement preview | Original-file integrity; chain-confirmed/retryable agreement freeze; participant statement review access; cancellation/refund controls; full unsupported-claim hold/correction path; persist/refresh wallet actions |
| 07 Agents | Partial; useful building blocks and live delegated approval | Private contexts, structured actions, bounded sessions, persisted jobs, policy checks, live NEAR AI adapter, recorded restricted-agent approval | Multi-party coordinator and proposal/counterproposal rounds; transcript/diffs and draft handoff; agent preference/settings UI; fresh-session retry semantics; finalization/payout scheduling; real useful proposal or evidence-backed objection required by NEG-01 |
| 08 Participant experience | Incomplete | Wallet connection/signing, working API-backed console, direct chain reads, fixture/live labels | Complete three-owner browser journey; role-aware controls; readable balances, holds, approvals and final receipt links; cancellation/refunds; negotiation/settings screens; refresh/reconnect/account-switch recovery; accessibility and interruption scenarios |
| 09 Release | In progress | Release aggregator/manifest, README/setup, recorded deployment, CLI testnet settlement and live agent approval | Clean checkout plus empty storage reproduction; complete browser-wallet journey; canonical live objection/hold/correction and negative actions; backup/restore; exact current-revision evidence; demo video/script and license/readiness notes |
| 10 Conditional | Deferred, acceptable | No required completion claim | Intents payout, inference attestation/signatures and Spotify metadata each need separate implementation/evidence if selected; none blocks native P0 completion |

The master table's blanket `verified` labels for 02–08 should not be interpreted as satisfying every exit criterion. Phase 01 is the strongest locally verified area. Phase 00 compatibility has recorded evidence, but reproducibility and tooling still need completion.

## Current findings, in recommended order

### 1. Contract membership can change after agreement freezing (high)

`contracts/royaltydesk/src/lib.rs:47` permits any remaining invited owner to accept after freezing or activation. Agreement approval and settlement finalization use the mutable accepted-owner list. A late participant can change required consent without a newly approved participant list and can block settlement until approving despite having no entitlement in the frozen agreement. `approve_agreement` also leaves earlier agreement `active` flags true after an amendment activates.

Fix: bind approval/settlement authority to the frozen participant list, enforce the documented membership-change/amendment lifecycle, and maintain one active agreement. Test late acceptance before/after activation and during a live settlement. Confirmed by source inspection; not newly reproduced in sandbox during this review.

### 2. Original statement bytes can disagree with their retained hash (high evidence-integrity defect)

`packages/persistence/src/release-store.ts:30` returns the existing import for semantically identical CSV. `apps/web/src/app/api/releases/[releaseId]/statements/route.ts:24` then unconditionally overwrites its encrypted file with the newly submitted bytes. A reformatted reimport therefore retains the first raw hash while replacing the file. The database row is also inserted before the file write, so a write failure leaves an incomplete import.

An in-memory diagnostic in this review confirmed `duplicateUsesSameStorageKey=true` and `returnedRawHashMatchesNewBytes=false` for LF versus CRLF input. The overwrite follows directly from the route and `EncryptedFileStore.put` implementation.

Fix: preserve immutable original files on duplicate imports; make new-file/database persistence recoverable and check stored content against its hash. Bound upload consumption while reading, not just after allocating the entire request body.

### 3. Owner wallet operations are not durable (high completion gap)

`apps/web/src/components/ReleaseConsole.tsx:18` launches signing directly, then keeps the result only in component state. It does not use the chain-operation endpoint before wallet launch or persist the returned hash. Refresh or an ambiguous wallet response loses the request context, especially important for funding deposits. This does not establish duplicate payouts; contract replay protection remains separate.

Fix: persist owner intent before signing, associate returned transaction identity, recover from chain state on refresh, and show an unresolved state that does not invite blind resubmission. Test wallet rejection, lost response and refresh during funding.

### 4. Outstanding refunds unnecessarily block the next period (medium)

`contracts/royaltydesk/src/lib.rs:207` requires `refundable_yocto == 0` and no refund attempt before marking completion. Therefore paid participants cannot proceed to a new period until the funder withdraws excess. This contradicts master decision D-03.

Fix: track participant completion separately from backed refund obligations and test a new period while the prior period still has a refundable balance or pending refund.

### 5. Contract boundary validation and storage remain incomplete (high resource risk; medium interoperability defects)

`create_release` is public, zero-deposit and appends to an unbounded root vector. Several stored strings and revision counts are not bounded. Per-release agreement/settlement limits do not impose a global sponsored-storage budget. Large state is serialized with contract state and can threaten availability/storage headroom.

Chronology compares strings but does not validate YYYY-MM. `canonical_rules` manually interpolates strings without JSON escaping; the domain allows quoted/backslashed recoupment codes, so valid domain input can produce different hashes in Rust. The domain permits zero shares while `freeze_agreement` rejects them. Fix with shared boundary vectors, correct canonical serialization, record/byte limits and explicit sponsorship limits. These findings are source-backed, not claimed exploit reproductions.

### 6. Agreement freeze can leave local and chain versions inconsistent (medium)

The agreement route calls `freezeAgreement` and inserts a `frozen` database row before wallet consent. The version comes from the client while the contract chooses its next version. Wallet rejection leaves the local version occupied; retrying the same version hits the database primary key. Supplying a different version can produce a local digest/version mismatch with the contract.

Fix: use a pending operation with idempotent retry, derive/version-check against chain state, and finalize local frozen state from the confirmed contract outcome.

### 7. Participant review and canonical objection workflow are incomplete (high product gap)

Statement GET requires administrator membership, so ordinary accepted owners cannot use the evidence refresh control to review statement rows. The opening route requires `payable=true`, while the agent needs a matching on-chain settlement to dispatch a hold. This leaves no demonstrated integrated route for the specified first unsupported-claim import → agent hold → corrected revision journey. Deterministic rejection is useful but is not evidence of the specified hold workflow. Owner settlement-approval requests also do not independently enforce the current private-evidence validation policy.

Fix: expose authorized shared statement review to all relevant participants, implement an explicit invalid-evidence review/hold lifecycle, and prove corrected evidence, owner clearance and fresh approvals end to end. Preserve the rule that a hash does not authenticate external earnings.

### 8. Agent sessions do not implement complete multi-party negotiation (high product gap)

`agents/run/route.ts` creates a fresh session on each request. `WorkerAgentService.run` executes one job/result; the app does not expose continuation across parties, a coordinator transcript, term diffs or a proposal-to-agreement handoff. Startup reconciles signed operations but does not run a general queued-agent-job recovery scheduler. Dispatch is limited to approval/objection, so planned automated finalization/payout scheduling remains missing.

The recorded live `recommend_approval` is meaningful progress and proves more than a connectivity probe. It still does not satisfy the explicitly required useful negotiation proposal or evidence-backed objection. Add those journeys rather than relabeling the current probe or approval as negotiation.

### 9. Verification names and completion claims exceed their coverage

`scripts/test-e2e.mjs` performs four HTTP smoke checks with fetch. It does not launch a browser, authenticate three owners, sign a wallet transaction, inspect receipts or test account switching. `scripts/test-recovery.ts` constructs three receipt responses; it does not kill a process. Server tests cover useful persistence/policy primitives but are not the full authenticated route rejection matrix.

`verify-release.mjs` does not include `test:contract-regressions`, so the newly repaired amendment/hold/chronology cases are not guaranteed by the normal release gate. The only GitHub workflow builds the toolchain image on toolchain changes. `npm run check` performs type checks and regex source policy, not the full lint/format contract.

Fix: add actual browser/WASM and process-kill cases, include targeted contract regressions in release verification, and run the application suites in CI. Map each acceptance bullet to an assertion/artifact, not only each feature title to a directory.

## Earlier findings now repaired or materially improved

- Local administrator registration now verifies on-chain administration; duplicate registration and overlapping-role handling were added.
- Consumed recoupment is carried into amendments.
- An original disputing owner can clear the preserved hold after revision.
- Earlier/effective-period chronology is compared on chain (format validation remains open).
- Settlement ABI uses snake_case and agent digest construction matches the contract format.
- Settlement preview now derives from active chain terms and stored evidence.
- Restricted signing persists signed bytes/hash before broadcasting; a running reconciliation loop exists.
- Wallet transaction requests are now submitted through the wallet; login/logout refresh account identity.
- Root environment/path handling, mandate controls, correction requests and live agent lease heartbeats have been added.

## Checks executed during this review

Environment: Windows PowerShell, Node v24.21.0, installed workspace dependencies.

| Command / check | Observed result | What it establishes |
| --- | --- | --- |
| `npm run check` | Pass, all five workspace TypeScript checks and source-policy scan | Types/source policy only |
| `npm run test:domain` | 32 passed; zero skipped | Existing domain assertions |
| `npm run test:server` | 18 passed; zero skipped | Existing persistence, worker, policy and signer assertions |
| `npm run test:recovery` | Three checks passed | Receipt interpretation, not process-crash recovery |
| `npm run test:contract-regressions` | Pass with Docker access | Compiled existing production WASM: hold correction, period ordering and exhausted-recoupment amendment behavior |
| In-memory duplicate-import diagnostic | Same storage key, returned raw hash differs from resubmitted bytes | Confirms the inputs to the route's original-file overwrite defect |

Initial Docker regression attempt failed because the sandbox could not access Docker. The permitted retry completed with exit 0. No live inference, new deployment, public-network transaction, fresh install, full build or complete release-aggregator rerun was performed in this review. The contract regression used the existing built WASM; it was not freshly rebuilt here. An initial ad hoc import diagnostic failed from an incorrect unused export name and was corrected; it was not a product failure.

Historical `release-suite.json` records ten passing suites and source revision `24d3025...`, whereas current HEAD is `ee669b4...`. It also contains a source-tree hash. Do not assume the commit difference proves a source difference, or assume it proves current acceptance: establish the artifact/source relationship when refreshing release evidence. The historical live report records 0.1 NEAR paid across three CLI owners with a real delegated agent approval. Those records were reviewed, not independently re-executed on testnet now.

## Documentation and handoff

- FEATURES says no feature is implemented; PRD says not an implemented product; the master introduction still describes a documents-only repository. These are stale.
- Master/phase evidence overstates verified browser and recovery completion. Phase 09 still includes stale language about pending deployment/receipts despite later deployment and CLI evidence.
- Existing evidence contains outdated test counts and no-Git-repository statements. Preserve historical results but add current identity/status rather than presenting them as current.
- Retain the clear synthetic/testnet/unaudited/hosted-agent limitations. Optional attestation, Intents and Spotify remain deferred.
- Finish clean-host setup, empty storage, backup restoration, complete live/browser evidence, demo materials and license/readiness notes. Publishing and submission remain separate actions; no publication was performed or verified by this review.

Recommended sequence: repair membership/accounting/storage boundaries and original-file integrity; make wallet/agreement operations durable; complete shared review and negotiation flows; finish readable role-aware UI; prove browser and process recovery; then rerun clean setup and release/live acceptance and reconcile all phase statuses.

At the time of the baseline assessment, only this report had been added. The implementation update below records subsequent source changes.

## Implementation update after this assessment

The first recommended repair pass changed the working tree after the assessment above was written. The original assessment remains a baseline; these items are now locally implemented:

- Membership acceptance is rejected once any agreement has been frozen for the release. A late invited owner cannot change an already frozen participant set.
- Activation of an amendment leaves exactly one agreement marked active.
- Participant payout completion no longer waits for the funder to withdraw excess; the refundable balance remains separately recorded and withdrawable.
- An equivalent CSV reimport preserves the first stored original file and its raw hash. A failed private-file write prevents creation of the statement row.
- The release gate now includes the contract regression suite.

Verification at this local source state: `npm run check` passed, `npm run test:server` passed 20 tests, `npm run build` passed with rebuilt WASM SHA-256 `873bd0df04f9accb11705a798172585403e9ee4e7f0ebd311ad81f697e0a8371`, `npm run test:sandbox` passed, and `npm run test:contract-regressions` passed against the new WASM. The sandbox includes the late-membership rejection and confirms that all participant payouts can be Complete while excess is still refundable. A new statement test confirms that equivalent line-ending changes do not overwrite original bytes; another confirms that file-write failure leaves no statement row.

The prior testnet deployment evidence refers to a different WASM hash. This new build is **local/sandbox verified only**. Remaining contract storage/validation work, wallet operations, browser workflow and release handoff remain open. The full release aggregator was not rerun after adding its new suite.

## Further contract boundary work

The local contract now caps releases at 32, bounds recording identifiers and recoupment codes, validates agreement and settlement periods as `YYYY-MM`, allows zero-share participants consistently with the domain model, and JSON-escapes recoupment codes before hashing rules. `npm run build` passed and produced WASM SHA-256 `704411b8caa9f43596070a696a028f6c2d0017aaf6f434c7f3315570e445867e`. `npm run test:sandbox` passed with new malformed-period rejection checks. These are local/sandbox results; the recorded deployment still contains the older build.

The fixed release cap is a bounded prototype measure. It does not implement a sponsor deposit or storage measurement. Hash length/format checks also remain incomplete because existing sandbox fixtures use labeled hashes; update those fixtures and validate the full commitment boundary before treating the contract input limits as closed.

The subsequent bound-only change rejects empty, non-ASCII or over-128-byte settlement commitment fields. The final rebuilt local WASM hash is `c319324997714c43ba10712a00487cfb125bd5ee7e8d7e49e5154b61604b7a3f`; `npm run build` and `npm run test:sandbox` passed again. Hex digest format enforcement is still open.

## Agreement preparation follow-up

Agreement preparation now checks the next version and administrator against a fresh contract read. A repeated request for the same version and same bytes reuses its local draft; changed bytes conflict. The local row starts as `draft` and becomes `frozen` only through an explicit chain confirmation route that compares rule, document and approval hashes with the on-chain proposal. The owner console attempts that confirmation after wallet execution and offers a separate recovery control. Pending drafts are excluded from the document download and agent context. A server regression checks idempotent identical preparation and conflict on different terms.

Verification after these app changes: `npm run check`, 20 server tests, `npm run test:e2e` HTTP smoke, and `npm run build` passed. The web smoke suite still does not exercise wallet signing. No live wallet approval was performed. This closes the local stale-version/rejected-wallet draft issue only in part: owner-wallet intent and transaction identity are not yet durably recorded before signing, and concurrent wallet prompts for the same version still need an explicit operation lock/recovery protocol. Do not mark Phase 05, 06 or 08 verified from this change.

Accepted owners can now read the shared statement validation summary through the existing authenticated statement GET route; upload remains administrator-only. The agreement confirmation route also rechecks the administrator on chain. `npm run check` passed after these final route edits. Cross-owner authenticated HTTP regression coverage remains open.

The full `npm run verify:release` gate was run after the code and fixture updates. Its first run found that the fault-injection fixture used an invalid `2026-fault` period; the fixture now uses `2026-02`. The targeted fault suite passed, and the complete gate then passed all 11 suites: check, build, domain, contract, contract regressions, server, agents, recovery, HTTP smoke, sandbox, and fault injection. Saved report: `plans/evidence/artifacts/release-suite.json`, source tree hash `4e25031aac709a514d9376bb64e1d5d38676a5e1f332c95007d6a1cad9abb0d8`. This evidence note was appended after the gate, so its own bytes differ from the tested tree hash. No application code was changed after the green gate.
