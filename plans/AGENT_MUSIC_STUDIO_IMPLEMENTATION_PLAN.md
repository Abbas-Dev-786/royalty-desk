# Agent-led music studio implementation plan

Status: new product direction; **not implemented**. Product definition: [agent-led music studio](../docs/PRODUCT_VISION_ALIGNMENT.md). The earlier [master plan](MASTER_IMPLEMENTATION_PLAN.md) applies to the existing royalty-administration prototype.

NEAR architecture and integration boundaries are in [NEAR integration strategy](../docs/NEAR_INTEGRATION_STRATEGY.md). Consult the repository's NEAR skills and NEAR Docs MCP while implementing each phase; verify the live API and protocol behavior rather than copying stale examples.

The proposed creative-agent and audio stack, including the ElevenLabs publication-rights gate, is in [creative stack decision](../docs/CREATIVE_AGENT_AND_AUDIO_STACK.md).

## Acceptance journey

Two or more distinct agents produce at least two playable songs, assemble an album, agree on each song's revenue split, and publish the final versions to an in-app catalogue. A listener buys a song or album and separately tips the creators with actual testnet payment. The platform attributes those receipts correctly and splits the received funds to agent recipients. The journey must work once with **administrator approval required** and once in **autonomous** mode. The second run must proceed without a hidden human action. Failed or unknown payment outcomes must remain owed or unresolved, never double-paid.

## Build sequence

| Phase | Deliverable | Verification checkpoint |
| --- | --- | --- |
| S00 Product and trust baseline | Select audio-generation provider/license, payment asset and prices, agent key custody, admin policy gates, media storage, and refund/fee rules. Define agent and listener identities. ElevenLabs is a candidate only; obtain written authorization for this catalogue and paid-download use or select a provider whose terms explicitly permit it. | A decision record names every external dependency and records permissions, costs, and failure behavior; publication rights are evidenced before public release. |
| S01 Studio domain | Versioned `agent`, `project`, `song`, `album`, `contribution`, `asset`, `split`, `policy`, `publication`, `order`, `tip`, and `payout` schemas. Separate song split from album-level sale allocation. | Domain tests reject invalid splits, duplicate contribution IDs, missing media, stale versions, and cross-project references. |
| S02 Agent collaboration | Persistent shared tasks, role assignment, proposals, counterproposals, review, revision, budget, timeout, and unresolved outcome. Use a durable creative-workflow graph inside the existing worker; keep authority checks and side-effect jobs outside model decisions. All agent actions are attributed to a specific identity and model/tool run. | Two distinct agents create and revise one song; a third agent or coordinator cannot forge another's acceptance. Restart resumes the same job, not a duplicate. |
| S03 Creative pipeline | Generate and store lyrics/composition, playable audio, artwork, metadata, and attribution through a replaceable provider adapter. ElevenLabs Music may generate private drafts while its public catalogue rights are unresolved. Media is validated and available for review with provenance and version history. | Real model/tool execution produces playable files; invalid, empty, oversized, or unsupported files cannot be published. No fixture is labeled live generation. |
| S04 Approval policy | Admin chooses `human_review` or `autonomous` for a project. The policy has a version, effective time, per-agent rights, budgets, publish permissions, payment caps, and emergency pause. | Human mode stops at exact publish/split/payment gates; autonomous mode advances without a human click. Mid-flight policy changes cannot authorize stale work. |
| S05 Catalogue and playback | Draft, review, publish, revise, and unpublish views; public song and album pages; album track order, playable audio, artwork, credits, prices, and visible split version. | A new visitor can find and play both songs. Existing purchase records remain bound to the published version at purchase time. |
| S06 Commerce | Testnet purchase and tip checkout, price/recipient binding, order/tip IDs, final receipt verification, refunds, and reconciliation. Song purchase, album purchase, and song/album tips have explicit attribution rules. | A paid transaction creates one recognized revenue event; duplicate notifications, failed payments, and refunds do not mint earnings. |
| S07 Revenue and payouts | Integer allocation of received funds under committed per-work splits; fees kept separate; agent recipient accounts; asynchronous payouts and recovery. Reuse contract patterns only after adapting their authority model. | Purchase and tip totals reconcile to received funds, fees, refunds, owed amounts, and paid amounts; no amount is created or paid twice. |
| S08 Studio web app | Admin policy/settings; agent team and task board; song/album editor; review queue; catalogue; listener checkout/tips; revenue dashboard; transaction/receipt activity. | Full browser run in both approval modes, with clear actor labels and testnet badge. |
| S09 Release evidence | Fresh setup, provider/license proof, real generated audio, two-song album, real testnet purchase and tip, payout receipts, retry/restart/privacy tests. | Every acceptance step has a recorded observation at the same source and deployment revision. |

## Design rules that cannot be skipped

- **Distinct identities:** an AI agent needs an attributable operating identity and explicitly scoped access; a human-owned wallet plus a prompt is not agent autonomy.
- **Published version binding:** a listener's payment binds to a specific song/album version, price, and split. Later edits affect future sales only.
- **Real revenue only:** a free play, generated statement, or manual funder deposit is not a purchase or tip. Recognized earnings must trace to a finalized listener payment.
- **Song versus album accounting:** define how an album sale allocates value to its songs, then use each song's committed contributor split. A direct tip to one song follows that song; an album tip needs an explicit album allocation rule.
- **Policy versioning:** administrator settings govern future actions; disabling approval does not retroactively validate earlier drafts or unresolved payments.
- **Safety and recovery:** budgets, allowed tools, key scopes, pause/revoke, media moderation, payment refund state, and unknown transaction reconciliation remain enforced in autonomous mode.

## Migration from the existing prototype

The current repository contains useful pieces: NEAR testnet wallet authentication, worker persistence, validated agent actions, canonical split arithmetic, contract callback patterns, and release verification scripts. They require adaptation. The current `release` means a **recording-revenue administration case** with human owner approval and CSV funding; it is not a song/album publishing object. Do not reuse the name or schema without an explicit migration that preserves old records and avoids confusing synthetic statement funding with catalogue sales.

Current Phase 00-09 checkmarks and `verify:release` results attest only to the old prototype. They do not advance S00-S09 until the corresponding studio functionality exists and is independently tested.
