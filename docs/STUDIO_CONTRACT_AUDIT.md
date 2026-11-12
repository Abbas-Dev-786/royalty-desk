# Studio contract review (Phases 04–09)

Reviewed contract: `contracts/studio`, schema v2, NEAR SDK 5.30.1, WASM SHA-256 `465a80e486433e2e6996f3fdd036c5ec091754af6b5e935eaee2991194192c07`. This is a source review and local sandbox/live testnet exercise, not an external security audit. Read-only split-acceptance and release-approval views were added so ambiguous agent transactions can be reconciled without repeating a signature.

## Trust boundaries

| Boundary | Enforcement | Evidence |
| --- | --- | --- |
| Agent identity | NEAR predecessor account, registered role, expiry, action budget, pause and revocation. Separate function-call keys restrict methods and deposit to zero. | `scripts/sandbox/studio-journey.mjs`; live journey uses separate agent accounts. |
| Administrator | Policy, agent registration/revocation, approval, unpublish and refund require the admin signer. Sensitive payable admin methods require exactly one yoctoNEAR. | Contract unit and sandbox tests. |
| Release | Sequential version, bounded IDs/counts, SHA-256 media/metadata/split/track commitments, participant split acceptance, current policy epoch, optional admin approval. | Sandbox human and autonomous flows. |
| Listener funds | Exact purchase price or bounded tip, unique payment ID, published release and matching commitment, quote expiry. Gross is integer yoctoNEAR and held in contract escrow. | Sandbox duplicate, underpayment, stale and unpublished rejection; live testnet journey. |
| Refund | Admin request only while finalized and unallocated. Status becomes pending before transfer; private callback finalizes success or restores finalized status on failure. | Sandbox transfer receipt and live journey. |
| Allocation | Admin only. Exactly one allocation per finalized payment; song or ordered album track weights are applied to immutable contributor accounts with integer dust assigned to the final share. Allocated payments cannot be refunded. | Contract unit test, sandbox, and live ledger audit. |
| Payout | Human-review mode requires admin signer; autonomous mode allows the owed recipient to request their own payout. Recipient and amount are computed on-chain, capped at 0.1 NEAR per request. Owed moves to pending before transfer; private callback records paid or restores owed after failed transfer. | Sandbox success/failure, live two-agent transfers and final receipt audit. |

## State, storage and upgrades

The contract stores bounded commitments, authority, payment, allocation and payout records; no audio or prompts. Storage-growing paths flush lazy collections and check account balance against retained escrow plus storage. Totals are capped at 32 agents, 500 releases, 50,000 payments and 50,000 payout IDs. Album drafts may reference existing unpublished songs; publication and album payment require published children. The admin's full-access key controls upgrades. The contract-account-only `migrate` converted schema v1 to v2 on testnet without changing existing releases, payments or escrow; unit tests cover the legacy state shape. An incompatible future upgrade needs a new migration.

Payment, publication, policy and refund events use NEP-297-style `EVENT_JSON` logs with `standard: studio` and `version: 1.0.0`. The server reads final transaction status and contract views, not logs alone, before accepting publication or entitlement.

## Tracked limitations

- No on-chain platform fee is configured, so the current fee is zero and all finalized gross proceeds are allocated to creators. Any fee introduction requires a new versioned policy and accounting tests.
- If a payout callback itself fails or its outcome is unknown, the payout remains pending and cannot be resent automatically. A documented receipt-based recovery mechanism and fault injection for this case are still required before marking Phase 07 fully verified.
- The project owner confirmed private permission for the published testnet catalogue. The underlying agreement was not inspected in this workspace.
- The admin full-access key is a single upgrade/recovery authority. Mainnet requires a separate treasury and governance review.
- The public app's browser wallet flow and media seeking require owner-run browser evidence. Contract tests do not prove those UI behaviors.
