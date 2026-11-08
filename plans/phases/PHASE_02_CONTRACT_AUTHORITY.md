# Phase 02 — Contract Identity, Agreements and Mandates

Status: not started. Depends on: [Phase 01](PHASE_01_DOMAIN.md) and Phase 00's working sandbox/key path. Next: [Phase 03](PHASE_03_SETTLEMENT_ACCOUNTING.md).

## Outcome and source basis

The deployed sandbox contract recognizes owners and agents, activates only unanimously approved terms and enforces bounded delegation. Sources: [technical design sections 3, 4, 7](../../docs/TECHNICAL_DESIGN.md), [F-01, F-04, F-05](../../docs/FEATURES.md).

## Tasks

### P02-01 — Establish state, caller checks and bounded storage

- Create contract modules for releases, agreements, mandates, errors and events. Initialization is one-time; deployment/admin custody is explicitly documented.
- Implement `create_release` and `accept_membership` with maximum five participants, unique accepted owner identities, bounded invitations and immutable registered funder from D-01.
- Use immediate predecessor for owner/agent authorization. Do not trust a supplied owner ID, original signer, account-name prefix or backend role flag.
- Enforce the selected record/byte limits and separate storage sponsorship from royalty principal. Public views paginate and never include private document contents.
- Acceptance: unauthorized creation mutations, duplicate identities, unaccepted approval participants and exhausted bounds fail with no partial state.

### P02-02 — Implement frozen agreements and activation

- Implement `freeze_agreement` and `approve_agreement` over canonical structured rules and document commitments. Validate 10,000 total basis points, allowed recoupment, beneficiary membership and effective period.
- Store immutable frozen proposal versions; every approval references the same domain-bound digest. The last valid owner approval activates the proposal atomically.
- Agents cannot approve initial terms or amendments. Mutation of frozen content creates a new version; superseded proposals cannot unexpectedly activate from late approvals.
- Implement amendment checks against the settlement/recoupment state interface: no live settlement, consumed recoupment preserved, new cap no lower than consumed, beneficiary fixed once allocation occurred. Phase 03 supplies full ledger integration.
- Acceptance: Rust hashes match Phase 01 vectors and a single wrong/stale/non-owner approval cannot activate terms.

### P02-03 — Implement owner mandates and epoch semantics

- Implement `set_mandate`/`revoke_mandate` with owner, agent, release, agreement, allowed actions, per-settlement gross cap, expiry and epoch.
- Require distinct owner/agent identities and unambiguous owner mapping within a release. A shared agent account cannot silently fill multiple participant slots.
- Replace/revoke increments epoch; preserve enough state to reject old approvals. Expose an internal validation function used both at action time and finalization.
- Reject wrong scope, disabled methods, invalid expiry and overflow. Agent methods accept zero deposit. Any public payout trigger remains constrained to immutable finalized entitlements even if the caller has no mandate.
- Acceptance: real function-call key restrictions and contract mandate checks are independently demonstrated.

### P02-04 — Publish ABI, read models and events

- Add typed bindings in `packages/chain`, view response schemas and stable errors for clients. Events contain IDs, hashes and safe state transitions only.
- Document direct-owner and agent method allowlists. Keep owner transaction building separate from restricted-worker signing.
- Acceptance: malformed view payloads fail client validation; no UI inference from naming conventions grants authority.

## Verification

Run `npm run test:contract`, `npm run test:sandbox`, `npm run test:domain` for shared vectors, and `npm run check`.

Required sandbox cases:

| Case | Expected result |
| --- | --- |
| Three accepted owners approve identical proposal | Active only after final owner confirmation |
| Agent, outsider or A impersonating B approves | Rejected; approval count unchanged |
| Wrong application/network/contract digest | Rejected; no cross-environment reuse |
| Changed shares/document or superseded proposal | Fresh approvals required; late approval cannot activate superseded terms |
| Invalid sum, duplicate owner, sixth participant, unaccepted invitation | Rejected |
| Wrong agent/release/version/method, expired/revoked mandate | Rejected |
| Replace/revoke twice and attempt old epoch | Monotonic epochs; old authority unusable |
| Agent key calls another contract/owner method/attaches funds | Runtime or contract rejects; no privilege escalation |
| Storage bound reached | Controlled rejection without leaking private data or consuming principal |

Amendment/recoupment and revoke-before-finalization tests must be completed against the real ledger in Phase 03; list them as integration dependencies rather than falsely passing them with a stub.

## Evidence and exit

Targets: `contracts/royaltydesk/src/{releases,agreements,mandates}`, matching unit/sandbox tests, `packages/chain`, `plans/evidence/PHASE_02.md`.

Record compiled WASM hash, sandbox account identities, access-key permission views, test results, agreement digests and sanitized state snapshots. Exit requires all authority cases passing with real sandbox accounts. ABI compilation alone is insufficient. No payment method or administrator bypass is introduced in this phase.
