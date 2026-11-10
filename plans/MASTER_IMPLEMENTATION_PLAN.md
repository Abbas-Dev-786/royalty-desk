# RoyaltyDesk — Master Implementation Plan

Status: Phase 07–08 fully verified; Phase 09 release verification and handoff is in progress. Baseline inspected: 2026-11-10.

This is the entry point for the coding harness. It translates the existing product documents into ordered, verifiable implementation work. Phases represent dependency milestones, not calendar commitments. Creating these plans does not implement or verify the product.

## Source of truth

Read [current scope](../docs/CURRENT_SCOPE.md), [PRD](../docs/PRD.md), [features](../docs/FEATURES.md), and [technical design](../docs/TECHNICAL_DESIGN.md) before executing a phase. [Future scope](../docs/FUTURE_SCOPE.md) remains deferred. [Hackathon overview](../HACKATHON.md) governs eventual event preparation; this plan does not authorize publication, submission, or mainnet spending.

The inspected repository contains product and research documents, with no application manifests, contract, migrations, or test suite. All source paths and commands below are **implementation targets**, not existing capabilities. External documentation establishes platform behavior; only recorded execution can establish that RoyaltyDesk works.

Authority order: current user instructions, repository instructions, product scope and requirements, technical design, then these implementation plans. Routine implementation choices can proceed without a user checkpoint. Material changes to rights, custody, assets, or scope must be surfaced and reflected in the source documents before dependent implementation. Never weaken an acceptance condition merely to make a phase pass.

## Target outcome

Three owners and their personal agents administer one recording: negotiate terms, approve one frozen agreement, delegate bounded authority, review a synthetic statement, dispute an unsupported deduction, approve a correction, fund the reserve, and distribute actual testnet NEAR with confirmed receipts. NEAR enforces rights, mandates, reserves, and entitlements; actual NEAR AI inference contributes a useful proposal or objection. Model output never substitutes for financial validation.

## Phase map

| Phase | Plan | Depends on | Exit evidence |
| --- | --- | --- | --- |
| 00 | [Foundation and compatibility](phases/PHASE_00_FOUNDATION.md) | Source documents | Reproducible toolchain, supported wallet/key path, sandbox and inference capability records |
| 01 | [Domain rules and fixtures](phases/PHASE_01_DOMAIN.md) | 00 | Canonical digest vectors and independently checked money/CSV fixtures |
| 02 | [Contract identity and authority](phases/PHASE_02_CONTRACT_AUTHORITY.md) | 01 | Real account permission tests and agreement/mandate rejection matrix |
| 03 | [Contract settlement and accounting](phases/PHASE_03_SETTLEMENT_ACCOUNTING.md) | 02 | State-transition and conservation tests including revisions, disputes and refunds |
| 04 | [Transfers and reconciliation](phases/PHASE_04_TRANSFERS.md) | 03 | Sandbox receipt evidence for success, failure, concurrent triggers and pending recovery |
| 05 | [Application identity and persistence](phases/PHASE_05_APPLICATION_FOUNDATION.md) | 01, 02, 04 | Authenticated boundaries, durable jobs, restricted signing and restart evidence |
| 06 | [Agreement and statement workflows](phases/PHASE_06_ADMINISTRATION.md) | 03, 05 | Wallet-approved agreement, private evidence import and correction workflow |
| 07 | [Personal agents and orchestration](phases/PHASE_07_AGENTS.md) | 04, 05, 06 | Isolated contexts, bounded jobs, useful live inference and delegated actions |
| 08 | [Integrated participant experience](phases/PHASE_08_INTEGRATION.md) | 04–07 | Browser journeys, truthful receipt views and fault-recovery scenarios |
| 09 | [Release verification and handoff](phases/PHASE_09_RELEASE.md) | 00–08 | Fresh setup, full deterministic suite and separately evidenced live testnet journey |
| 10 | [Conditional integrations](phases/PHASE_10_CONDITIONAL.md) | 09 plus integration prerequisites | Separate acceptance for F-12, F-13 and F-14; never a P0 release prerequisite |

Execute in this order by default. Domain-only work can continue when a credential-dependent check is blocked, but a mocked integration cannot satisfy the blocked check. A dependency is satisfied by linked passing evidence at the applicable revision, not by a folder existing. No parallel agents or concurrent implementation are required by this plan.

## Harness execution protocol

1. Read this file, the selected phase, its source references, and the previous phase's evidence. Inspect actual files and working changes before editing. Do not overwrite unrelated work.
2. Mark the phase `in_progress` in the progress table. Pick the next incomplete task ID. Keep task IDs stable across revisions.
3. Implement the task and its meaningful positive/negative verification. Update interfaces and affected documentation together. Record a decision when resolving an open compatibility question.
4. Run the phase's required checks. Preserve exact commands, results, environment identity, and sanitized artifacts. A skipped test is not a pass.
5. Complete the phase evidence record and evaluate every exit condition. On failure, fix within scope or record the exact blocker and unaffected work that can continue. Do not fabricate transaction hashes, model runs, screenshots, or test output.
6. Mark `verified` only when its exit conditions pass. Continue to the next eligible phase without a routine confirmation prompt. Human wallet consent inside the product remains mandatory for owner actions.
7. On resume, reconcile previous external operations before retries. Re-run affected checks after relevant changes; unrelated green checks need not be repeated until the final release suite.

This task authorizes writing the plans. Future execution must respect the user's authorization for deployment and external actions. Producing a submission draft does not authorize sending it.

## Progress

Update this table during implementation. Allowed states: `not_started`, `in_progress`, `blocked`, `verified`, `deferred`. `deferred` applies to P1 only unless scope is explicitly changed.

| Phase | State | Evidence | Blocker / next task |
| --- | --- | --- | --- |
| 00 | verified | [Phase 00 evidence](evidence/PHASE_00.md) | Build, live NEAR AI, sandbox access-key, and browser-wallet checks pass; optional model attestation remains |
| 01 | verified | [Phase 01 evidence](evidence/PHASE_01.md) | 32 domain/parser tests pass; Rust parity remains Phase 02 |
| 02 | verified | [Phase 02 evidence](evidence/PHASE_02.md) | Rebuilt contract and expanded authority/rejection sandbox flow pass |
| 03 | verified | [Phase 03 evidence](evidence/PHASE_03.md) | Rebuilt contract, funding, revision, cancellation, conservation, and finalization flow pass |
| 04 | verified | [Phase 04 evidence](evidence/PHASE_04.md) | Production and separate fault-injection WASM pass payout, failure/retry, refund, replay, recovery, and callback-liveness checks |
| 05 | verified | [Phase 05 evidence](evidence/PHASE_05.md) | Auth/session, durable persistence, encrypted private files, leases, and operation reconciliation pass local checks; live wallet proof remains environment-specific |
| 06 | verified | [Phase 06 evidence](evidence/PHASE_06.md) | Membership, immutable agreements, private statement revisions, settlement previews, and browser administration surface pass local checks |
| 07 | verified | [Phase 07 evidence](evidence/PHASE_07.md) | Personal contexts, bounded NEAR AI/fixture orchestration, policy tools, worker API, and restricted dispatch pass local checks; live inference remains separately evidenced |
| 08 | verified | [Phase 08 evidence](evidence/PHASE_08.md) | Integrated owner workspace, agent proxy, settlement state controls, receipt surface, and isolated e2e smoke pass local checks |
| 09 | in_progress | [Phase 09 evidence](evidence/PHASE_09.md) | Full release aggregator and artifact manifest pass; fresh-environment reproduction, deployment identity, and live testnet receipt evidence remain |
| 10 | deferred | Not recorded | Optional; branch-specific prerequisites |

## Required architecture and file ownership

| Target | Responsibility |
| --- | --- |
| `apps/web` | Next.js UI, wallet requests, authenticated routes, minimal private DTOs |
| `apps/worker` | Persistent job execution, model adapters, policy checks, reconciliation scheduling |
| `contracts/royaltydesk` | Rust authority, state transitions, independent accounting, native transfers |
| `packages/domain` | Schemas, integer parsing, canonicalization, financial previews and reference vectors |
| `packages/chain` | Typed contract client, transaction identity, restricted signer, receipt interpretation |
| `packages/persistence` | SQLite migrations, repositories, transactional job leases, encrypted file metadata |
| `fixtures` | Synthetic statements, agreement vectors and fault cases; never private customer exports |
| `tests` | Cross-component, sandbox, browser, restart and live integration verification |
| `scripts` | Repeatable checks, fixture setup and environment validation |
| `docs/decisions` | Versioned implementation decisions with supporting evidence |
| `plans/evidence` | Sanitized phase results using the [evidence template](EVIDENCE_TEMPLATE.md) |

Use one persistent host and durable volume for the web process, worker, SQLite and private files. SQLite access across local processes needs short transactions, concurrency control and bounded lock recovery. No assumption that separate replicas can share a local file database safely. Secrets, agent keys, private uploads and live database files remain outside version control and public directories.

## Non-negotiable invariants

- Contract state determines authority and payment rights. UI/database projections cannot authorize a payment.
- Owners alone approve agreements and amendments. Every frozen digest is versioned and bound to application, network, contract and release.
- Each agent has a distinct account and a restricted function-call key. Method/receiver restrictions limit key use; the contract enforces the mandate's financial scope. Gas allowance is not a spending cap.
- Agent approval is checked again at finalization against mandate epoch, expiry, agreement and gross cap. Revocation does not reverse finalized entitlements.
- Amounts use integer yoctoNEAR, with decimal strings at JSON/storage boundaries. Shares total 10,000 basis points; allocation conserves every atomic unit.
- There is one payable identity per release-period, one live settlement per release, and no duplicate consumption of recoupment.
- A revision invalidates approvals but preserves disputes. Only each disputing owner clears their hold. Cancellation before finalization requires unanimous owners.
- Financial source truth remains participant-reviewed external evidence. A statement hash does not prove earnings or absence of hidden expenses. Contract arithmetic cannot parse or authenticate a private CSV by reading its hash.
- Transfers become pending before scheduling. Only matching private callbacks resolve them. Unknown outcomes never authorize a new payment.
- Reported amounts, funded reserves, entitlements and completed payments are separate UI values. Native testnet funds do not back a mainnet Intents payout.

## Implementation decisions to freeze

These defaults close gaps in the design; they are proposed refinements, not evidence of existing behavior. P00/P01 must record them in `docs/decisions/0001-implementation-baseline.md` and update affected technical-design sections before implementing dependent contract behavior.

| ID | Default / question | Verification owner |
| --- | --- | --- |
| D-01 | One immutable registered funder per release, selected at creation and defaulting to creator. Only that account deposits and withdraws refunds. Multiple funders are deferred. | 02/03: wrong-funder calls rejected; principal ownership explicit |
| D-02 | A cancelled release-period remains a permanent tombstone and cannot reopen. Its refunds remain recoverable. UI warns before unanimous cancellation. | 03/06: no replay through cancellation |
| D-03 | Keep the release locked while a settlement is review, held, finalized or paying. Unlock when participant payouts are complete, or cancellation has allocated all deposits to refunds. Outstanding refund obligations stay separately backed. | 03/04: no overlap or cross-period reserve spending |
| D-04 | Reject zero-gross payable settlements; keep zero-revenue imports as non-payable evidence. Zero individual entitlements require no transfer and count as resolved. | 01/03/04: dust and zero-share vectors |
| D-05 | Mandate cap is gross amount per settlement, not lifetime spend. Method names form an explicit allowlist. Replacement/revocation increments epoch. | 02/07: UI and contract agree |
| D-06 | A cleared hold is tied to the reviewed revision. Revision preserves all existing holds and clears all approvals; a new hold remains possible before finalization. | 03: revision/clear/dispute race tests |
| D-07 | Private statement validation gates normal server/agent approval. On-chain enforcement covers authorized rules and arithmetic, not independent source authentication. Do not claim it can detect concealed CSV claims from a hash. | 06/07: review evidence plus exact-digest approvals |
| D-08 | Select and pin compatible wallet, NEAR client, Rust sandbox, CSV parser and SQLite driver using actual probes; choose npm workspaces unless a discovered repository convention supersedes it. | 00: lockfiles and compatibility record |
| D-09 | Financial operations persist signed transaction identity before broadcast. A per-key signing queue prevents nonce collisions; crash recovery queries the same identity and contract state. | 04/05: kill-and-restart tests |
| D-10 | Bound public read pagination, invitations, frozen proposal count, revisions and retained job data. Record numeric limits and sponsorship budget after measuring storage; reject excess without consuming principal. | 00/02/03/05: boundary and exhaustion tests |

## Command contract

The following root commands must be created by P00 and wired to real implementations as their phase lands. They are not runnable at plan creation. A missing suite must fail explicitly or report `not implemented` with a nonzero exit; an empty test selection must not pass.

| Planned command | Responsibility |
| --- | --- |
| `npm ci` | Reproduce pinned workspace dependencies once lockfile exists |
| `npm run check` | Type checking, linting and formatting verification |
| `npm run build` | Web/worker/package production build |
| `npm run test:domain` | Shared vectors, canonicalization, parser and integer allocation |
| `npm run test:contract` | Rust unit/state/property checks through a portable wrapper |
| `npm run test:sandbox` | Compiled WASM on NEAR sandbox, real access keys and receipts |
| `npm run test:server` | HTTP auth/access controls, persistence and job policy |
| `npm run test:agents` | Deterministic model fixtures, tool restrictions and budgets |
| `npm run test:recovery` | Process crashes, concurrency and transaction ambiguity |
| `npm run test:e2e` | Browser flow against local app and sandbox |
| `npm run test:live` | Explicitly configured NEAR testnet + NEAR AI run; no implicit mainnet fallback |
| `npm run verify:release` | Required offline suites plus build; reports live evidence separately |

Record the exact selected Rust commands behind wrappers, including build target, toolchain and sandbox runner. On Windows validate native support; if required, document and verify WSL/container execution. Do not invent a platform compatibility claim. Each phase must identify its test names/files so the harness can reproduce targeted failures without running paid inference.

## Evidence and completion

Use [EVIDENCE_TEMPLATE](EVIDENCE_TEMPLATE.md). Save one report per phase, for example `plans/evidence/PHASE_03.md`, only when work begins. Report task IDs, code revision or source digest, configuration identity, exact command/exit status, case counts, expected/actual results and artifact paths. Retain failed checks until superseded with an explanation. Evidence must be sanitized before entering the repository.

Distinguish `source-backed design`, `unit verified`, `sandbox verified`, `browser verified`, and `live testnet verified`. A screenshot proves display, not final chain receipt status. A fake model fixture proves orchestration logic, not live inference. A compiled contract proves neither permissions nor payout safety.

Required release completion: F-01–F-11 all accepted, every invariant exercised, no unresolved P0 failure, reproducible setup, and a separately recorded live inference/testnet journey. F-12–F-14 remain deferred or explicitly accepted per branch. Full feature-to-evidence mapping is in [ACCEPTANCE_MATRIX](ACCEPTANCE_MATRIX.md).

## External evidence consulted

These references informed the plan on 2026-11-07; refresh version-sensitive details during P00 and relevant integration work.

- [NEAR access keys](https://docs.near.org/protocol/accounts-contracts/access-keys), retrieved through Context7 `/near/docs`: function-call keys restrict receiver/methods and attach zero NEAR; allowance covers gas.
- [NEAR Rust SDK](https://github.com/near/near-sdk-rs), retrieved through Context7 `/near/near-sdk-rs`: asynchronous promises and private callbacks require explicit completion handling.
- [Next.js authentication](https://nextjs.org/docs/app/guides/authentication), retrieved through Context7 `/vercel/next.js`: authorize near the data source and at mutation/route boundaries.
- [NEAR AI private inference](https://docs.near.ai/cloud/private-inference): use the documented gateway path; endpoint attestation and response integrity are separate evidence checks. Ordinary inference must not receive a verification badge without those checks.

None of these sources proves this project's selected versions, credentials, deployment, security or live availability.
