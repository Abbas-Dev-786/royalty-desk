# V2 phase evidence template

Create `evidence/PHASE_NN.md` when execution starts. A plan, source citation, mocked result or old-prototype pass is not implementation evidence.

## Run identity

- Phase and task IDs:
- Status: in_progress / blocked / verified
- Date, source revision or digest, dirty files:
- OS, Node/Rust/contract toolchain, locked dependency versions:
- Environment: unit / sandbox / browser / live testnet / live NEAR AI / live audio provider
- Network, contract account, WASM hash, policy version, media provider/model and license record:

## Implemented changes

| Task ID | Paths | Behavior and trust boundary | Open gap |
| --- | --- | --- | --- |

## Verification

| Case ID | Exact command or browser/chain steps | Expected | Actual | Result/count | Sanitized artifact |
| --- | --- | --- | --- | --- | --- |

Record a negative case for every protected boundary. Include starting/ending state and expected arithmetic where money is involved. Report skipped cases as skipped or blocked, never pass.

## External proof

- Model: provider/model, live vs fixture, request ID, input/output digest, cost/usage and useful contribution.
- Audio: provider/model, license evidence, generation ID, asset hash, codec/duration, storage location class and playback observation.
- Chain: signer, network, transaction hash, final transaction and child receipt status, contract state before/after.
- Finance: order/tip ID, gross, fee, refundable, allocated, paid and owed in atomic units; independently computed expectation.
- Browser: actor/account, URL, action, screenshot/video path, observed status; do not treat display as payment proof.

## Failures and handoff

- Failed checks, root cause, fix and rerun reference:
- Pending/unknown operations to reconcile:
- Remaining blockers and independent tasks:
- Exit criteria, each linked to a case/artifact:
- Master progress row and next eligible task:

Remove keys, cookies, private prompts, raw customer data and paid-provider secrets from committed artifacts.
