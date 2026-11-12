# Phase 06 — purchases, tips and refunds

Depends on: 04–05. Status: real catalogue purchases and tips passed on live testnet; owner browser checkout observations pending. Outcome: real listener payments create exactly one recognized revenue event each. See [Phase 06 evidence](../evidence/PHASE_06.md).

## Tasks

- **V2-06-01 Orders:** quote immutable work/version, buyer, asset, exact price, expiry and unique order ID. Song and album purchases use separate methods or explicit type. Enforce minimum deposit and reject stale quotes or changed publication.
- **V2-06-02 Tips:** direct song/album tip with explicit allocation rule, bounds and unique tip ID. A tip is distinguishable from a purchase and does not silently grant purchase access.
- **V2-06-03 Contract payments:** payable native NEAR methods validate final price/version and credit escrowed revenue once. Reject duplicate IDs, wrong amount, unpublished work and unsupported asset. Agent function-call keys cannot attach the listener's payment.
- **V2-06-04 Checkout:** wallet confirmation shows contract, method, work, version and amount; server records requested/submitted/final/unknown state. Refresh/retry reconciles same transaction before creating a new payment.
- **V2-06-05 Refunds:** define policy, authority and timing; reverse only unallocated proceeds or create explicit seller debt if already allocated. Preserve audit trail and ensure no new earnings from a refund.

## Evidence and exit

**PAY-01** real testnet song purchase and album purchase credited once; **PAY-02** real testnet song and album tips credited to intended works; **PAY-03** duplicate/replayed ID, underpayment, stale version and unpublished work rejected with unchanged balances; **PAY-04** wallet interruption reconciles original outcome; **PAY-05** refund conserves gross/fee/refundable/proceeds and adjusts entitlement safely. Record signer, attached yoctoNEAR, order/tip IDs, finalized transaction/receipt status and contract balances. A browser success toast is insufficient.
