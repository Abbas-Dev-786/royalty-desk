# Decision 0001 — Implementation Baseline

Status: adopted for implementation. Date: 2026-11-07.

## Context

RoyaltyDesk needs one authority model shared by the contract, server, worker, and UI. These decisions close gaps in the technical design before public contract methods are implemented. They do not prove platform compatibility or production safety.

## Decisions

| ID | Decision | Rationale | Verification |
| --- | --- | --- | --- |
| D-01 | Each release has one immutable registered funder, defaulting to its creator. Only this account can fund or withdraw refunds. | Prevent ambiguous ownership of excess and cancelled principal. | Reject wrong-funder deposits/withdrawals in Phases 2–4. |
| D-02 | Cancellation creates a permanent release-period tombstone. | A correction or renamed statement must not recreate a payable period. | Reopen and replay tests in Phases 3 and 6. |
| D-03 | A release remains settlement-locked through review, held, finalized, and paying states. It unlocks after all entitlements resolve or cancellation allocates all deposits to refunds. | Serializes recoupment and prevents cross-period reserve reuse. | Multi-period state tests in Phases 3 and 4. |
| D-04 | Payable settlements require gross greater than zero. Zero-revenue imports remain non-payable evidence; zero participant entitlements are resolved without a transfer. | Avoid meaningless financial state and zero-value promises. | Domain and contract boundary vectors. |
| D-05 | A mandate cap applies to gross value per settlement. Methods use an explicit allowlist; replace/revoke increments the epoch. | Keeps delegation narrow and makes stale approval detection deterministic. | Mandate matrix in Phases 2 and 7. |
| D-06 | Revision clears approvals and preserves holds. A hold clearance names the reviewed revision and only the disputing owner can clear it. | A correction must not imply consent. | Revision/race tests in Phase 3. |
| D-07 | Private statement validation gates normal approval, while the contract enforces authorized rules and arithmetic. A hash does not authenticate statement truth. | The contract cannot inspect a private CSV from its digest. | Server policy and exact-digest tests in Phases 6 and 7. |
| D-08 | Use npm workspaces, Next.js 16.2.9, NEAR Connect 0.12.0, near-api-js 7.3.0, near-sdk-rs 5.30.1, a strict RFC-style CSV parser owned by `packages/domain/src/statements`, and Node's built-in SQLite API on Node 24. Package installation and Rust compatibility remain subject to executable probes. | The current environment cannot reach npm and cannot create a lockfile. The parser is dependency-free, fully bounded, and covered by quoted-field/error tests; built-in SQLite was successfully opened and reopened locally without a native add-on. | Install/build, wallet, sandbox, CSV, and persistence probes in Phases 0–1; replace with a maintained package only after a deliberate dependency decision. |
| D-09 | Persist signed transaction identity before broadcast and serialize signing by key. Recovery queries the same transaction and contract state before retry. | Prevents a crash from becoming a second financial action. | Kill-point tests in Phases 4 and 5. |
| D-10 | Initial bounds: 5 participants, 10 invitations, 10 frozen proposals, 20 revisions per period, 100 CSV rows, 1 MiB upload, 100 records per public page, and 1,000 retained jobs per release. Storage sponsorship is measured before deployment. | Bounds work and storage exposure while keeping the demo usable. | Limit and storage-exhaustion tests across Phases 1–5. |

## Method authority and deposit policy

| Method | Caller | Deposit | Initial input bound | Failure family |
| --- | --- | --- | --- | --- |
| `create_release` | Any owner account | Zero | 5 participants; 10 invitations | `ERR_RELEASE_*` |
| `accept_membership` | Invited owner | Zero | One membership | `ERR_MEMBERSHIP_*` |
| `freeze_agreement` | Release administrator | Zero | 5 participants; 10 proposals | `ERR_AGREEMENT_*` |
| `approve_agreement` | Listed accepted owner | Zero | Exact frozen digest | `ERR_APPROVAL_*` |
| `set_mandate`, `revoke_mandate` | Participant owner | Zero | One agent; explicit action set | `ERR_MANDATE_*` |
| `open_settlement`, `revise_settlement` | Release administrator | Zero | 20 revisions; committed private evidence | `ERR_SETTLEMENT_*` |
| `approve_settlement`, `dispute_settlement` | Owner or currently mandated agent | Zero | Exact revision/digest | `ERR_SETTLEMENT_*` |
| `clear_dispute` | Disputing owner | Zero | Current reviewed revision | `ERR_DISPUTE_*` |
| `fund_settlement` | Registered funder | Positive native NEAR | Checked `u128` addition | `ERR_FUNDING_*` |
| `finalize_settlement` | Any account | Zero | Current settlement | `ERR_FINALIZE_*` |
| `execute_payout` | Any account | Zero | One immutable entitlement | `ERR_PAYOUT_*` |
| `on_payout_complete` | Contract callback only | Zero | Matching attempt | `ERR_CALLBACK_*` |
| `approve_cancellation` | Listed owner | Zero | Current revision | `ERR_CANCEL_*` |
| `withdraw_refundable` | Registered funder | Zero | One refund obligation | `ERR_REFUND_*` |

Membership must be accepted before an owner can appear in a frozen agreement. All string, list, and page limits are enforced at the contract boundary as well as in application validation.

## Compatibility status

Node 24.21 and `node:sqlite` were observed locally. Official documentation supports NEAR Connect with NEP-413 message signing, near-api-js verification, restricted zero-deposit function-call keys, and near-sdk-rs contracts. The current environment lacks npm registry access, Rust/Cargo, sandbox access, a wallet session, and NEAR AI credentials, so those integrations remain unverified rather than assumed compatible.
