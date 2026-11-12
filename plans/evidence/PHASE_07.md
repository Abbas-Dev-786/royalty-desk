# Phase 07 Evidence - Personal Agents and Bounded Orchestration

## Status

Implemented and verified for deterministic fixtures, policy boundaries, durable budgets, the rebuilt contract, and the NEAR AI Cloud live adapter.

## Implemented paths

- `apps/worker/src/agents/context.ts`: owner-private context construction, deterministic input digests, bounded values, and untrusted-evidence delimiters.
- `apps/worker/src/agents/model.ts`: fixture/live modes, NEAR AI Cloud OpenAI-compatible chat completions, JSON-only parsing, timeout handling, and model/usage capture.
- `apps/worker/src/agents/orchestrator.ts`: persisted sessions, rounds, attempts, budgets, model runs, validated proposals, and awaiting-human outcomes.
- The coordinator stores counter-proposal parent IDs, reserves/reconciles model call/output budgets, and rejects mode/session mismatches before model execution.
- Validated structured terms are shared with accepted release owners, and another owner's agent can cite a same-release proposal ID in a counteroffer. Private instructions and objection rationales are excluded from the shared proposal view.
- `apps/worker/src/agents/policy.ts` and `tools.ts`: evidence-ID validation, mandate action/epoch/expiry/max-gross checks, digest binding, zero-deposit settlement tool requests, and restricted-signer dispatch.
- `apps/worker/src/agents/service.ts` and `health-server.ts`: loopback worker agent API with optional bearer protection and explicit fixture/live mode.
- Fixture mode produces an evidence-backed objection for unsupported deduction rows or an approval recommendation only when deterministic findings are clear; incomplete contexts remain human-review outcomes.
- `contracts/royaltydesk/src/lib.rs`: release views now expose bounded mandate metadata for server revalidation without exposing private instructions.

## Verification

| Check | Result |
| --- | --- |
| `npm run test:agents` | pass - deterministic personal context, valid objection dispatch policy, invented evidence rejection, and budget exhaustion |
| `npm run test:server` | pass - 14 tests including agent cases, persistence, auth, and operation identity |
| `npm run check` | pass |
| `npm run test:recovery` | pass |
| `npm run test:sandbox` | pass - authority negatives, mandate scope, funding, callbacks, cancellation, revocation, and failed-recipient retry |
| `npm run test:fault-injection` | pass - interrupted callback leaves entitlement pending and blocks replay |
| configured live NEAR AI case | pass - model `z-ai/glm-5.3-flash`, validated action `needs_human`, 32 input tokens, 179 output tokens |
| `npm run test:live-proposal` | pass - `z-ai/glm-5.3-flash` produced a schema-valid `propose_terms` action for three owners and 2 NEAR recoupment; input digest `7340e5c9a6b4b797769df9dfb7530018c0b5197954c0dc40036032fec1e603ae`, output digest `879d067676f579005893766d3dca8d92599767d328c70c63bb8ae71e80880c18` |
| `npm run test:agents` | pass - cross-owner same-release counteroffer; cross-release parent rejected |
| Docker contract rebuild after mandate-view extension | pass |

No model output directly authorizes a payment. Invalid JSON, stale input digests, unsupported evidence IDs, expired/revoked mandates, and unsupported settlement approvals become rejected or awaiting-human outcomes.

The live proposal probe validates a standalone model response. Browser wallet approval and a full three-owner live negotiation remain subject to the manual walkthrough in `docs/MANUAL_BROWSER_VERIFICATION.md`.
