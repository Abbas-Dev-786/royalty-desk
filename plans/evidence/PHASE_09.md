# Phase 09 Evidence - Release Verification and Implementation Handoff

## Identity

- Status: in_progress
- Source revision: working tree; no commit identifier is available.
- Environment: Windows PowerShell, Node/npm workspace, Docker Desktop Linux containers for user-reported contract checks.
- Network: NEAR testnet. No deployment transaction or live payout receipt has been recorded in this repository yet.
- Release artifact manifest: `plans/evidence/artifacts/release-manifest.json`.

## Implemented release tooling

- `README.md`: fresh setup, Docker/Windows requirements, environment configuration, startup, verification, security, and scope limitations.
- `scripts/verify-release.mjs`: ordered offline release aggregator covering check, build, contract, domain, server, agents, recovery, browser, sandbox, and fault-injection suites. It writes a sanitized JSON report under `plans/evidence/artifacts/`.
- `scripts/release-manifest.mjs`: records testnet identity, WASM size/checksum, supported methods, and an explicit not-deployment-proof status.
- `plans/ACCEPTANCE_MATRIX.md`: concrete implementation/test/evidence links for F-01 through F-11.

## Verification

| Case | Command or evidence | Actual result |
| --- | --- | --- |
| Build | `npm run build` | Pass, including Docker contract build in the configured user environment |
| Contract authority/settlement | `npm run test:sandbox` | Pass; all reported checks passed, including mandate, funding, callbacks, revocation, and retry |
| Fault recovery | `npm run test:fault-injection` | Pass; interrupted callback, pending entitlement, and replay protection passed |
| Live inference | `npm run test:live` | Pass; `z-ai/glm-5.3-flash`, `needs_human`, 32 input tokens, 179 output tokens |
| Offline release aggregator | `npm run verify:release` | Pass; `check`, build, domain, contract, server, agents, recovery, E2E, sandbox, and fault-injection all passed. Report: `plans/evidence/artifacts/release-suite.json`. |
| Testnet deployment/receipts | Operator deployment and three-owner journey | Outstanding; no deployment hash or payout receipts are claimed here |

## Remaining handoff work

1. Run `npm ci` from a fresh checkout and then `npm run verify:release`.
2. Run `npm run release:manifest` after the final WASM build and record the deployed contract ID/hash separately once an authorized operator deploys it.
3. Execute the complete three-owner testnet journey with wallet approvals, scoped mandates, reserve funding, finalization, payout receipts, duplicate rejection, and revoked-authority rejection.
4. Attach sanitized receipt/ledger artifacts and update this file to `verified` only after those live checks pass.

No wallet keys, API keys, cookies, private statements, or populated databases belong in this evidence record.
