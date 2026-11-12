# Phase 01 evidence — verified

Date: 2026-11-11. Source: Git baseline `a381d13` plus working-tree v2 changes; no commit has been made. Environment: Windows, Node 24.21.0, npm 11.19.0, `node:sqlite`. Schema version: 5. No studio contract is deployed.

| Task | Implemented behavior |
| --- | --- |
| V2-01-01 | Typed studio, agent, project, task, work version, contribution, asset, split acceptance, policy, publication, revenue event, refund, entitlement, payout and external-operation identities. SQLite v5 tables are isolated from legacy royalty tables. |
| V2-01-02 | Work, task, revenue and payout transition rules; immutable work-version rows; version-bound album tracks and revenue references. Dispute/timeout task states remain unresolved until a later authorized action. |
| V2-01-03 | Strict u128-compatible integer yocto parser; 10,000-basis-point shares; deterministic largest-remainder song and album allocation; finalization/refund rules; stable split digest. No floating-point money. |
| V2-01-04 | Transactional schema migration and work-version/album-track insertion; distinct economic IDs; sequential policy/work version checks; cross-studio checks; bounded project pagination; asset and external-operation repositories. [Backup and rollback procedure](../MIGRATION_AND_STORAGE.md) preserves legacy data. |
| V2-01-05 | Independent synthetic [allocation](../../fixtures/studio/economic-vectors.json) and [revenue](../../fixtures/studio/revenue-vectors.json) vectors cover dust, tie-break, album sale, album tip and refund. Tests also cover stale versions, duplicate IDs, two-connection lock contention and closed-file restore. |

## Observed verification

| Case | Exact command | Expected / actual | Result |
| --- | --- | --- | --- |
| DOM-01 | `npm run test:studio-domain` | Versioned studio/work rows and version-4-to-5 migration preserving legacy membership pass | pass |
| DOM-02 | `npm run test:studio-domain` | Invalid split/policy, stale version, duplicate ID, cross-project track, wrong-agent acceptance rejected | pass |
| DOM-03 | `npm run test:studio-domain` | Independent integer vectors conserve allocated proceeds; refund yields zero entitlement | pass |
| DOM-04 | `npm run test:studio-domain` | Two SQLite connections contend on same order ID: second write locks, then duplicate fails; one row remains | pass |
| DOM-05 | `npm run test:studio-domain` | Closed DB copy restores studio and legacy membership; media copy restores bytes and detects corruption | pass |
| Full studio domain | `npm run test:studio-domain` | 14 tests passed, 0 failed | pass |
| Legacy regression | `npm run test:domain` | 41 passed, 0 failed | pass |
| Server/persistence regression | `npm run test:server` | 30 passed, 0 failed | pass |
| Type/source policy | `npm run check` | All workspaces passed | pass |
| Workspace build | `npm run build` with Docker access | Web, worker, packages and legacy contract built; exit 0 | pass |

These checks prove local domain and persistence behavior, not on-chain authority, listener payment or live music generation. The Phase 02+ suites are intentionally empty and fail nonzero. No financial or external operation needs reconciliation.

Exit: DOM-01 through DOM-05 satisfied at this working-tree revision. Next task: V2-02-01.
