# RoyaltyDesk — Current Scope

Status: v0.1 product scope. Date: 2026-11-07.

**Scope update (2026-11-11):** this file specifies the existing royalty-administration prototype. The project owner's target is an [agent-led music studio](PRODUCT_VISION_ALIGNMENT.md) with autonomous creative agents, an in-app catalogue, paid purchases and tips, and an administrator-selectable human approval mode. See its separate [implementation plan](../plans/AGENT_MUSIC_STUDIO_IMPLEMENTATION_PLAN.md). The older acceptance criteria below do not prove the new product.

## Outcome

Deliver one complete recording-revenue administration flow for three collaborators: negotiate, approve, delegate, import, dispute, correct, fund, finalize, and pay. NEAR must enforce the agreement, each agent's authority, and the money movements.

Read with [PRD](PRD.md), [feature acceptance criteria](FEATURES.md), [technical design](TECHNICAL_DESIGN.md), and [future scope](FUTURE_SCOPE.md).

## Required boundary

| Area | Required implementation |
| --- | --- |
| Network | NEAR testnet; obvious network labeling everywhere money is shown |
| Funds | Native testnet NEAR; integer yoctoNEAR accounting; actual funded contract |
| Parties | Three demo participants with distinct owner accounts and personal agent identities; bounded participant list, maximum 5 |
| Recording | One canonical demo recording; data model keyed by release ID |
| Rights | Recording-revenue participation only; no composition/publishing ownership claims |
| Agreement | Basis-point shares totaling 10,000; zero or one fixed recoupment rule for the release |
| Recoupment | Fixed approved total and beneficiary; remaining amount tracked across finalized periods; no arbitrary new expense types |
| Statements | One documented CSV format; canonical synthetic NEAR-denominated fixture with at most 100 rows |
| Periods | At most one live settlement for a release-period; revisions preserve that identity |
| Concurrency | One live settlement per release; finalize periods in increasing order to serialize recoupment |
| Agents | Coordinator and one personal agent per participant, isolated context and permissions |
| Model | Actual NEAR AI Cloud inference for negotiation/review, bounded rounds and spend; deterministic fixture mode separately labeled |
| Approval | Initial agreement and amendments signed by every listed participant's owner wallet |
| Delegation | Owner-created, revocable, expiring mandate pinned to release and agreement version |
| Settlement | All participant approvals of exact current revision; whole settlement held on dispute |
| Payment | Contract-computed entitlements; native transfers with private callbacks and retry-safe accounting |
| Evidence | Versioned agreement, statement commitment, decision summaries, confirmed transaction receipts |
| UI | Account, workspace, negotiation, agreement, agent settings, statement, settlement, payout/activity views |

The canonical fixture uses the same asset for reported amounts and funding. No implicit USD-to-NEAR conversion or invented stream rate is allowed. A report in an unsupported currency is rejected. Real distributor CSVs can be added later through an explicit normalization and funding model.

## Example workflow

1. Artist, producer, and collaborator join a release.
2. Their agents discuss shares and prepare a 60% / 25% / 15% proposal with an explicitly approved recoupment rule.
3. Each human approves exactly the same agreement version.
4. Participants activate narrowly scoped agent mandates.
5. A synthetic testnet statement is imported with a known total and one unsupported deduction claim.
6. The producer's agent cites the invalid claim and disputes the proposal; an attempted finalization is rejected.
7. A corrected revision removes the invalid deduction. Disputing parties clear holds and all required parties approve the new revision.
8. The settlement receives testnet NEAR funding and its computed entitlements are finalized.
9. Payouts produce actual receipts and conserved balances.
10. Duplicate settlement calls are rejected. A revoked agent's next approval attempt is also rejected.

If negotiation reaches its round limit, unresolved terms remain visible and participants can supply a proposal for approval. The system does not present unresolved negotiation as a successful agreement.

## Conditional enhancements

| Item | Requirement | Supported fallback |
| --- | --- | --- |
| NEAR AI per-request verification display | Verification evidence and supported response signature checked successfully | Report inference integration accurately; do not show a verified badge |
| One NEAR Intents payout | Verified authorization binding, supported route, refunds and status recovery | Native settlement; dry quotes labeled as previews |
| Spotify metadata lookup | App access and endpoint permissions verified | Manually enter identifiers; retain source link |

Intents has no testnet according to the hackathon rules. Any mainnet pilot is a separate environment and needs explicit user authorization, funded accounts, and validated end-to-end controls. Testnet entitlements are never portrayed as backing a mainnet payout. The external payout adapter is not part of the mandatory native contract path.

## Explicitly excluded

- Live Spotify earnings API or automatic distributor/bank withdrawals.
- Every platform's analytics, statement formats, or royalty categories.
- Legal drafting for arbitrary agreements, signature-certification services, or ownership validation.
- Agent authority to change shares, recipients, or deduction policy without owner approvals.
- Partial release of a disputed settlement, automated arbitration, or voting away another participant's rights.
- Stablecoin support in the core contract, foreign-chain contract actions, and Chain Signatures.
- Mainnet production custody, audited security claims, or unstoppable hosting claims.
- Creator token, NFT, staking, referral rewards, or promotional bonuses mixed with royalties.
- Production revenue charging, customer outreach, and actual commercial onboarding.

## Acceptance criteria

- All P0 features F-01 through F-11 pass their acceptance criteria.
- No funds or approval state are authoritative only in a browser or database.
- All negative checks in TECHNICAL_DESIGN are exercised with recorded outcomes.
- Actual NEAR AI integration runs; any deterministic fallback is explicitly labeled and does not stand in for a live-model claim.
- Native testnet transfers complete with independent receipts for every participant.
- Agent revocation is demonstrated and stale approvals cannot finalize.
- Failed or unknown transfer status never causes blind re-payment.
- Secrets and private documents are absent from logs, public routes, and repository history.
- Generated agreements are presented as approved operational terms, not certified legal instruments.
- README identifies source data, trust assumptions, model usage, simulation, and unfinished integrations.
- Reproduction steps and demo video show action to visible result.
