# Phase 00 Evidence — Foundation and Compatibility

## Identity

- Tasks: P00-01 through P00-05
- Status: in progress; live NEAR AI inference is verified, while wallet and sandbox gates remain unsatisfied
- Git commit: unavailable because the workspace is not a Git repository
- Source digest: `sha256:786932fb560e924373a22bbe2e3dc5868b236aa4e5eec7538f613a1d645e803e` across 90 implementation/configuration files, excluding generated outputs and evidence files
- Environment: Microsoft Windows NT 10.0.26300.0; Node 24.21.0; npm 11.19.0
- Remaining verification gaps: sandbox suite/access-key matrix, browser wallet execution evidence, and optional NEAR AI attestation/signature verification
- Sources: Decision 0001, Decision 0002, Phase 00 plan, Context7 Next.js 16.2.9/near-sdk-rs/better-sqlite3 documentation, and official NEAR documentation

## Changes and task outcomes

| Task | Changed paths | Outcome | Remaining work |
| --- | --- | --- | --- |
| P00-01 | `docs/decisions`, `docs/TECHNICAL_DESIGN.md` | D-01–D-10, method authority, deposits, errors, and bounds documented | Confirm storage sponsorship through compiled contract measurement |
| P00-02 | Root manifests/config, `apps`, `packages`, `contracts`, `scripts`, `docker` | npm workspace, lockfiles, typechecks, Next build, contract build, and Docker-backed contract runner verified | Preserve clean-install evidence on a fresh environment |
| P00-03 | `WalletProbe.tsx`, contract `agent_probe`/`owner_probe` | Testnet-only NEP-413 wallet probe now uses the current `connect()` then `wallet.signMessage()` flow; predecessor/deposit probe source exists | Real browser wallet and sandbox function-call key checks |
| P00-04 | worker NEAR AI adapter, `packages/persistence` | Structured gateway validation source; persistent SQLite jobs and lease behavior verified; live NEAR AI response verified with `z-ai/glm-5.3-flash` | Add optional attestation/signature evidence; preserve the live run metadata |
| P00-05 | root command scripts and fixtures | Offline checks work; missing suites/dependencies return nonzero | Implement sandbox suite once toolchain exists |

## Verification

| Case | Command | Expected | Actual | Result |
| --- | --- | --- | --- | --- |
| P00-OFFLINE | `npm run check:offline` | Source policy, domain imports, SQLite initialization pass | Passed | pass |
| P00-WORKER/PERSIST | `npm run test:server` | Health start/stop, testnet config, restart, lease, uniqueness | 5 tests passed | pass |
| P00-INSTALL | `npm install --ignore-scripts --no-audit --no-fund` | Dependencies and lockfile | No response for approximately 50 seconds; stopped; no `node_modules` or lockfile created | blocked |
| P00-CHECK | `npm run check` | Installed TypeScript typecheck | Failed immediately with dependency-install requirement | blocked as designed |
| P00-BUILD | `npm run build` | Next workspace and Rust contract build | Failed immediately because dependencies are absent | blocked as designed |
| P00-CONTRACT | `npm run test:contract` | Rust tests through Docker | Wrapper reached the Docker availability check; Docker daemon unavailable | blocked |
| P00-SANDBOX | `npm run test:sandbox` | Real access-key/sandbox tests | Explicit `not implemented` nonzero result | blocked |
| P00-LIVE | `npm run test:live` | Real structured NEAR AI response | Passed: model `z-ai/glm-5.3-flash`, action `needs_human`, input 32 tokens, output 171 tokens | pass |

Latest offline regression: `npm run check:offline` passed; `npm run test:server` passed 5 tests. Live NEAR AI inference is now verified. `npm run test:contract` delegates to Docker; sandbox and browser-wallet evidence remain outstanding. The current implementation also passes the full Phase 01 suite separately; those results are recorded in [Phase 01 evidence](PHASE_01.md).

## Failures, limitations, and recovery

No external financial operation was submitted. There is therefore no transaction requiring reconciliation. The wallet probe source must not be described as verified wallet compatibility. Live NEAR AI inference has been reached successfully, but attestation/signature verification is not yet recorded. Sandbox access-key tests and browser wallet execution remain outstanding.

## Handoff

P00-01 is complete. P00-04 live inference is now verified. Before Phase 02, run a real sandbox access-key matrix, execute the browser wallet probe, and decide whether to add attestation/signature evidence for the live model response.
