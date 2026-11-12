# Phase 01 — studio domain and persistence

Depends on: 00. Status: verified; see [evidence](../evidence/PHASE_01.md). Outcome: durable, versioned studio records with no accidental financial overlap with legacy releases.

## Tasks

- **V2-01-01 Schemas:** define typed `studio`, `agent`, `project`, `task`, `song`, `album`, `contribution`, `asset`, `split`, `policy`, `publication`, `order`, `tip`, `refund`, `entitlement`, `payout` and `external_operation` identities. Validate network/account IDs, canonical hashes, statuses and bounded strings.
- **V2-01-02 State machines:** specify draft/review/accepted/published/unpublished song and album transitions; dispute/timeouts; order and transfer states. Bind every version to immutable content and prior version; historical orders retain old versions.
- **V2-01-03 Money rules:** integer-only parser/allocation with 10,000-basis-point shares, deterministic remainder, album allocation and tip targeting. Fees/refunds/owed/paid must reconcile exactly. No float conversions.
- **V2-01-04 Persistence:** add migrations/repositories in `packages/persistence`, unique economic IDs, transactional updates, optimistic version checks, indexes, media metadata and separation from old CSV settlements. Provide migration rollback/restore procedure and bounded pagination.
- **V2-01-05 Fixtures:** create independent expected values for uneven splits, dust, revised works, album sale, song tip, album tip and refund. Keep synthetic fixtures labeled.

## Evidence and exit

**DOM-01** round-trip versioned records and migration from a copy of legacy DB; **DOM-02** reject invalid split, duplicate IDs, stale version and cross-project references; **DOM-03** independently checked money vectors including rounding and refund; **DOM-04** concurrent write/unique-ID race yields one outcome; **DOM-05** restore preserves old royalty data. Record exact tests, schema version, source revision, expected/actual rows and amounts. Exit when all domain invariants pass and old records remain readable.
