# Phase 04 evidence — verified

Date: 2026-11-12. Source: dirty working tree; current build artifact `contracts/studio/target/near/studio_contract.wasm`, SHA-256 `2b13363226f8b8cff1ea51acb9268ebfd2642d2d0285e164be48a64544e2cf77`. Network: local NEAR sandbox and live testnet. Live contract: `studio-rd-fa315759.testnet`; initial deployment `Ea9xEX6r6dc7KfSdQ4kC3UhneTJLCEQgvqS2BBqLaV9F`; initialization `5JZwhFXHnhL9wF22qMR6yeRQBFFwspFdh3eDpZ9PWZvm`; compatible code upgrade `6o8ym819RtVxVihDBVw93kL1YfwTsGxzuMJx4an4eftQ` from hash `8dd50cf90d5be027cd64c5482cd65cdd348a9ee695ff46b47accc6db2b570424`.

## Implemented

| Task | Behavior |
| --- | --- |
| V2-04-01 | Isolated Rust studio contract with bounded versioned release commitments, event logs, state caps and storage reserve checks. |
| V2-04-02 | Distinct registered agent accounts; role, expiry, action budget, pause and revocation enforced in contract. Separate method-scoped function-call keys in sandbox and live journey. |
| V2-04-03 | Human mode requires exact-version admin approval plus every split participant's acceptance; autonomous mode allows a producer to publish only after split acceptance. |
| V2-04-04 | Sequential immutable commitments; previous version becomes unavailable for new sales when a revision publishes; historic payment records retain the original commitment. |
| V2-04-05 | [Source review](../../docs/STUDIO_CONTRACT_AUDIT.md), schema/upgrade notes and negative authority checks. |

## Checks

| Case | Exact check | Actual | Status |
| --- | --- | --- | --- |
| AUTH-01–05 | `npm run test:studio-sandbox` | Passed separate scoped keys, wrong signer/method, stale policy, human and autonomous publish, revision, action budget, revoked/paused, oversize and underfunding cases. | Passed in sandbox |
| AUTH-06 | `npm run test:studio-contract` | 3 Rust unit checks passed, including draft album creation with unpublished songs and rejection at publication. Source review tracks Phase 07 refund/allocation integration. | Passed for reviewed scope |
| Build | `npm run build` | Web, worker, packages and both Rust contracts built. Studio WASM hash above. | Passed |
| Live deployment | `npm run bootstrap:studio-testnet -- --execute` | Faucet created and initialized the named account; local keys are ignored under `private/studio-v2/testnet`. | Passed |
| Live authority | `npm run test:studio-testnet -- --execute` | Passed: separate `lyricist`, `composer`, and `producer` accounts used method-scoped keys. The first song's split acceptances finalized in `GR5kdbbAdAo7SEfxTXfQMVxxCpgcTywuUYtpkKeysuYv` and `HcCv2GMn8Tq6b1NL1j4pcSymMFRrC6gVQkYnsaTmJCL`; admin approval `BScZVXv1XDupeJWixXpjmMyKpqTVW7P8sv6JbRbpw9HA`; producer publication `Yh64uqb94vbJveR89HXVUsbF2rcJamRv6Lrm4BWp7pm`. Album publication `9pdqGWqgD2z9FaPuwdTS5o9PHXco4Hij9x1KSq6NV7vy`. | Passed |
| Complete local gate | `npm run verify:studio` | Passed after adding Rust contract, production HTTP e2e and full server suites to the gate. | Passed |
| Current WASM upgrade | `npm run bootstrap:studio-testnet -- --execute --upgrade` | On-chain code hash matched the recorded previous WASM; upgrade transaction above finalized and the new code hash was read back. The state schema remained v1. | Passed |
| Real draft authority | `npm run commit:studio-catalogue -- --execute` | Six actual Phase 03 versions were created as unpublished commitments; separate lyricist and composer scoped keys accepted each v2 split. A second run read chain state and submitted no duplicate transactions. | Passed |
| Upgrade state preservation | Read-only testnet `get_payment`, `get_escrow_yocto`, `get_release` | Existing album purchase remained `finalized` for `15000000000000000000000` yoctoNEAR, escrow remained `17000000000000000000000`, and real album v2 remained unpublished. | Passed |

The live scoped public keys are `ed25519:7GWeDGdHoYxCtCwJHg6AKSGR4p235dXGBEKNndMjByKq` (`accept_split`), `ed25519:7V8FSJYopZFLWm6mSFfJD9qhSxtF6zydBUBGqLYcynVp` (`accept_split`), and `ed25519:CsoNebn8JmqSMb9JkPfqtGEbxX2uB3wXTZpqjEfyy2ue` (`publish_release`). The private journal records every final transaction hash. The initial live RPC returned 429 during the album flow; the journal resumed on a working documented testnet provider and did not repeat finalized transactions.

No public Phase 03 songs were published by the synthetic contract test or the real draft-commit step. Private key files are excluded from this evidence.
