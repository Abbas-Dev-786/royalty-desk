# Phase 04 — NEAR authority and publication commitments

Depends on: 01–03. Status: verified. Outcome: contract-enforced identity, approval policy and immutable release commitments. See [Phase 04 evidence](../evidence/PHASE_04.md).

## Tasks

- **V2-04-01 Contract design:** create an isolated studio Rust contract with versioned storage, bounded song/album hashes, split commitments, publication status and events. Keep audio off-chain; account for storage growth and migration. Review against the NEAR contract-audit skill.
- **V2-04-02 Agent authority:** register distinct agent accounts and method-scoped function-call keys. Contract checks identity, role, current policy version, budgets/caps, expiry, pause and revocation. Zero-deposit agent actions cannot mint earnings. [NEAR access keys](https://docs.near.org/protocol/accounts-contracts/access-keys#function-call-keys).
- **V2-04-03 Approval modes:** human mode requires the admin's approval for exact split/publication versions and configured financial gates. Autonomous mode accepts an authorized agent's action within limits. Policy changes affect future actions and invalidate stale approvals where required.
- **V2-04-04 Publication:** commit media/metadata hashes, track order, split, price, version and policy provenance. Revision creates a new version; prior financial events remain bound to old commitments. Unpublish blocks future sales without erasing history.
- **V2-04-05 Upgrade and audit:** document storage layout, admin recovery, upgrade authority, failure behavior and event schema. Test private/admin methods, storage attacks and unauthorized calls.

## Evidence and exit

**AUTH-01** actual separate agent keys invoke only allowed methods in sandbox; **AUTH-02** wrong signer, method, stale epoch and revoked/paused key rejected; **AUTH-03** human mode blocks unapproved publish/split and autonomous mode succeeds within cap; **AUTH-04** revision preserves old commitment; **AUTH-05** oversized state/storage underfunding rejected; **AUTH-06** audit findings fixed or tracked as release blockers. Record WASM hash, signer/key permission, receipts and before/after state. Unit mocks alone do not satisfy authority proof.
