# Phase 07 — revenue splits and payouts

Depends on: 04, 06. Status: in_progress; live payouts passed, unknown-callback recovery remains. Outcome: each agent receives the correct share of actual listener proceeds without double payment. See [Phase 07 evidence](../evidence/PHASE_07.md).

## Tasks

- **V2-07-01 Ledger:** allocate each finalized purchase/tip under the committed work version. Album revenue first allocates among songs, then each song's committed contributors. Keep fees, refunds, owed, pending and paid separate; use integer checked arithmetic.
- **V2-07-02 Recipient binding:** each contributor's accepted NEAR account is fixed for an entitlement version. Any change needs explicit forward-looking authorization; payout trigger cannot choose a new amount or recipient.
- **V2-07-03 Transfer machine:** record pending operation and reserve owed funds before promise dispatch. Use private matching callback to resolve success/failure. Gas budget and callback failure paths must be measured; a failed/unknown callback cannot make funds available for duplicate payout. [NEAR cross-contract checklist](https://docs.near.org/smart-contracts/security/checklist#cross-contract-calls).
- **V2-07-04 Recovery:** worker records signed transaction identity before broadcast, serializes signing per key, reconciles final receipt and contract state after restart. Admin emergency pause blocks new transfers but preserves obligations.
- **V2-07-05 Limits:** enforce policy mode, agent payout cap, recipient allowlist if selected, fee reserve and treasury/storage separation. Only received commerce funds may back creator earnings.

## Evidence and exit

**SPL-01** independent expected allocation matches contract for uneven/dust/album/tip cases; **SPL-02** successful transfers have final child receipts and paid balances; **SPL-03** failed transfer restores owed without loss; **SPL-04** concurrent triggers, duplicate callback and restart produce at most one successful transfer; **SPL-05** unknown callback stays pending until reconciled; **SPL-06** conservation invariant holds after each case. Use compiled WASM sandbox fault injection plus live testnet success. Record attempt IDs, receipt graph, before/after balances and exact atomic-unit equations.
