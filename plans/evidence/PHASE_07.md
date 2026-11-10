# Phase 07 Evidence - Personal Agents and Bounded Orchestration

## Status

Implemented and locally verified for deterministic fixtures, policy boundaries, durable budgets, and the NEAR AI Cloud live adapter. Live paid inference and delegated sandbox execution remain separately configured evidence because they require the user's funded API key and rebuilt contract environment.

## Implemented paths

- `apps/worker/src/agents/context.ts`: owner-private context construction, deterministic input digests, bounded values, and untrusted-evidence delimiters.
- `apps/worker/src/agents/model.ts`: fixture/live modes, NEAR AI Cloud OpenAI-compatible chat completions, JSON-only parsing, timeout handling, and model/usage capture.
- `apps/worker/src/agents/orchestrator.ts`: persisted sessions, rounds, attempts, budgets, model runs, validated proposals, and awaiting-human outcomes.
- The coordinator stores counter-proposal parent IDs, reserves/reconciles model call/output budgets, and rejects mode/session mismatches before model execution.
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
| configured live NEAR AI case | not run in this environment to avoid consuming the user's inference credit |
| contract rebuild after mandate-view extension | requires the user's Docker-enabled environment |

No model output directly authorizes a payment. Invalid JSON, stale input digests, unsupported evidence IDs, expired/revoked mandates, and unsupported settlement approvals become rejected or awaiting-human outcomes.
