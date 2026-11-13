# Decision 0003: studio v2 baseline

Status: selected baseline for the hackathon testnet implementation; audio-provider choice superseded by [decision 0004](0004-stability-audio.md). Date: 2026-11-11. Applies to `plan-v2`, not the legacy royalty-administration product.

## Product and actor boundaries

The studio starts with an administrator, at least two separately identified agents, and listener wallets. Human review and autonomous mode are versioned project policies. Creative agents can propose, revise and accept their own work and split; no coordinator can forge another agent's consent. A published song or album version binds its media, metadata, price and split. Only a finalized listener purchase or tip funds revenue.

## Initial economic defaults for testnet

- Asset: native testnet NEAR. Store and allocate integer yoctoNEAR. Mainnet spending is outside this decision.
- Song price: 0.01 NEAR; album price: 0.015 NEAR; tip range: 0.001–1 NEAR. These are v2 testnet defaults selected for implementation; the final checkout quote binds price/version. An administrator may set future prices within contract-defined limits.
- Platform fee: zero for the first release. Gas and storage are funded separately and never deducted from a creator's received purchase by implication.
- Album sale and album tip allocation: track weights total 10,000 basis points, default equal weights using deterministic remainder by song ID. Each song's agent split then divides its allocated proceeds. A direct song tip follows only that song's split.
- Refunds: a successful on-chain purchase or tip is final in the first release, except an administrator-directed correction that is explicitly tracked and backed from a separate reserve. A refund feature must not silently reverse a completed agent transfer. This policy must be visible at checkout and reviewed before live deployment.
- Example: 0.015 NEAR album sale with two tracks weighted 60/40 allocates 0.009 and 0.006 NEAR. If the first song's agents split 60/40, its proceeds are 0.0054 and 0.0036 NEAR. All parts sum to 0.015 NEAR. A 0.001 NEAR tip to that song yields 0.0006 and 0.0004 NEAR. No float is used in implementation.

## Custody and infrastructure

The administrator creates or registers each agent's NEAR account and retains recovery authority outside the worker. The worker uses only method-scoped function-call keys for zero-deposit studio actions. Contract policy, not key gas allowance, caps financial actions. Agent recipients are committed account IDs, not editable payout fields. Keys live outside the repository. The studio uses a dedicated testnet contract account configured by `NEXT_PUBLIC_STUDIO_CONTRACT_ID`. The administrator retains upgrade/recovery authority outside the worker; upgrades require a pause, storage migration test and new WASM hash record. The web/worker/SQLite deployment starts on one persistent host. The first media provider is `StudioMediaStore`, a content-addressed local directory on a persistent volume outside the web public directory; the API controls access. Back up the closed/checkpointed SQLite file and media directory together to a separate durable volume and verify hash-based restore. Paths are configured by `STUDIO_MEDIA_PATH` and `STUDIO_BACKUP_PATH`.

## Music and inference

NEAR AI Cloud supplies role reasoning. LangGraph.js is proposed for resumable collaboration but has not been installed. ElevenLabs Music is the selected audio provider. Authorization reference for Phase 00: the project owner's 2026-11-11 statement in this session that ElevenLabs gave written permission for all proposed hackathon uses on testnet, including catalogue publication and purchase/tip/download paths. This records the owner's authorization claim; the permission document itself, holder, model and plan, attribution, term and territory have not been inspected by this repository. Before actual public publishing, Phase 03 must record the permission details and execute a live licensed compose call. [Published Music Terms](https://elevenlabs.io/music-terms) otherwise restrict music libraries. The audio provider API key is server-only and is not yet configured here.

## Open gates

1. Phase 03: record the permission details privately and verify the configured ElevenLabs key with a live compose call before public publishing.
2. Phase 10: run a deployed-volume backup/restore drill; local copy/restore and corruption checks already pass.
3. Phases 04–08: deploy and verify the separate studio contract, wallet transactions, prices and refund rule against the implementation before real listener payments.
