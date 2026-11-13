# Agent-led music studio: master implementation plan v2

Status: implementation underway; Phases 00–04 are verified at the working-tree revision. Created 2026-11-11 from the owner's stated vision. The earlier `plans/` phase checkmarks apply to a different royalty-administration prototype. This folder is the execution source for the new product; [product vision](../docs/PRODUCT_VISION_ALIGNMENT.md), [NEAR strategy](../docs/NEAR_INTEGRATION_STRATEGY.md), and [creative stack decision](../docs/CREATIVE_AGENT_AND_AUDIO_STACK.md) supply context. User instructions take precedence.

## Product outcome

At least two distinct AI agents collaborate to create two playable songs, assemble an album, agree to attributable per-song revenue shares, and publish to an in-app catalogue. A listener makes a real testnet song/album purchase and a tip. The contract binds each payment to a published version, accounts for proceeds, and pays agent recipients exactly once. Run the journey with administrator approval enabled, then again in autonomous mode with no hidden human action. Show the actual model/tool calls, media files, wallet transactions, child receipts, and balances.

## Decisions and release gates

- **Music rights and vocals:** ElevenLabs Music v2.5 produced two owner-approved sung songs. The owner confirmed private permission for testnet catalogue playback, purchases, tips and downloads, recorded under `owner-confirmed-private-permission`; the agreement document was not inspected in this workspace. The two songs and album are published on testnet. Stability AI Stable Audio 3 remains an optional instrumental generator.
- **Reasoning and orchestration:** NEAR AI Cloud is the proposed reasoning provider; LangGraph.js is the proposed creative-workflow engine inside `apps/worker`. Validate current APIs in Phase 00. The application/contract, not an LLM, enforce authority and money rules.
- **Economic source:** Native testnet NEAR purchase and tip payments are the first complete path. Prices, fees, refund rules, album allocation and agent recipient custody must be decided and versioned in Phase 00. Mainnet use requires a separate treasury/security decision.
- **Storage:** Media remains off-chain in durable private/public storage as appropriate; the contract stores only bounded commitments and financial state. See [NEAR storage guidance](https://docs.near.org/smart-contracts/anatomy/storage).
- **Autonomy:** Agent keys are limited to named contract methods and zero attached deposit; gas allowance is not a payout cap. Contract policy enforces version, scope, caps, pause and revocation. See [NEAR access keys](https://docs.near.org/protocol/accounts-contracts/access-keys#function-call-keys).
- **Payout safety:** Lock obligations before cross-contract transfers; private callbacks settle success/failure and unknown outcomes stay unresolved. See [NEAR callback checklist](https://docs.near.org/smart-contracts/security/checklist#cross-contract-calls).

## Phase sequence

| Phase | Plan | Depends on | Exit proof |
| --- | --- | --- | --- |
| 00 | [Baseline, rights and runnable harness](phases/PHASE_00_BASELINE.md) | Owner vision | Selected decisions, owner-attested provider rights, reproducible commands and environment probes |
| 01 | [Studio domain and persistence](phases/PHASE_01_DOMAIN.md) | 00 | Versioned schemas, migrations and invariant tests |
| 02 | [Agent identity and collaboration](phases/PHASE_02_AGENTS.md) | 01 | Two attributable agents, durable graph, restart and rejection tests |
| 03 | [Creative production and media](phases/PHASE_03_CREATIVE.md) | 02 | Real playable songs, provenance, validation and licensed provider path |
| 04 | [NEAR authority and release commitments](phases/PHASE_04_AUTHORITY.md) | 01–03 | Sandbox identity, policy and publication commitment evidence |
| 05 | [Catalogue, album and playback](phases/PHASE_05_CATALOGUE.md) | 03–04 | Public two-song album, immutable version binding and browser playback |
| 06 | [Purchases, tips and refunds](phases/PHASE_06_COMMERCE.md) | 04–05 | Testnet paid transactions and idempotent revenue events |
| 07 | [Revenue splits and payouts](phases/PHASE_07_PAYOUTS.md) | 04, 06 | Exact ledger conservation and final child receipts |
| 08 | [Administrator and listener web app](phases/PHASE_08_WEBAPP.md) | 02–07 | Complete role-specific browser workflows in both modes |
| 09 | [Integrated fault and security verification](phases/PHASE_09_INTEGRATION.md) | 00–08 | Restart, adversarial, access-control, receipt and accounting matrix |
| 10 | [Release evidence and handoff](phases/PHASE_10_RELEASE.md) | 00–09 | Fresh setup plus live end-to-end testnet and model evidence |

Dependency completion requires passing evidence at the tested revision. An implementation file or a green mock alone does not satisfy a phase. Separate tasks may be developed earlier when useful, but the exit gate remains ordered.

## Architecture ownership

| Area | Target responsibility |
| --- | --- |
| `apps/web` | Admin, agent-team and listener surfaces; wallet session; authenticated API boundaries |
| `apps/worker` | Durable creative graph, NEAR AI and audio adapters, bounded jobs, reconciliation |
| `packages/domain` | Studio schemas, state transitions, canonical commitments and integer allocation |
| `packages/persistence` | Migrations, transactional repositories, job checkpoints, media metadata and encrypted private data |
| `packages/chain` | Typed contract wrappers, restricted signing, transaction/receipt tracking |
| New studio contract under `contracts/` | Agent/policy authority, publication commitments, payable purchase/tip ledger and payouts |
| Media storage | Durable audio/artwork blobs, content hashes, access control and backup/recovery |

The legacy RoyaltyDesk contract source and release screens were retired after the owner chose the studio as the sole active product. Historical plans, evidence, deployed accounts, and database records remain preserved. The shared SQLite migration path still reads legacy rows; never map a legacy CSV-funded `release` to a catalogue song or reuse its identifiers with different financial meaning.

## Global invariants

1. Agent actions are attributed to separately scoped identities; a coordinator cannot accept another agent's split.
2. The administrator's current policy governs every protected action. Human mode pauses; autonomous mode can progress only within scoped limits. Pause/revocation blocks future actions and does not rewrite historical transactions.
3. A published work binds immutable media/metadata/split hashes, version, price and album track order. Later edits create a new version; prior orders retain their original binding.
4. Only finalized listener funds become revenue. Free plays, model output and synthetic CSV imports create no earnings.
5. All amounts are integer yoctoNEAR or validated decimal strings. Gross equals fees plus refundable amounts plus allocated proceeds, with explicit rounding and no floating-point money.
6. One economic event per unique purchase/tip ID. Duplicate callbacks or browser retries cannot create extra revenue.
7. A payout is pending before dispatch; a matching private callback or independently reconciled receipt resolves it. Unknown transfers cannot be blindly replayed.
8. Generated media must have a permitted publication license, validated format, provenance, moderation and durable storage before public access.

## Execution and evidence protocol

1. Read the selected phase and its dependencies. Inspect the current dirty worktree and existing code before editing.
2. Implement stable task IDs and the positive/rejection checks listed in that phase. Keep old prototype tests working or document an intentional migration.
3. Use the [v2 evidence template](EVIDENCE_TEMPLATE.md) to create `plan-v2/evidence/PHASE_NN.md` **when that phase starts**. Do not prefill results or copy old evidence as a new pass.
4. Record exact command, revision, environment, expected and actual result, test count, sanitized artifact and final chain/AI/provider identities. Mark missing live access `blocked`, not passed.
5. Mark a phase `verified` only after all its exit criteria pass at the applicable revision. Fix regressions and rerun affected checks. Continue to the next eligible phase without a routine permission pause.
6. Before repeating any external action after a crash, reconcile its original operation ID, transaction/receipt status and contract state.

Planned verification command names are `npm run check`, `npm run build`, `npm run test:studio-domain`, `npm run test:studio-agents`, `npm run test:studio-media`, `npm run test:studio-sandbox`, `npm run test:studio-server`, `npm run test:studio-e2e`, and `npm run verify:studio`. Phase 00 must wire them to real suites; a missing or empty suite exits nonzero. Live testnet and paid inference are recorded separately, never silently replaced by fixtures.

## Progress

States: `not_started`, `in_progress`, `blocked`, `verified`. This table describes v2 only.

| Phase | State | Evidence | Next task |
| --- | --- | --- | --- |
| 00 | verified | [Phase 00 evidence](evidence/PHASE_00.md) | Provider decision updated in [decision 0004](../docs/decisions/0004-stability-audio.md) |
| 01 | verified | [Phase 01 evidence](evidence/PHASE_01.md) | V2-02-01 |
| 02 | verified | [Phase 02 evidence](evidence/PHASE_02.md) | V2-03-01 |
| 03 | verified | [Phase 03 evidence](evidence/PHASE_03.md) | Two live sung songs and accepted album; owner-confirmed testnet publication completed in Phase 05 |
| 04 | verified | [Phase 04 evidence](evidence/PHASE_04.md) | Isolated studio contract, sandbox authority matrix and live scoped agent keys passed |
| 05 | in_progress | [Phase 05 evidence](evidence/PHASE_05.md) | Real two-song album published on testnet; catalogue and range-media HTTP checks passed; owner browser playback/mobile checks pending |
| 06 | in_progress | [Phase 06 evidence](evidence/PHASE_06.md) | Real album/song purchases and tips finalized on testnet; owner reports web song purchase/tip work; album and remaining browser checks pending |
| 07 | in_progress | [Phase 07 evidence](evidence/PHASE_07.md) | Live payouts, ledger audit, concurrent payout rejection and incident inspection passed; missing-callback recovery remains |
| 08 | in_progress | [Phase 08 evidence](evidence/PHASE_08.md) | Browser project, agent, music, review, album, chain commitment and admin operations are implemented; live new-release and owner browser journeys remain |
| 09 | in_progress | [Phase 09 evidence](evidence/PHASE_09.md) | Full gate, restricted signer sandbox, backup drill, deployed upgrade and live ledger audits passed; full fault, browser isolation and event replay matrix remain |
| 10 | not_started | None | V2-10-01 |

## External references

The phase files cite the official source behind each platform constraint. Sources establish expected behavior, not proof that this repository implements it. Recheck version-sensitive SDK/API details through Context7 and NEAR Docs MCP when coding.
