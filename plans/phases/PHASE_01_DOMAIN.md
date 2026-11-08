# Phase 01 — Domain Rules and Reference Fixtures

Status: verified. Domain implementation and strict CSV parser are unit verified. Evidence: [Phase 01](../evidence/PHASE_01.md). Depends on: [Phase 00](PHASE_00_FOUNDATION.md) decisions and workspace. Next: [Phase 02](PHASE_02_CONTRACT_AUTHORITY.md).

## Implementation status

| Task | State | Evidence |
| --- | --- | --- |
| P01-01 | Implemented and unit verified | Versioned schemas, bounds, structured errors, maximum/max-plus-one tests |
| P01-02 | Implemented and unit verified | Hand-authored vectors, dust/ties/recoupment/u128 cases, 250 seeded conservation traces |
| P01-03 | Implemented and unit verified | Decision 0002 and pinned agreement bytes/digests |
| P01-04 | Implemented and unit verified | Strict RFC-style parser, normalization, provenance, claims, fixtures, and 14 CSV/parser tests pass |
| P01-05 | Implemented | Typed exports, JSON-safe serializer, and fixture loaders |

## Outcome and source basis

One precise data contract for amounts, agreement commitments, statement normalization and allocation previews, with independent expected results. Sources: [technical design sections 4–8](../../docs/TECHNICAL_DESIGN.md), [F-03, F-04, F-06, F-08](../../docs/FEATURES.md). Rust will independently enforce the financial rules; copying a TypeScript output into contract state is not verification.

## Tasks

### P01-01 — Define schemas and bounded identifiers

- Implement versioned schemas in `packages/domain/src/schemas` for release, participant, agreement, mandate, statement, settlement commitment and agent action.
- Define allowed periods, account IDs, UTF-8 strings, identifier lengths and numeric bounds. Sort participant account IDs consistently. Keep basis points integral and money as decimal strings at external boundaries.
- Specify revision/version/epoch counters, overflow behavior and error codes. Mandate timestamps use an explicit unit and chain time; no mixed milliseconds/nanoseconds.
- Acceptance: malformed values fail before downstream work; maximum values and maximum-plus-one cases have fixtures.

### P01-02 — Implement integer money and independent vectors

- Parse NEAR decimal strings into integer yoctoNEAR with at most 24 fractional digits; reject negatives, exponent notation, NaN, whitespace ambiguity and overflow. Never pass amounts through JavaScript `Number` or SQLite numeric affinity that loses precision.
- Implement preview allocation: approved remaining recoupment first, then basis-point shares, then largest-remainder allocation with lexicographic account tie-breaks; consolidate beneficiary amounts.
- Hand-author expected vectors: with gross 10 NEAR, remaining recoupment 2 NEAR to producer, and artist/producer/collaborator shares 6000/2500/1500, entitlements are 4.8/4.0/1.2 NEAR. The next 10 NEAR period after full recoupment yields 6/2.5/1.5.
- Include 1-yocto dust, tied remainders, zero shares, recoupment above gross, gross near u128 maximum, no recoupment and zero-gross rejection. Derive expected results independently of the function under test.
- Acceptance: every vector conserves gross exactly and each participant's allocation is nonnegative; large multiplication cannot overflow silently.

### P01-03 — Specify canonical commitments

- Define the exact canonical serialization in `docs/decisions/0002-canonical-encoding.md`: permitted JSON types, sorted keys/accounts, omitted versus null fields, string normalization, integer strings and UTF-8 bytes. Avoid relying on incidental object insertion order.
- Use SHA-256 with explicit application/schema/network/contract/release/version domain fields. Include separate structured-rules and rendered-document hashes in the approval digest.
- Produce shared canonical bytes, digests and mutation vectors for TypeScript and Rust consumers. Semantically equal key ordering yields the same commitment; changed terms, network, contract or document produces a different one.
- Acceptance: vectors pin actual bytes and digests once computed and independently checked. No placeholder digest is treated as an expected result.

### P01-04 — Define CSV normalization and evidence fixtures

- Implement the documented CSV v1 through the selected maintained parser. Enforce 1 MiB, 100 rows, exact schema, unique line IDs, single recording/period, nonnegative amounts and `NEAR` currency.
- Preserve raw bytes/hash and normalized semantic hash. Normalize semantic row ordering by stable line ID; filename, line endings and row order alone must not create a new payable identity.
- Define `revenue` versus `deduction_claim`; claims never automatically subtract money. Specify supported recoupment claim reconciliation to the deterministic calculation; unmatched totals/claims produce row-level errors or blocked review.
- Add canonical, unsupported-claim, corrected, duplicated, overflow, malformed-quote, invalid-period, oversized and spreadsheet-formula fixtures. Clearly label all synthetic data.
- Acceptance: a file that is invalid structurally is rejected; a structurally valid unsupported claim is preserved as review evidence and cannot be approved by the normal workflow.

### P01-05 — Publish the domain contract

- Export typed DTOs, structured error codes and fixture loaders. Financial data never serializes a raw BigInt accidentally.
- Document what each digest commits to and what it does not authenticate. Define the expected settlement preview, including approved recoupment and per-owner payout.
- Acceptance: the contract, backend and worker phases can implement against the same fixtures without asking a model to calculate money.

## Verification and artifacts

Targets: `packages/domain/src`, `packages/domain/tests`, `fixtures/agreements`, `fixtures/statements`, `fixtures/allocations`, decision 0002 and `plans/evidence/PHASE_01.md`.

Run `npm run test:domain` and `npm run check`. Cases cover AGR-01, CSV-01–05 and MONEY-04. Include permutation/mutation checks and randomized conservation checks with deterministic seeds; do not merely compare a function to a copy of itself. Record case counts, expected allocations, canonical byte fixtures and parse failures.

## Exit and handoff

Schemas, canonicalization and arithmetic are unambiguous, fixtures are independently checked, negative cases pass, and no floating-point money enters the boundary. The bounded strict CSV parser handles quoted commas, escaped quotes, multiline fields, CRLF/CR/LF endings, duplicate IDs, size limits, invalid UTF-8, and malformed quote syntax. Share the vectors with Phase 02/03; agreement document rendering can be integrated later without changing frozen-byte semantics. No blockchain deployment or paid inference is needed for this phase.
