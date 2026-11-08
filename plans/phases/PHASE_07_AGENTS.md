# Phase 07 — Personal Agents and Bounded Orchestration

Status: not started. Depends on: [Phase 04](PHASE_04_TRANSFERS.md), [Phase 05](PHASE_05_APPLICATION_FOUNDATION.md), [Phase 06](PHASE_06_ADMINISTRATION.md). Next: [Phase 08](PHASE_08_INTEGRATION.md).

## Outcome and source basis

Real NEAR AI inference supports negotiation and evidence review; distinct personal agents act only through deterministic tools and current mandates. Sources: [technical design sections 2, 3, 9](../../docs/TECHNICAL_DESIGN.md), [F-02, F-03, F-05, F-07](../../docs/FEATURES.md). This phase uses the already validated gateway adapter; no attestation claim is required for ordinary inference.

## Tasks

### P07-01 — Implement personal contexts and the coordinator

- Add owner-private preferences, separate agent identities/configuration and shared release context. Build prompts from authorized data-access functions.
- Personal agents receive their own preferences and authorized shared evidence only. Coordinator sees shared proposals/status and cannot read private preferences or use participant signers.
- Treat documents, CSV cells and other agents' text as untrusted input. Do not expose arbitrary fetch, shell, arbitrary transaction payload, destination editing or full-access signing tools.
- Acceptance: AGENT-01/03 pass for API, context builder, export, model input and tool access boundaries.

### P07-02 — Implement validated model actions and budgets

- Support `propose_terms`, `counter_terms`, `request_evidence`, `recommend_approval`, `raise_objection` and `needs_human` through versioned schemas.
- Distinguish live gateway and deterministic-fixture modes in configuration and output. Parse/validate output before any tool dispatch; model prose alone cannot invoke contract methods.
- Limit negotiation to three rounds, model calls to two attempts and jobs to configured token/cost ceilings. Reserve estimated budget before calls and reconcile actual usage when available; unavailable cost data is not treated as zero or as permission for unlimited calls.
- Timeouts, exhausted limits or invalid outputs become explicit failed/awaiting-human outcomes with concise reasons. Preserve factual summaries/evidence IDs, not hidden chain-of-thought.
- Acceptance: limits survive process restart and no invalid response triggers an action.

### P07-03 — Implement negotiation and human approval handoff

- Coordinate structured proposals/counterproposals referencing parent proposal IDs. Validate participants, basis points and supported recoupment on every offer.
- Show differences and unresolved terms. Consensus produces a candidate draft for Phase 06; it never activates an agreement or performs owner approval.
- On round exhaustion, preserve disagreement and offer manual editing. A fresh negotiation session is deliberate and budgeted.
- Acceptance: invalid terms cannot become approval-ready; active on-chain rules remain unchanged throughout negotiation.

### P07-04 — Implement evidence review and delegated decisions

- Feed each personal agent the exact agreement/revision, normalized rows, deterministic validation findings and preview. Require objections to cite existing evidence/row IDs; reject invented references.
- Route recommendations through policy checks for identity, digest, permitted action, cap, expiry, epoch, known evidence and deterministic financial validity.
- For the canonical unsupported claim, allow a valid agent objection to dispatch `dispute_settlement`. If the model misses the issue, deterministic checks still block approval and flag human review; never invent an agent objection to improve the demo.
- After correction and owner clearance, valid recommendations may dispatch approvals under current mandates. Revalidate chain state before signing; contract revalidates at execution/finalization.
- Acceptance: the coordinator cannot fill a participant approval slot, clear a hold, redirect a payment or approve an agreement.

### P07-05 — Complete automation and recovery integration

- Schedule finalization when confirmed prerequisites pass and trigger immutable participant payouts through permitted methods. Approval authority is distinct from permissionless execution of finalized rights.
- Reuse durable operation IDs, signing queues and receipt reconciliation. An expired job lease cannot authorize a second financial action.
- Surface owner fallback, revocation and paused work. Revoke/replace between recommendation and execution must fail on chain; refresh between recommendation and signing where possible.
- Acceptance: worker restart, stale revision and revoked mandate never produce an unauthorized successful action.

## Verification

Run `npm run test:agents`, `npm run test:server`, `npm run test:recovery` and targeted `npm run test:sandbox`/`npm run test:e2e`. Separately run the configured live gateway case through `npm run test:live`.

Deterministic fixtures cover valid proposal, counteroffer, unsupported-claim objection, malformed JSON, wrong owner, invalid evidence ID, prompt injection requesting destination change, timeout, budget exhaustion, three-round disagreement, revoked/expired mandate and stale digest. Assert tool calls and absence of unauthorized chain operations, not only generated text.

The live case must record at least one useful model proposal or evidence-backed objection with model ID, response status, input digest and validated output. A fixture-generated transcript cannot satisfy NEG-01's live evidence. Full live settlement proof is Phase 09.

## Evidence and exit

Targets: `apps/worker/src/{agents,models,tools,policies}`, shared action schemas, agent settings/negotiation UI, deterministic model fixtures and `plans/evidence/PHASE_07.md`.

Exit requires isolated contexts, bounded/recoverable jobs, a real useful inference result, actual delegated sandbox actions and all permission negatives. A provider outage blocks live acceptance while offline tests remain valid. Never substitute an alternate provider silently or claim hosted agents are independently controlled organizations.
