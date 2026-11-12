# RoyaltyDesk — Product Requirements Document

Status: implementation baseline v0.1; not an implemented product. Date: 2026-11-07.

**Scope update (2026-11-11):** this PRD describes the earlier royalty-administration prototype. The project owner's current [agent-led music studio vision](PRODUCT_VISION_ALIGNMENT.md) requires a new product journey and [implementation plan](../plans/AGENT_MUSIC_STUDIO_IMPLEMENTATION_PLAN.md).

## Document map

- [Current scope](CURRENT_SCOPE.md): current product boundary and acceptance criteria.
- [Features](FEATURES.md): feature IDs, permissions, and acceptance criteria.
- [Technical design](TECHNICAL_DESIGN.md): architecture, contract states, data, and verification.
- [Future scope](FUTURE_SCOPE.md): deferred capabilities and their prerequisites.

CURRENT_SCOPE defines the included capabilities, this PRD defines intended user behavior, and TECHNICAL_DESIGN describes the architecture and implementation details.

## 1. Product definition

RoyaltyDesk is an AI-native royalty administration service for independent music collaborations. Each participant has an account and a personal agent. Agents help negotiate recording-revenue agreements, examine reported earnings, challenge unsupported deductions, and approve routine settlements within participant-defined mandates. NEAR contracts enforce agreement approvals, delegation, funded reserves, and payout accounting.

Customer promise: **We administer your collaboration from agreed recording-revenue terms to evidence-backed, authorized payouts.**

The customer buys completed administration, not access to a conversation simulator. The initial deliverable is an approved agreement, a checked settlement, and receipts for the funded distribution. The first implementation is a hackathon prototype; it does not establish legal ownership, replace a distributor, or collect all music royalties automatically.

## 2. Problem

Collaborators can have fragmented agreements, inconsistent statements, unclear deductions, and limited visibility into how their share was calculated. A coordinator may prepare payments, but every affected person needs an understandable way to check the evidence and protect their interests.

Automatic splitting alone does not solve evidence, amendments, or authorization. RoyaltyDesk combines participant-specific representation with common enforceable settlement rules. Differentiation is a product hypothesis; existing distributors and royalty platforms already offer split payments.

## 3. Users and responsibilities

| Persona | Need | Authority |
| --- | --- | --- |
| Release creator / administrator | Organize a release and its reporting | Invite participants, prepare proposals, import statements; cannot rewrite approved shares alone |
| Collaborator / producer / performer | Understand and protect their recording-revenue entitlement | Approve terms, set agent mandate, dispute calculations, receive funds |
| Funding party | Deposit money for an identified reporting period | Fund the reserve; cannot reclaim finalized entitlements |
| Personal agent | Represent one participant under explicit instructions | Propose terms, check evidence, approve or dispute within a current mandate |
| Coordinator agent | Move administration toward completion | Collect proposals, validate completeness, prepare settlement; cannot manufacture participant consent |
| RoyaltyDesk operator | Run the service | Operate infrastructure and assist exceptions; no application-level bypass of contract approval rules |

One human can hold multiple roles. MVP agent workers are hosted by RoyaltyDesk; separate prompts and credentials do not make them independently operated organizations. Users must see this hosting trust boundary.

## 4. Goals and non-goals

### Goals

1. Complete one recording-revenue lifecycle with three participants and real NEAR testnet transactions.
2. Show useful multi-agent behavior: proposal, counterproposal, evidence check, objection, and revision.
3. Make NEAR the authority for approved agreements, agent mandates, reserves, and settlement.
4. Demonstrate rejection of unauthorized deductions, stale/revoked authority, and duplicate execution.
5. Give users a comprehensible calculation, reason for every hold, and final receipts.
6. Provide reproducible fixtures, deterministic checks, and an honest account of live versus simulated integrations.

### Non-goals for this release

Publishing/composition royalties, copyright adjudication, industry-wide licensing, automatic Spotify earnings withdrawal, production banking, legal signature certification, arbitrary distributor connectors, NFT ownership, token incentives, and fully decentralized agent hosting. See [future scope](FUTURE_SCOPE.md).

## 5. Product principles

- People approve economic rights and material amendments; agents administer only what they are authorized to administer.
- Financial amounts and permissions are checked deterministically, regardless of what an agent says.
- Reported revenue, estimated analytics, and funded cash are distinct concepts and visibly separate.
- A statement hash proves which file was used, not whether its contents are true.
- A disputed settlement remains held until explicitly resolved; the MVP does not partially release it.
- Private instructions are not visible to other participants or passed to their agents.
- Exceptions and disagreement are supported outcomes. Agents are never required to reach an agreement.
- Avoid unsupported guarantees: confidential inference is not correctness proof; wallet approval is not proof of music ownership.

## 6. Primary journey

### A. Join a release

The creator connects a NEAR testnet wallet, creates an application profile, and creates a release. They invite two collaborators, who connect their own wallets and accept. A Spotify link and ISRC may be entered manually. Importing metadata is optional.

Each participant receives a distinct personal agent profile and can enter private preferences. They separately authorize any on-chain agent mandate. Creating an app profile does not silently create, control, or fund a mainnet wallet.

### B. Negotiate and approve

The creator proposes recording-revenue shares. Agents exchange bounded structured proposals and explanations. The UI shows a proposal history, percentages, approved deduction rules, and unresolved questions. Percentages must total 100%.

The parties review the generated agreement text alongside its structured payment rules. All required humans approve the same frozen version with their wallets. An agreement becomes active only after all approvals are confirmed on-chain. A changed proposal requires fresh approvals.

### C. Delegate routine administration

Each participant can authorize their personal agent for a release and agreement version, with an expiry, permitted methods, a maximum settlement amount in the settlement asset, and a designated on-chain agent identity. Changing rights or destinations remains a human action. Revocation takes effect for subsequent authorization checks.

### D. Import and review a statement

The administrator uploads the supported CSV and identifies its reporting period. The service validates fields, checks duplicates and identifiers, and computes a proposed settlement. Each personal agent checks the same evidence against the agreement, while retaining its private instructions.

For the canonical demo, a submitted deduction is not permitted by the approved rules. An agent identifies it with a row reference and raises a dispute. The draft cannot become payable. A human reviews the correction; participants explicitly clear their disputes and approve the corrected revision.

### E. Fund and pay

The funding party deposits actual testnet NEAR into that release-period reserve. All statement and demonstration amounts use NEAR consistently in the canonical fixture. The UI states that this is a synthetic statement demonstrating the workflow, not a real distributor payout.

The contract checks funding, approved rules, the exact settlement revision, the required current approvals, and absence of disputes. It finalizes immutable entitlements. An agent can trigger transfers to the approved participant accounts. Each transfer has its own pending/succeeded/failed status. The UI shows paid only after confirmed completion.

## 7. Information and screen requirements

| Screen | Required information and actions |
| --- | --- |
| Account | Connected account/network, wallet authentication, display profile |
| Release workspace | Recording identity, participants, roles, agreement status, reporting periods |
| Agent settings | Private preferences, on-chain identity, mandate scope, expiry, revoke action |
| Negotiation | Structured offers, concise rationales, differences, round limit, approval readiness |
| Agreement review | Full document, structured rules, hash/version, each human approval and receipt |
| Statement review | Source/fixture label, validated rows, totals, duplicates, deductions, evidence references |
| Settlement | Revision, individual approvals, disputes, funded/required amount, finalize readiness |
| Payouts | Entitlements, pending and completed transfers, retry eligibility, transaction links |
| Activity | Human actions, agent decisions, contract outcomes, errors, correlation identifiers |

Show concise decision summaries and evidence, not hidden model chain-of-thought. Never display secrets, complete private instructions, or another participant's private documents without permission.

## 8. Requirements and acceptance

Feature-level requirements use F-01 through F-14 in [FEATURES](FEATURES.md). P0 items are required for the intended MVP. P1 items are conditional enhancements, not claims of completed integrations.

The release passes only when:

- Three distinct participants approve the same agreement version.
- The coordinator cannot approve on behalf of another participant.
- At least one actual model run creates a useful proposal or objection with valid evidence references.
- An unsupported deduction blocks the settlement and produces a visible explanation.
- A corrected revision cannot reuse approvals of an earlier revision.
- Expired/revoked delegation cannot approve or finalize through stale authority.
- Funded entitlements conserve the deposited distributable amount under defined rounding.
- Reimporting the fixture or replaying settlement cannot create duplicate payment.
- A transfer failure keeps the entitlement recoverable without a second successful payment.
- Unauthorized viewers cannot read another participant's private preferences.
- All financial evidence and simulated data are accurately labeled.

## 9. Metrics

Measure during fixtures and demo runs: completion rate, failed authorization attempts correctly blocked, duplicate payments (target zero), unallocated unit discrepancy (target zero), agent turns, model/tool cost per case, human interventions, time from import to reviewed proposal, and time from authorization to confirmed payouts. Do not claim business ROI or industry accuracy from synthetic fixtures.

## 10. Business model hypothesis

Charge per administered release or completed royalty period, with optional separately scoped human review. Final pricing is undecided. MVP shows a clearly labeled illustrative service invoice/cost summary if time permits; it does not deduct a hidden service fee from collaborator funds. Service fees, promotion rewards, and royalty principal remain separate.

## 11. Trust and risks

The statement uploader is an explicit source of external financial evidence. Participant approval does not make the source independently verified. The operator hosts the agents and can affect their observations. Contract code and deployment keys are additional trust boundaries; the testnet deployment is unaudited. Define key custody and deployment privileges in the implementation README.

Key technical risks include wallet delegation support, contract accounting and callbacks, private inference availability, and evidence ingestion. A working demo does not establish production readiness.

## 12. Reference material

- [Project research](../AI_NATIVE_SERVICE_COMPANIES_RESEARCH.md)
- [Hackathon overview](../HACKATHON.md)
- [Spotify royalty flow](https://support.spotify.com/us/artists/article/understanding-spotify-royalties/)
- [Spotify analytics exports](https://support.spotify.com/us/artists/article/exporting-data/)
- [NEAR access keys](https://docs.near.org/protocol/accounts-contracts/access-keys)
- [NEAR AI private inference](https://docs.near.ai/cloud/private-inference)

This documentation describes the product and its engineering requirements; it is not a legal royalty agreement.
