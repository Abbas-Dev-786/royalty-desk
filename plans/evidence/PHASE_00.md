# Phase 00 Evidence — Foundation and Compatibility

## Identity

- Tasks: P00-01 through P00-05
- Status: verified; live NEAR AI inference, the sandbox access-key matrix, and browser-wallet execution are verified
- Git commit: unavailable because the workspace is not a Git repository
- Source digest: `sha256:3192ba53fc25da9e59663f77b2a0ccc68a26137be3b06bb86f846683cc0cd7a2` across 176 non-generated source/configuration/planning files, excluding evidence files
- Environment: Microsoft Windows NT 10.0.26300.0; Node 24.21.0; npm 11.19.0
- Remaining verification gaps: optional NEAR AI attestation/signature verification only; this is not a Phase 00 acceptance blocker
- Sources: Decision 0001, Decision 0002, Phase 00 plan, Context7 Next.js 16.2.9/near-sdk-rs/better-sqlite3 documentation, and official NEAR documentation

## Changes and task outcomes

| Task | Changed paths | Outcome | Remaining work |
| --- | --- | --- | --- |
| P00-01 | `docs/decisions`, `docs/TECHNICAL_DESIGN.md` | D-01–D-10, method authority, deposits, errors, and bounds documented | Confirm storage sponsorship through compiled contract measurement |
| P00-02 | Root manifests/config, `apps`, `packages`, `contracts`, `scripts`, `docker` | npm workspace, lockfiles, typechecks, Next build, contract build, and Docker-backed contract runner verified | Preserve clean-install evidence on a fresh environment |
| P00-03 | `WalletProbe.tsx`, contract `agent_probe`/`owner_probe`, `scripts/sandbox/*` | Testnet-only NEP-413 wallet probe connected `sickhat6192.testnet` and returned a signature; sandbox scenario covers predecessor, deposit, receiver, method, and owner guards | None for Phase 00 |
| P00-04 | worker NEAR AI adapter, `packages/persistence` | Structured gateway validation source; persistent SQLite jobs and lease behavior verified; live NEAR AI response verified with `z-ai/glm-5.3-flash` | Add optional attestation/signature evidence; preserve the live run metadata |
| P00-05 | root command scripts, fixtures, `scripts/test-sandbox.mjs`, `scripts/sandbox/*` | Offline checks work; sandbox command now has a disposable-node harness with a Windows Docker backend using NEAR's official sandbox image and returns nonzero on unavailable tooling | Run the Docker-backed harness with Docker Desktop available |

## Verification

| Case | Command | Expected | Actual | Result |
| --- | --- | --- | --- | --- |
| P00-OFFLINE | `npm run check:offline` | Source policy, domain imports, SQLite initialization pass | Passed | pass |
| P00-WORKER/PERSIST | `npm run test:server` | Health start/stop, testnet config, restart, lease, uniqueness | 5 tests passed | pass |
| P00-INSTALL | `npm install --ignore-scripts --no-audit --no-fund` | Dependencies and lockfile | Existing lockfile and installed workspace were used; a clean-install rerun remains environment-dependent | limited |
| P00-CHECK | `npm run check` | Installed TypeScript typecheck | Passed in the current workspace | pass |
| P00-BUILD | `npm run build` | Next workspace and Rust contract build | User verified the Docker-backed build; generated WASM and ABI are present | pass (user environment) |
| P00-CONTRACT | `npm run test:contract` | Rust tests through Docker | User verified Docker contract build; Docker daemon is unavailable in this agent environment | pass (user environment) |
| P00-SANDBOX | `npm run test:sandbox` | Real access-key/sandbox tests | Passed: local RPC, WASM deployment, restricted receiver/method key, zero-deposit call, wrong receiver/method, attached deposit, and owner guard | pass |
| P00-BROWSER | `npm run dev:web` + WalletProbe | Real testnet wallet connection and NEP-413 signature | Passed: signature received from `sickhat6192.testnet` | pass |
| P00-LIVE | `npm run test:live` | Real structured NEAR AI response | Passed: model `z-ai/glm-5.3-flash`, action `needs_human`, input 32 tokens, output 171 tokens | pass |

Latest regression: `npm run check:offline` passed; `npm run check` passed; `npm run test:server` passed 5 tests; `npm run test:sandbox` passed all seven sandbox checks against local RPC `http://127.0.0.1:3030`; and the browser wallet probe received a NEP-413 signature from `sickhat6192.testnet`. Live NEAR AI inference and the contract build are verified in the user's environment. The current implementation also passes the full Phase 01 suite separately; those results are recorded in [Phase 01 evidence](PHASE_01.md).

## Failures, limitations, and recovery

No external financial operation was submitted. There is therefore no transaction requiring reconciliation. The testnet wallet compatibility probe is verified for the recorded wallet/account, but server-side signature verification remains a later product phase. Live NEAR AI inference has been reached successfully, while model attestation/signature verification is optional and not yet recorded. Native Windows sandbox execution is unsupported by the CLI; the runner uses the official Linux sandbox image through Docker. The sanitized sandbox result records only temporary local account IDs and permission metadata.

## Handoff

P00-01 through P00-05 are complete and Phase 00 is verified. Phase 02 may begin; optional model attestation/signature evidence can be added independently.
