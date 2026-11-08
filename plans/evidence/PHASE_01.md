# Phase 01 Evidence — Domain Rules and Reference Fixtures

## Identity

- Tasks: P01-01 through P01-05
- Status: verified; all Phase 01 domain and CSV checks pass offline
- Source digest: baseline `sha256:3192ba53fc25da9e59663f77b2a0ccc68a26137be3b06bb86f846683cc0cd7a2`; Phase 02–04 source changes require a new release digest
- Environment: Node 24.21.0 on Windows
- Requirements: Phase 01 plan, technical design sections 4–8, F-03/F-04/F-06/F-08, Decisions 0001 and 0002

## Changes and task outcomes

| Task | Changed paths | Outcome | Remaining work |
| --- | --- | --- | --- |
| P01-01 | `packages/domain/src/schemas`, `types.ts`, `limits.ts`, `errors.ts` | Bounded release, agreement, mandate, statement, settlement, and agent-action validation | None for Phase 01 |
| P01-02 | `money`, allocation fixtures/tests | Integer NEAR parsing/formatting and exact largest-remainder allocation | Mirror vectors independently in Rust during Phase 2 |
| P01-03 | `canonical`, agreement fixture, Decision 0002 | NFC canonical JSON, domain-bound SHA-256 commitment, pinned bytes/digests | Consume same vector in Rust |
| P01-04 | `statements`, CSV fixtures/tests | Dependency-free strict RFC-style parser, provenance hashes, semantic normalization, strict rows, claim blocking, export escaping | A future maintained package can replace the parser only through a deliberate compatibility decision |
| P01-05 | package exports, `serialization.ts`, testing loaders | Typed public surface and BigInt-safe JSON serialization | None for Phase 01 |

## Verification

| Case | Command | Expected | Actual | Result |
| --- | --- | --- | --- | --- |
| P01-CORE | `npm run test:domain:core` | All offline domain cases pass | 23 tests passed, 0 failed | pass |
| P01-STRUCTURE | `npm run check:offline` | No broad types, tabs, trailing whitespace; imports initialize | Passed | pass |
| P01-FULL | `npm run test:domain` | Full domain, parser, and CSV suite | 32 tests passed, 0 failed | pass |
| P01-TYPECHECK | `npm run check` | Strict TypeScript project references pass | All workspace checks passed | pass |

The passing suite includes the pinned 60/25/15 allocation with 2 NEAR recoupment, next-period allocation, one-yocto dust, lexicographic tie, recoupment above gross, zero share, u128-scale amount, 250 deterministic conservation traces, digest mutations, schema maximum/max-plus-one cases, row-order normalization, duplicate rejection, unsupported deduction blocking, and formula-prefix escaping.

## Financial evidence

For a 10 NEAR gross with 2 NEAR remaining recoupment to the 25% producer, the independently stored expected values are 4.8 NEAR artist, 4.0 NEAR producer, and 1.2 NEAR collaborator. The following period with no remaining recoupment yields 6.0, 2.5, and 1.5 NEAR. Every passing vector asserts that entitlement sum equals gross exactly.

## Limitations and handoff

The strict parser is intentionally dependency-free. Its supported behavior is directly tested, and the installed TypeScript compiler passes the workspace checks. Phase 02 must confirm the same canonical and allocation fixtures in Rust rather than trusting TypeScript output.
