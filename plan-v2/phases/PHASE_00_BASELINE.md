# Phase 00 — baseline, rights and runnable harness

Depends on: owner vision. Status: verified; see [evidence](../evidence/PHASE_00.md). Outcome: freeze the decisions that affect custody, licensing and money before building dependent flows. Prior prototype evidence may inform tool choices but cannot verify v2.

## Tasks

- **V2-00-01 Product contract:** write acceptance scenarios for a two-agent, two-song album; separate admin, agent and listener actions; define what human and autonomous modes gate. Map every user-visible action to a state transition.
- **V2-00-02 Rights:** record each audio provider's plan, exact permitted catalogue/playback/sale/tip/download uses, attribution, prohibited inputs, territorial or plan limits and evidence of permission where required. The selected instrumental provider is Stability AI; sung vocals require a separate approved path. Do not treat API access as distribution rights. [Decision 0004](../../docs/decisions/0004-stability-audio.md).
- **V2-00-03 Economics and custody:** decide native testnet NEAR price units, song/album prices, tip range, platform fee, album-to-song allocation, refunds, recipient account custody/recovery, storage/gas funding and spending caps. Write independent example ledgers in yoctoNEAR.
- **V2-00-04 Infrastructure:** choose media storage, backup, content hashes, moderation/takedown, deployment topology, DB migration route and legacy-data isolation. Decide new contract account and upgrade/recovery policy.
- **V2-00-05 Harness:** pin toolchains and dependencies; wire `test:studio-*` and `verify:studio` to nonempty suites; run clean-install, Docker-backed existing-contract build, NEAR testnet RPC and live NEAR AI probes. Record existing wallet compatibility evidence. Studio-contract sandbox, studio browser-wallet and live licensed music-generation probes occur in Phases 03, 04 and 08 when those components exist. Keep secrets outside the repository.

## Evidence and exit

Cases **BASE-01** decision record covers each external dependency and allowed use; **BASE-02** two complete economic vectors conserve funds; **BASE-03** empty/missing suites fail nonzero; **BASE-04** clean install reproduces build and local media recovery; **BASE-05** live NEAR AI and testnet RPC probes record actual result. Attach sanitized permission basis, commands, versions and logs. Exit when catalogue-rights basis and financial/custody decisions are explicit; the Phase 03 publication gate still requires licensed live audio evidence.
