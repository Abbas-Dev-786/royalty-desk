# Studio contract review (Phases 04–06)

Reviewed contract: `contracts/studio`, schema v1, NEAR SDK 5.30.1. This is a source review and a local sandbox/live testnet exercise, not an external security audit.

## Trust boundaries

| Boundary | Enforcement | Evidence |
| --- | --- | --- |
| Agent identity | NEAR predecessor account, registered role, expiry, action budget, pause and revocation. Separate function-call keys restrict methods and deposit to zero. | `scripts/sandbox/studio-journey.mjs`; live journey uses separate agent accounts. |
| Administrator | Policy, agent registration/revocation, approval, unpublish and refund require the admin signer. Sensitive payable admin methods require exactly one yoctoNEAR. | Contract unit and sandbox tests. |
| Release | Sequential version, bounded IDs/counts, SHA-256 media/metadata/split/track commitments, participant split acceptance, current policy epoch, optional admin approval. | Sandbox human and autonomous flows. |
| Listener funds | Exact purchase price or bounded tip, unique payment ID, published release and matching commitment, quote expiry. Gross is integer yoctoNEAR and held in contract escrow. | Sandbox duplicate, underpayment, stale and unpublished rejection; live testnet journey. |
| Refund | Admin request only while finalized and unallocated. Status becomes pending before transfer; private callback finalizes success or restores finalized status on failure. | Sandbox transfer receipt and live journey. |

## State, storage and upgrades

The contract stores only bounded commitments, authority records, and payment records. It never stores audio or prompts. Before a storage-growing action returns, it flushes lazy collections and verifies that contract balance covers storage plus escrow. Total agents are capped at 32, releases at 500 and payments at 50,000. Album drafts may reference existing unpublished song versions; publication and album payment still require those songs to be published. The admin account's full-access key controls WASM deployment; `migrate` is contract-account-only and accepts schema v1. A future incompatible upgrade must ship a matching migration before deployment. Recovery requires the admin account key and a verified storage backup or an explicit new contract migration; there is no secret recovery endpoint.

Payment, publication, policy and refund events use NEP-297-style `EVENT_JSON` logs with `standard: studio` and `version: 1.0.0`. The server reads final transaction status and contract views, not logs alone, before accepting publication or entitlement.

## Tracked limitations

- Phase 07 must add on-chain allocation/payout state and update the refund gate. Until then, every finalized payment remains marked unallocated and is refundable by the admin. Do not run off-chain creator payouts against this contract version.
- Full song publication also requires an independently checked ElevenLabs permission reference and scope; owner attestation alone is insufficient for the public catalogue gate.
- The admin full-access key is a single upgrade/recovery authority. Mainnet requires a separate treasury and governance review.
- The public app's browser wallet flow and media seeking require owner-run browser evidence. Contract tests do not prove those UI behaviors.
