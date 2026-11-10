# RoyaltyDesk — Acceptance and Evidence Matrix

Status: Phase 00–08 evidence recorded; Phase 09 release handoff in progress. See [master plan](MASTER_IMPLEMENTATION_PLAN.md).

The case IDs below are stable targets for test names and evidence reports. Implementation must cover every acceptance bullet in [FEATURES](../docs/FEATURES.md), including cases grouped in one row below. Add concrete test-file paths and phase evidence links when those files exist.

## Current implementation evidence

- [Phase 00 evidence](evidence/PHASE_00.md): offline worker and persistence foundation passes; external compatibility gates remain open.
- [Phase 01 evidence](evidence/PHASE_01.md): AGR-01, MONEY-04, and CSV/parser normalization cases are verified with 32 passing domain tests. Rust parity remains a Phase 02 requirement.
- [Phase 05 evidence](evidence/PHASE_05.md), [Phase 06 evidence](evidence/PHASE_06.md), [Phase 07 evidence](evidence/PHASE_07.md), and [Phase 08 evidence](evidence/PHASE_08.md): authenticated boundaries, encrypted private files, agreement/statement workflows, bounded agents, browser integration, rebuilt contract, sandbox, fault-injection, and live NEAR AI evidence are recorded.
- [Phase 09 release artifacts](evidence/PHASE_09.md): release aggregator, artifact manifest, reproducibility instructions, and deployment/live-journey handoff are being finalized.

## Concrete verification map

| Acceptance area | Concrete implementation and evidence |
| --- | --- |
| F-01 identity and membership | `packages/persistence/tests/application.test.ts`, `apps/web/src/app/api/auth/*`, `scripts/test-sandbox.mjs`, [Phase 05](evidence/PHASE_05.md) |
| F-02 personal agents | `apps/worker/tests/agents.test.ts`, `apps/worker/src/agents/*`, live NEAR AI result in [Phase 07](evidence/PHASE_07.md) |
| F-03 negotiation/action bounds | `packages/domain/tests/schemas.test.ts`, durable agent proposal/session tables, [Phase 07](evidence/PHASE_07.md) |
| F-04 agreements | `packages/domain/tests/canonical.test.ts`, `packages/persistence/tests/application.test.ts`, sandbox agreement unanimity/rejection checks |
| F-05 mandates | contract authority suite in `scripts/sandbox/scenario.mjs`, mandate policy tests, revoked/expired/replaced checks in [Phase 07](evidence/PHASE_07.md) |
| F-06 statements | `packages/domain/tests/statement-normalization.test.ts`, `packages/domain/tests/strict-parser.test.ts`, private statement route, [Phase 06](evidence/PHASE_06.md) |
| F-07 settlement review | contract sandbox dispute/revision checks, settlement action route, browser owner workspace, [Phase 08](evidence/PHASE_08.md) |
| F-08 funding/accounting | `packages/domain/tests/money.test.ts`, contract funding/finalization/refund checks, [Phase 03](evidence/PHASE_03.md) |
| F-09 payouts/recovery | `scripts/test-sandbox.mjs`, `scripts/test-fault-injection.mjs`, `scripts/test-recovery.ts`, [Phase 04](evidence/PHASE_04.md) |
| F-10 operational visibility | `apps/web/src/app/api/chain/operations/*`, `apps/web/src/components/ReleaseConsole.tsx`, `scripts/test-e2e.mjs` |
| F-11 reproducible demo | `scripts/verify-release.mjs`, `README.md`, `plans/evidence/artifacts/release-manifest.json`, [Phase 09](evidence/PHASE_09.md) |

| Feature | Implementation phase | Required verification cases | Evidence needed |
| --- | --- | --- | --- |
| F-01 | 02, 05, 08 | AUTH-01 three distinct owners; AUTH-02 replay/expired/wrong-domain/wrong-network challenge; AUTH-03 outsider/private access; AUTH-04 unaccepted invitation | Server tests, sandbox membership tests, browser sign-in |
| F-02 | 05, 07 | AGENT-01 cross-owner context isolation; AGENT-02 invalid output/timeout/budget; AGENT-03 secret/log redaction | Deterministic agent/server suite plus live request record |
| F-03 | 01, 07, 08 | NEG-01 useful proposal or objection; NEG-02 invalid terms; NEG-03 max rounds/unresolved state; NEG-04 active terms unchanged | Transcript with evidence IDs, validation and contract snapshots |
| F-04 | 01, 02, 06 | AGR-01 canonical digest; AGR-02 unanimous owner-only approval; AGR-03 new version invalidates old approval; AGR-04 amendment/recoupment restrictions | Cross-language vectors, sandbox calls, wallet flow |
| F-05 | 02, 07, 08 | MAND-01 wrong scope/method/identity; MAND-02 expiry; MAND-03 revoke/replace epoch; MAND-04 owner fallback; MAND-05 finalized entitlement unchanged | On-chain negative tests and revocation journey |
| F-06 | 01, 06 | CSV-01 schema/size/decimal/overflow; CSV-02 duplicates/reformatted input; CSV-03 track/period/total mismatch; CSV-04 unsupported claims; CSV-05 provenance/export escaping | Parser vectors, authorized import tests, row-level errors |
| F-07 | 03, 06, 07 | SET-01 missing/stale approval; SET-02 held settlement; SET-03 revision preserves holds; SET-04 owner-only clearance; SET-05 stale epoch at finalization | Sandbox state histories and correction browser flow |
| F-08 | 01, 03 | MONEY-01 underfunding; MONEY-02 duplicate finalization; MONEY-03 recoup once across periods; MONEY-04 rounding/conservation; MONEY-05 excess/refund separation; MONEY-06 wrong funder | Independent vectors, property tests and ledger snapshots |
| F-09 | 04, 05, 08 | PAY-01 pending-before-transfer; PAY-02 concurrent/replayed trigger; PAY-03 spoofed/stale callback; PAY-04 explicit failure retry; PAY-05 unknown remains pending; PAY-06 final receipt | Compiled-WASM sandbox receipts and live native transfers |
| F-10 | 05–09 | OPS-01 refresh/restart; OPS-02 financial categories; OPS-03 actor/source/network labels; OPS-04 privacy; OPS-05 storage pressure; OPS-06 crash before transaction-hash persistence | Recovery suite, browser evidence, sanitized logs |
| F-11 | All; final 09 | DEMO-01 offline deterministic suite; DEMO-02 live AI + testnet journey; DEMO-03 fresh setup; DEMO-04 honest README and limitations | Release report and reproducible demo artifacts |
| F-12 | Optional 10A | INT-01 authenticated quote/entitlement binding; INT-02 actual destination receipt; INT-03 refunds/unknown status; INT-04 separate mainnet funds | Separate approved pilot; dry quote alone does not pass |
| F-13 | Optional 10B | VER-01 endpoint evidence; VER-02 available response signature; VER-03 tampered/missing evidence has no badge | Supported verification flow and negative evidence fixtures |
| F-14 | Optional 10C | META-01 authorized metadata; META-02 inaccessible provider fallback; META-03 no earnings claims | Provider response/provenance and UI fallback |

## Cross-cutting release blockers

1. Any route/tool can read another owner's private preferences or use another identity's signer.
2. A model, database edit, stale approval or coordinator can bypass contract authorization.
3. An atomic unit is lost, invented, double allocated, or spent from another period's obligations.
4. An unknown transaction/callback outcome becomes automatically retryable.
5. One live settlement limit, period identity, storage bound or cancellation tombstone is bypassed.
6. Synthetic data, mock inference, submitted transactions or quotes are described as real royalty revenue, live model results, confirmed payment or executed Intents.

For each blocker, identify the relevant automated assertion and observed outcome. A visually successful demo cannot override a failed financial or authorization check.
