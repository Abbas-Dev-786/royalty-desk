# Agent-run studio: operation and test guide

## Roles

The lyricist, composer, reviewer, and producer use distinct NEAR testnet accounts. Their worker keys are restricted to one contract method each. The producer creates the on-chain release commitment and publishes it after the credited agents accept the exact split. A separate worker loop allocates finalized listener purchases and tips using the immutable contract split, then each credited agent's own restricted key requests its payout. The contract sends money only to the recorded recipient.

`sickhat6192.testnet` is the intended **sole guardian** for the current testnet setup. It can change policy, require human release approval, pause the studio, revoke or renew an agent, unpublish a release, refund an unallocated purchase, and trigger a payout to its fixed recorded recipient. It cannot create or publish a release or change a recorded split. One wallet does not provide multisignature protection. A future 2-of-3 process requires two additional distinct wallets and a separate contract upgrade.

The contract account initially holds the old administrator authority. A one-time handover transfers that authority to the guardian after the new contract is deployed. The existing SQLite `studios.admin_account_id` remains the original studio account because it identifies the owner of the existing media rights record; guest reservations find the studio by contract account, not by guardian.

Contract upgrades remain controlled by the separate full-access contract-account key in ignored private storage on this machine. The running worker does not load that key; it uses method-scoped agent keys. With only one personal wallet, the deployment authority is not multisignature. Back up the contract-account key offline and restrict access to its local copy; upgrading requires that local key.

## Release lifecycle

1. A testnet visitor signs in at `/studio/create`, enters a title and brief, and starts a song. A wallet can create multiple songs, each with its own project, run, and recording. Per-project budgets limit individual requests; the sponsor should monitor total provider credits because any testnet wallet may participate.
2. Live NEAR AI agents write, revise, review, negotiate, and accept a split. Each completed reply is saved independently and appears on the guest page within a few seconds while the run continues. An uncertain inference outcome remains paused; do not repeat a paid request without checking provider usage.
3. The visitor requests the 20-second recording. ElevenLabs creates the media once; a saved recording is reused on retries. The worker checks media hashes, saved reviewer acceptance, generation provenance, and the existing provider permission record. The automated media review records `humanListeningConfirmed: false`.
4. The producer's `create_release` key commits the accepted version. The credited agents' `accept_split` keys accept the exact on-chain split. In autonomous mode, the producer's `publish_release` key publishes it. In human-review mode, the release waits for the guardian's exact on-chain approval and then the producer publishes it.
5. The song appears in `/studio`, with free playback, purchase, tip, and the public collaboration record. Purchases and tips are testnet NEAR transactions. Once the browser order is finalized, the revenue loop validates the on-chain payment and calls permissionless `allocate_payment`; the contract computes integer shares. Each agent with owed funds requests a payout to its own account. A pending or unknown operation stays journaled and is reconciled before a new transfer is attempted.

## Setup and activation

These commands are read-only or dry runs unless `--execute` is supplied. Run from the repository root. No model or music generation is involved.

1. `npm run verify:studio` and record the result.
2. `npm run bootstrap:studio-testnet -- --execute --upgrade` upgrades the deployed studio WASM. Review the built WASM hash and existing deployment manifest first. The script checks the currently deployed hash against its recorded predecessor and verifies the new hash after the transaction.
3. `npm run bootstrap:studio-producer-create-key -- --execute` adds the producer's create-only key.
4. `npm run bootstrap:studio-revenue-keys -- --execute` adds allocation and self-payout keys for producer, lyricist, composer, and reviewer. Secret keys stay in ignored `private/studio-v2/testnet` files.
5. `npm run handover:studio-guardian -- --guardian-id=sickhat6192.testnet --execute` transfers the old contract-account authority once. Verify `get_guardian` returns that account and confirm the old contract account cannot set policy or create releases.
6. Set `STUDIO_AUTONOMOUS_REVENUE=true` in the ignored local `.env` only after the new contract and scoped keys are verified. Restart the worker. Do not place credentials in committed env files. Use `npm run inspect:studio-revenue` for local journal counts and `npm run audit:studio-revenue` for read-only chain validation.

## Manual browser checks

1. As an ordinary testnet wallet, open `/studio/create`, generate a song within the available credit cap, inspect each agent's output, and confirm its exact hashes are shown. If this wallet already has a paused reservation, use another eligible wallet or resolve that reservation after inspecting provider usage.
2. Request music once. If generation succeeds, refresh rather than request new music. Confirm the saved recording plays. In autonomous mode, confirm the song eventually appears in `/studio` and its public collaboration page lists the agents and accepted split. In human-review mode, confirm it remains unpublished until guardian approval.
3. As `sickhat6192.testnet`, open `/studio/operations`. Confirm policy epoch, agent balances, works, and agent interactions are visible. Toggle human approval and pause one at a time. Check the wallet receiver, attached one yoctoNEAR, resulting policy epoch, and local sync. Resume the studio.
   The agent earnings section also shows each agent's on-chain expiry and remaining action budget. Use **Renew** to extend an active agent by 30 days and raise its lifetime action ceiling to 1,000. The guardian wallet must approve a one-yoctoNEAR `renew_agent` call; the receipt confirmation updates the local expiry. A revoked agent cannot be renewed. Run `npm run check:studio-agent-readiness` afterward and confirm the target is absent from `renewalDue`.
4. In human-review mode, approve the exact pending release. The producer must then publish it. The guardian wallet must fail if it directly calls `create_release` or `publish_release`.
5. Buy a song or tip it using a different listener wallet. Confirm its browser order and chain receipt, then wait for the 30-second revenue loop. Inspect `get_payment` for full allocation and `get_earnings`/`get_payout` for creator transfers. A guardian may trigger recovery only to the already recorded creator account.
6. Unpublish a release as guardian with a reason. Confirm the catalogue and media routes stop serving it. Before allocation, the buyer can request a refund for an unavailable release. An allocated payment cannot be refunded by this path.
7. Repeat policy and takedown actions with an unrelated wallet; both must be rejected. Do not treat a local journal row or submitted transaction hash as proof of a completed payout; inspect the final chain status and callback.

## Evidence status

On 2026-11-13, `npm run verify:studio` passed. The public testnet contract `studio-rd-fa315759.testnet` was upgraded first to WASM SHA-256 `4d5501c8158caae1a57707902991c1319513a24dac74d3334c49a31a49977f95`, then to the renewal-enabled build `83e144c945edc3bc13b74a2e0d8811b8f698a40cd40abb7d79c372e08df9a37f`. The post-upgrade `npm run audit:studio-upgrade` passed with all three historical works and six acceptances intact. The producer create key and five revenue keys were installed and scoped to one method each. Guardian handover transaction `3bQ9wdi9XHZncQHEhrxuRq4AvanzGRnxZzb7DkNzoRAv` changed `get_guardian` to `sickhat6192.testnet`. The worker processed two existing finalized browser orders; `npm run audit:studio-revenue` confirmed both fully allocated on-chain and two paid creator payouts. Guardian-signed producer, lyricist, and composer renewals are verified on-chain. `npm run check:studio-agent-readiness` now reports `ready: true`, `renewalDue: []`, all four agents active, and all nine scoped keys active. The web app was moved from a development server caught in a reload loop to a stable production server on port 3000; `/studio/operations` returns HTTP 200. Remaining browser checks and a new paid guest music run are manual evidence; do not mark them passed without performing them.
