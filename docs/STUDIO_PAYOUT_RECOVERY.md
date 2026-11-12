# Studio payout incident procedure

The contract reserves each payout amount in `pending` before sending NEAR. Its private callback marks the payout `paid` or `failed`. An unresolved callback must remain locked: the balance cannot safely be paid again from a different ID based on an RPC timeout alone.

## Inspect the exact attempt

1. Find the payout ID shown in `/studio/operations` or the private payout journal. Keep the request transaction hash if the wallet or worker displayed one.
2. Run `npm run inspect:studio-payout -- --payout-id=<ID>`. For a browser payout without a journal entry, add `--tx-hash=<REQUEST_TX_HASH>`. The command reads final contract state, the exact `request_payout` action, its `payout_requested` and terminal events, and the matching child transfer receipt. It makes no transaction.
3. Confirm the recipient and amount match the accepted agent account and owed balance. A `paid` result with a successful child transfer and `payout_paid` event is final. A `failed` result with `payout_failed` means the contract restored owed funds; fix the recipient account before using a new payout ID.
4. If the chain still says `pending`, preserve the payout ID and receipt graph. Do not submit a replacement payout for that reserved amount. Inspect the transfer and callback outcomes with a NEAR block explorer or RPC. If the callback did not settle, escalate for a contract-level recovery design that verifies the historical receipt before mutating balances. The current contract deliberately has no admin override for this case.

## Routine audit

Run `npm run audit:studio-ledger` to compare the four known commerce payments, exact allocation and two finalized agent payouts. Run `npm run test:studio-backup` to copy and restore the local catalogue and verify media hashes. These read-only commands do not create payouts or spend model/music credits.
