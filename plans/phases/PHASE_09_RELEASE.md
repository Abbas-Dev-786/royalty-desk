# Phase 09 — Release Verification and Implementation Handoff

Status: not started. Depends on: all required [Phases 00–08](../MASTER_IMPLEMENTATION_PLAN.md). Optional next: [Phase 10](PHASE_10_CONDITIONAL.md).

## Outcome and source basis

A reproducible P0 build with evidence for every required feature, including real NEAR AI inference and real native NEAR testnet receipts. Sources: [F-11](../../docs/FEATURES.md), [current scope acceptance criteria](../../docs/CURRENT_SCOPE.md), [technical design section 12](../../docs/TECHNICAL_DESIGN.md), [hackathon overview](../../HACKATHON.md).

This phase prepares implementation and demo artifacts. Public repository changes, social posts, submission and mainnet spending are separate external actions requiring applicable authorization. A local-only reproducible demo remains a valid product-delivery option under the supplied overview.

## Tasks

### P09-01 — Close acceptance coverage and run the full offline suite

- Populate [acceptance matrix](../ACCEPTANCE_MATRIX.md) with concrete test files and phase evidence links. Map every F-01–F-11 acceptance bullet, not just each feature title.
- Run the release aggregator: install from lockfile, check, build, domain, contract, sandbox, server, agents, recovery and browser suites. Keep live paid/network checks separate.
- Confirm missing/empty suites fail, unexpected skips remain blockers and fault-injection WASM is never the release artifact.
- Acceptance: no unresolved P0 failure or unverified required case; logs name the exact code/configuration revision tested.

### P09-02 — Reproduce from a fresh environment

- Write root README setup, environment placeholder reference, supported operating environment, migration steps, fixture load, web/worker startup, wallet setup and expected outputs.
- Execute those instructions from a fresh checkout/copy and empty private data location. Do not depend on developer-local paths, populated cookies, untracked keys or a pre-existing database.
- Test restart and backup restoration on the intended persistent host. Record how to stop the worker safely and reconcile outstanding operations before resuming.
- Acceptance: a new operator can reach the canonical local journey; any Windows/WSL/container requirement is tested and documented.

### P09-03 — Verify the actual testnet deployment

- Build the release WASM, record its hash and deployment identity, and verify the configured network/account before deployment or invocation.
- Record account key custody, sponsor budget, storage headroom, public contract identifier and supported methods. Keep owner/full-access secrets outside application configuration.
- Use existing authorized testnet accounts/faucet funds within task authority. If deployment or account access is unavailable, finish local evidence and record the live blocker; do not claim a completed live release.
- Acceptance: deployed artifact matches the recorded build and contract reads match the intended configuration. Mainnet endpoints are rejected by the required live command.

### P09-04 — Record a complete live journey

- Run the three-owner workflow with actual NEAR AI gateway inference, owner-wallet approvals, scoped agent mandates and native testnet reserves.
- Demonstrate a useful live model proposal or objection. Record a real unsupported-claim hold/correction flow; if the model misses the claim, show deterministic protection and label the agent outcome truthfully, then obtain a genuine useful live result before closing the required evidence.
- Record final transfer receipts, per-owner entitlements, exact conserved totals, duplicate-action rejection and revoked-authority rejection. Keep failure/unknown-transfer fault injection in sandbox unless safely reproducible on controlled testnet accounts.
- Acceptance: actual model evidence and complete testnet receipts refer to the recorded release version. Simulation cannot substitute for either.

### P09-05 — Produce honest operating and demo materials

- Document source data provenance, supported recording-only scope, hosted-agent trust, unaudited contract/deployment-key trust, unknown-callback liveness, cancellation hold risk and private-file retention.
- Prepare a concise demo script/video showing action to visible result, including why NEAR matters: owner rights, bounded agent authority, funded obligations and final receipts.
- Describe implemented versus deferred integrations. Keep Intents preview, verified inference and Spotify metadata claims consistent with Phase 10 evidence.
- Prepare repository/license/submission-readiness notes against the supplied overview without publishing or sending. If a license choice is unresolved, record it instead of asserting one has been granted.
- Acceptance: README does not promise automatic streaming royalties, legal certification, audited safety or full decentralization.

## Verification and evidence

Run `npm ci`, `npm run verify:release` and the separately configured `npm run test:live`. Record exact underlying commands and suite counts; live checks must explicitly report unsupported/missing configuration rather than silently skipping.

Targets: README, deployment/operations docs, reproducible fixture scripts, sanitized demo artifacts, updated matrix/master, `plans/evidence/PHASE_09.md`. Store a release manifest with code revision/source digest, lockfile hash, WASM hash, network/account, test summary and evidence locations. No keys, cookies, private documents or contact/submission payloads belong in it.

## Exit

All P0 features pass at the released revision; a fresh environment reproduces the local journey; the complete live testnet/inference evidence exists; financial/privacy blockers are resolved; limitations and deferred features are explicit. Only then mark the required implementation verified. External publication/submission remains a separate state and is never inferred from implementation completion.
