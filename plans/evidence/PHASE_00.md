# Phase 00 Evidence — Foundation and Compatibility

## Identity

- Tasks: P00-01 through P00-05
- Status: in progress; live NEAR AI inference and the sandbox access-key matrix are verified, while browser-wallet execution evidence remains unsatisfied
- Git commit: unavailable because the workspace is not a Git repository
- Source digest: `sha256:7cd0f7d5c7b90c090c75d7cc020de967025ad3d52afa481be73fdfbc75fef261` across 176 non-generated source/configuration/planning files, excluding evidence files
- Environment: Microsoft Windows NT 10.0.26300.0; Node 24.21.0; npm 11.19.0
- Remaining verification gaps: browser wallet execution evidence and optional NEAR AI attestation/signature verification
- Sources: Decision 0001, Decision 0002, Phase 00 plan, Context7 Next.js 16.2.9/near-sdk-rs/better-sqlite3 documentation, and official NEAR documentation

## Changes and task outcomes

| Task | Changed paths | Outcome | Remaining work |
| --- | --- | --- | --- |
| P00-01 | `docs/decisions`, `docs/TECHNICAL_DESIGN.md` | D-01–D-10, method authority, deposits, errors, and bounds documented | Confirm storage sponsorship through compiled contract measurement |
| P00-02 | Root manifests/config, `apps`, `packages`, `contracts`, `scripts`, `docker` | npm workspace, lockfiles, typechecks, Next build, contract build, and Docker-backed contract runner verified | Preserve clean-install evidence on a fresh environment |
| P00-03 | `WalletProbe.tsx`, contract `agent_probe`/`owner_probe`, `scripts/sandbox/*` | Testnet-only NEP-413 wallet probe uses the current `connect()` then `wallet.signMessage()` flow; sandbox scenario covers predecessor, deposit, receiver, method, and owner guards | Execute the browser probe |
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
| P00-LIVE | `npm run test:live` | Real structured NEAR AI response | Passed: model `z-ai/glm-5.3-flash`, action `needs_human`, input 32 tokens, output 171 tokens | pass |

Latest regression: `npm run check:offline` passed; `npm run check` passed; `npm run test:server` passed 5 tests; and `npm run test:sandbox` passed all seven sandbox checks against local RPC `http://127.0.0.1:3030`. Live NEAR AI inference and the contract build are verified in the user's environment. Browser-wallet evidence remains outstanding. The current implementation also passes the full Phase 01 suite separately; those results are recorded in [Phase 01 evidence](PHASE_01.md).

## Failures, limitations, and recovery

No external financial operation was submitted. There is therefore no transaction requiring reconciliation. The wallet probe source must not be described as verified wallet compatibility. Live NEAR AI inference has been reached successfully, but attestation/signature verification is not yet recorded. Native Windows sandbox execution is unsupported by the CLI; the runner uses the official Linux sandbox image through Docker. The sanitized sandbox result records only temporary local account IDs and permission metadata.

## Handoff

P00-01, P00-04, P00-05, and the sandbox portion of P00-03 are complete. Before Phase 02, execute the browser wallet probe and decide whether to add attestation/signature evidence for the live model response.
