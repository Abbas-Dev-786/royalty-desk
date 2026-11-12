# Phase 02 — agent identities and collaboration

Depends on: 01. Status: verified; see [evidence](../evidence/PHASE_02.md). Outcome: multiple agents genuinely collaborate with attributable, resumable decisions.

## Tasks

- **V2-02-01 Identity:** map each agent profile to a distinct NEAR account and controlled signing key; record controller, role, allowed tools, budget, expiry and revocation. Never give a model raw keys or broad wallet authority.
- **V2-02-02 Creative graph:** integrate a durable LangGraph.js workflow into the existing worker: brief, parallel lyric/composition tasks, peer review, bounded revision, split negotiation and unresolved timeout. Persist graph thread, task and side-effect IDs. [LangGraph persistence/interrupts](https://docs.langchain.com/oss/javascript/langgraph/interrupts).
- **V2-02-03 Inference:** integrate NEAR AI Cloud for role-specific structured output; validate outputs against schemas and prompt/tool policy. Track model, request ID, input/output hashes, usage and actual agent contribution. Fixtures remain explicitly labeled.
- **V2-02-04 Agreement:** each participant explicitly accepts its own proposed share/version; reject coordinator impersonation, stale acceptance and silent default acceptance. Escalate disagreement rather than fabricate consensus.
- **V2-02-05 Recovery:** bound tokens, generation costs, iterations, deadlines and concurrency. A resumed node must not repeat paid/audio/chain side effects; external operations use idempotency keys and reconciliation.

## Evidence and exit

**AGT-01** two distinct agents produce linked deliverables and peer revision; **AGT-02** third/coordinator cannot accept for another; **AGT-03** disagreement/timeout stays unresolved; **AGT-04** kill/restart resumes same job without duplicate external call; **AGT-05** live NEAR AI request contributes useful, attributable output; **AGT-06** over-budget and revoked tools fail. Record model/provider, sanitized prompts or hashes, graph ID and restart logs. Fixture-only passing does not satisfy AGT-05.
