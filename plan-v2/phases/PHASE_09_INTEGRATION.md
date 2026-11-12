# Phase 09 — integrated fault and security verification

Depends on: 00–08. Status: not_started. Outcome: trust boundaries and recovery work under restarts, concurrency and hostile inputs.

## Tasks

- **V2-09-01 Threat review:** audit new contract with the NEAR contract-audit skill; review key custody, admin recovery, callback security, storage growth, overflow, access control, event spoofing and upgrade path. Resolve critical/high findings before release.
- **V2-09-02 End-to-end matrix:** exercise both approval modes with two agents, two songs, one album, sale, tip, split and payouts. Assert independent ledger conservation and historical version binding.
- **V2-09-03 Fault injection:** crash worker around AI/audio request, signed transaction, publication, order confirmation and payout callback. Restart and reconcile same IDs. Inject RPC timeout, media-store failure, corrupt blob, callback failure and duplicate notifications.
- **V2-09-04 Privacy and isolation:** switch wallets, test unauthorized direct API calls, secret exposure, prompt injection through creative assets, agent tool abuse and stale-policy races. Check rate limits and budgets.
- **V2-09-05 Operations:** back up and restore DB/media, reconstruct catalogue/ledger projection from chain events, test pause/revoke and rollback. Verify existing prototype data still opens or is explicitly archived.

## Evidence and exit

**INT-01** contract audit has no unresolved critical/high finding; **INT-02** every global invariant passes positive and rejection paths; **INT-03** crashes yield no duplicate paid audio calls, sales or transfers; **INT-04** unauthorized users/agents cannot cross roles; **INT-05** backup/restore and event replay reproduce balances; **INT-06** legacy records are preserved. Keep sanitized logs, failure injection seed, revisions and before/after snapshots. A unit-test-only pass is insufficient for receipt behavior.
