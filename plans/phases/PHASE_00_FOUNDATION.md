# Phase 00 — Foundation and Compatibility

Status: in progress. Build, live NEAR AI inference, and the sandbox access-key matrix are verified; browser-wallet execution evidence remains. Evidence: [Phase 00](../evidence/PHASE_00.md). Next: [Phase 01](PHASE_01_DOMAIN.md). Control: [master plan](../MASTER_IMPLEMENTATION_PLAN.md).

## Implementation status

| Task | State | Evidence |
| --- | --- | --- |
| P00-01 | Implemented | Decisions 0001 and 0002; technical design linked |
| P00-02 | Partial | Workspace and command contract created; dependency install, lockfile, typecheck, Next build, and Rust build blocked |
| P00-03 | Partial | Sandbox key/permission matrix verified; browser wallet probe still requires a real wallet interaction |
| P00-04 | Implemented and live verified | Server-only gateway adapter, SQLite restart/lease checks, and a real structured NEAR AI response pass |
| P00-05 | Implemented | Offline commands and disposable Docker-backed sandbox harness created; unavailable tooling fails explicitly |

## Outcome and source basis

A reproducible workspace and a documented, tested path for the highest-risk integrations. Sources: [technical design sections 1, 3, 9, 13](../../docs/TECHNICAL_DESIGN.md), [F-01, F-02, F-11](../../docs/FEATURES.md). The repository currently has documents only. This phase establishes compatibility; it does not claim a finished product.

## Entry conditions

Read the product baseline, inspect the actual workspace and any newly added repository instructions, and inventory installed Node/npm, Rust, build target and sandbox support. Preserve existing files. No mainnet account or funds are needed.

## Tasks

### P00-01 — Freeze implementation decisions

- Record master decisions D-01 through D-10 in `docs/decisions/0001-implementation-baseline.md`, including rationale, affected source sections and tests. Resolve limits and the authority table before exposing contract methods.
- Update the technical design for adopted refinements; keep current scope unchanged. Distinguish compatibility questions from settled product requirements.
- Specify the exact allowed caller, deposit policy, input limits and failure code for each planned contract method. Membership acceptance precedes inclusion in a frozen agreement.
- Acceptance: a reviewer can determine the funder, period lifecycle, mandate meaning and transaction-recovery policy without guessing.

### P00-02 — Scaffold and pin the workspace

- Create npm workspace manifests for web, worker, domain, chain and persistence; Rust contract manifest/toolchain; configuration validation; placeholder-only `.env.example`; relevant ignore rules.
- Select compatible package versions from current documentation and actual installation. Pin lockfiles; document Rust build and sandbox runner requirements on the actual host.
- Create the command contract from the master. Unimplemented suites fail clearly instead of returning success. Provide a minimal web page, worker health/start-stop path and independently buildable contract skeleton.
- Acceptance: clean install, type/build checks and executable health checks are reproducible. No browser bundle includes a server secret or signing module.

### P00-03 — Prove wallet and restricted-agent compatibility

- Select the wallet and NEAR client through current docs and a small real integration probe. Specify signed-message authentication if supported; otherwise a domain-bound challenge transaction verified on chain. Do not accept an account name as proof.
- In sandbox, create distinct owner and agent accounts. Add a key restricted to the skeleton contract and explicit test methods. Prove allowed zero-deposit calls work; wrong receiver, disallowed method and attached-deposit calls fail.
- Confirm the contract observes the agent as immediate predecessor. Record where recovery/full-access keys live and ensure the worker never receives them.
- Use a minimal browser wallet-signing probe to establish actual adapter support. A test-wallet mock is insufficient to verify a real browser wallet path.
- Acceptance: selected packages, supported environment, exact method allowlist and sanitized permission results are recorded.

### P00-04 — Verify model access and persistence feasibility

- Implement a minimal server-only NEAR AI gateway adapter with a synthetic request and validated structured response. Record model identifier, endpoint, status and usage when available, without a verification badge.
- Check a writable persistent database/file location and restart behavior for a minimal queued job. Select a SQLite driver compatible with the Node/hosting environment.
- If credentials are absent, finish offline scaffolding and report that live inference remains blocked. A deterministic fixture never passes the live capability check.
- Acceptance: a real minimal gateway request and persistent-process restart are evidenced, or their exact blockers remain visible and the phase stays unverified.

### P00-05 — Establish verification infrastructure

- Add portable wrappers and CI-ready offline commands for unit, sandbox and future browser tests. Ensure missing tests fail and secrets are optional only for offline suites.
- Establish fixtures/evidence directories, configuration schemas and startup checks rejecting mismatched network/contract settings.
- Record public deployment metadata separately from credentials. Any deployment probe uses a distinct test environment, not a hidden mainnet fallback.
- Acceptance: the harness can run a targeted suite, collect sanitized output and distinguish failed, skipped and unimplemented work.

## Verification and artifacts

Targets: root manifests/lockfiles, `apps/*`, `packages/*`, `contracts/royaltydesk`, `scripts/verify-*`, `docs/decisions/0001-implementation-baseline.md`, `plans/evidence/PHASE_00.md`.

Planned commands after scaffolding: `npm ci`, `npm run check`, `npm run build`, and targeted compatibility checks under `npm run test:sandbox` and `npm run test:server`. Document precise wrapper arguments and named probe files when implemented. The final release aggregator remains incomplete until later suites exist.

Evidence must include tool versions, wallet/client selection, the exact Rust/sandbox command, real access-key outcomes, actual gateway result and restart observation. Inspect secrets handling rather than printing environment values.

## Exit and failure handling

All five tasks pass, decisions are recorded, and selected tools have observed compatibility evidence. Missing credentials can block this phase's live check while Phase 01's pure domain work proceeds; they cannot be silently deferred past release verification. Unsupported sandbox tooling requires a verified alternative execution environment before money-contract integration is considered verified.

Do not expand into Intents, production hosting, UI styling or agent negotiation here. Retain failed probe evidence and replace only disposable local/sandbox artifacts when rerunning.
