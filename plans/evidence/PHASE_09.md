# Phase 09 Evidence - Release Verification and Implementation Handoff

## Identity

- Status: in_progress
- Source revision: working tree; no commit identifier is available.
- Environment: Windows PowerShell, Node/npm workspace, Docker Desktop Linux containers for user-reported contract checks.
- Network: NEAR testnet. Initial deployment, current upgrade, and the synthetic CLI payout journey are recorded in `TESTNET_DEPLOYMENT_2026-11-10.md`, `TESTNET_UPGRADE_2026-11-10.md`, and `LIVE_JOURNEY_2026-11-10.md`.
- Release artifact manifest: `plans/evidence/artifacts/release-manifest.json`.

## Implemented release tooling

- `README.md`: fresh setup, Docker/Windows requirements, environment configuration, startup, verification, security, and scope limitations.
- `scripts/verify-release.mjs`: ordered offline release aggregator covering check, build, contract, domain, server, agents, recovery, browser, sandbox, and fault-injection suites. It writes a sanitized JSON report under `plans/evidence/artifacts/`.
- `scripts/release-manifest.mjs`: records testnet identity, WASM size/checksum, supported methods, and verified deployment status when the live deployment evidence matches the artifact.
- `plans/ACCEPTANCE_MATRIX.md`: concrete implementation/test/evidence links for F-01 through F-11.

## Verification

| Case | Command or evidence | Actual result |
| --- | --- | --- |
| Build | `npm run build` | Pass, including Docker contract build in the configured user environment |
| Contract authority/settlement | `npm run test:sandbox` | Pass; all reported checks passed, including mandate, funding, callbacks, revocation, and retry |
| Fault recovery | `npm run test:fault-injection` | Pass; interrupted callback, pending entitlement, and replay protection passed |
| Live inference | `npm run test:live` | Pass; `z-ai/glm-5.3-flash`, `needs_human`, 32 input tokens, 179 output tokens |
| Offline release aggregator | `npm run verify:release` | Pass on 2026-11-10 before the upgrade; all 11 suites passed, including contract regressions. The deployed WASM SHA-256 is `c319324997714c43ba10712a00487cfb125bd5ee7e8d7e49e5154b61604b7a3f`. Report: `plans/evidence/artifacts/release-suite.json`. |
| Testnet deployment | `npm run verify:deployment -- BRHdcjbqqD5GAk9aXkTuNmmiQTRf4JtcVGSY5tFUjPio --upgrade` | Pass; deployed code hash and upgrade receipt match the build artifact. Existing release and settlement state remained readable and unchanged in the sampled views. See `TESTNET_UPGRADE_2026-11-10.md`. |
| Live CLI journey | `npm run test:live-journey -- prepare`, `npm run test:live-agent`, `npm run test:live-journey -- settle` | Pass after the recorded agent job recovery; three owners accepted and approved, restricted agent approved for owner 2, 0.1 NEAR was funded and fully paid. See `LIVE_JOURNEY_2026-11-10.md`. |

## Remaining handoff work

1. Run `npm ci` from a fresh checkout and then `npm run verify:release`.
2. Complete the browser wallet journey and verify its authenticated API and UI paths with three owner accounts. The current live journey used CLI account keys.
3. Record live negative checks for duplicate submissions and revoked authority if Phase 09 requires those in addition to the compiled-WASM sandbox coverage.

No wallet keys, API keys, cookies, private statements, or populated databases belong in this evidence record.
