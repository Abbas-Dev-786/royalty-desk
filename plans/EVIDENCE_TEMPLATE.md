# Phase evidence template

Copy this structure into `plans/evidence/PHASE_NN.md` when executing the corresponding phase. Replace placeholders with actual results. Do not pre-fill a pass from a plan or source document.

## Identity

- Phase and task IDs:
- Status: in_progress / blocked / verified
- Code commit; or source digest when no Git repository exists:
- Dirty files or patch digest affecting this run:
- Execution date, OS, runtime/toolchain and locked dependency versions:
- Environment: unit / sandbox / local browser / live testnet
- Network, contract account, WASM hash and deployed configuration identity where applicable:
- Source requirements and decision records:

## Changes and task outcomes

| Task | Changed paths | Behavior implemented | Remaining work |
| --- | --- | --- | --- |
| Replace with task ID | Actual paths | Observed result | None or exact gap |

## Verification

| Case ID | Exact command or reproducible interaction | Expected | Actual | Exit / test count | Evidence path |
| --- | --- | --- | --- | --- | --- |
| Replace with case ID | Include working directory and non-secret configuration | Assertion | Observation | Pass/fail/skipped | Sanitized log or artifact |

Every exit criterion needs a case or explicit artifact. Record negative-path rejection and unchanged balances/state, not just a caught exception. Missing credentials, unavailable network and unsupported tooling are blockers, not successful skips.

## Financial / model evidence when applicable

- Starting and ending ledger snapshots, amount units and independently expected allocations.
- Transaction hash, signer account, network, contract, receipt graph IDs and final outcomes. Transaction submission alone is not completion.
- Per-entitlement attempt IDs and final states; failed/unknown outcomes and the absence of duplicate successful transfers.
- Model/provider identifier, configured mode, request status, sanitized input digest, output action/evidence references, usage if supplied. Record unavailable usage as unknown, never zero by assumption.
- Distinguish live results from deterministic fixtures; do not store chain-of-thought, credentials or private preference text.

## Failures, limitations and recovery

- Failed checks and diagnostic evidence:
- Fix and rerun reference:
- Remaining blocker, required input and independently executable tasks:
- Rollback/recovery behavior tested:
- Trust assumptions or exclusions that affect the claim:

## Handoff

- Exit conditions: each satisfied / unsatisfied with evidence reference.
- Updated master progress row and acceptance-matrix evidence pointers:
- Next eligible phase/task:
- Outstanding external operations requiring reconciliation before another attempt:

Evidence files are summaries of actual work, not authorization to spend, publish or submit. Never include API keys, private keys, session cookies, populated environment files or private source documents.
