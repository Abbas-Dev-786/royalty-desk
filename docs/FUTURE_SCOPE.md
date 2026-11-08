# RoyaltyDesk — Future Scope

Status: proposed future capabilities, outside the current product scope. Date: 2026-11-07.

Baseline: [CURRENT_SCOPE](CURRENT_SCOPE.md). Product intent: [PRD](PRD.md). Architecture: [TECHNICAL_DESIGN](TECHNICAL_DESIGN.md). Acceptance catalogue: [FEATURES](FEATURES.md).

## Scope prerequisites

Each proposed capability has prerequisites covering customer need, data access, trust assumptions, and verification criteria. The sections below group capabilities by product area rather than delivery sequence.

## Financial inputs and payouts

### Distributor and label adapters

Support actual authorized statement exports, starting with one distributor format and a real redacted client example. Preserve platform, territory, earning period, reporting period, fees, currencies, and corrections. Add automated imports only where authorized APIs or delivery mechanisms exist.

Prerequisites: documented access; repeatable reconciliation against provider totals; duplicate/correction semantics; customer permission; no assumption that Spotify catalogue API provides royalty statements.

### Stablecoin settlement and currency conversion

Support a selected NEAR fungible token, then an explicit foreign-currency-to-settlement-asset model. Separate reported revenue from cash received, conversion rate/time, fees, and distributable amount. Test token registration, callbacks, failed transfers, and conservation in each asset.

Prerequisites: independently verified accounting examples; tested token contract; participant acceptance of funding and fee treatment; no implicit stream-to-money conversion.

### One supported cross-chain payout

F-12 expands from a conditional integration to reliable Intents execution. Entitlements bind to an approved recipient, asset, network, maximum input, fee policy, quote, and refund destination. Settlement and refunds are asynchronous, with obligations retained until resolved.

Prerequisites: authorization survives the entire adapter path, actual destination receipts, recovery from ambiguous status, and explicit authorization for mainnet funds. Expand routes individually after support is verified.

### Richer analytics

Import authorized stream/audience exports and show comparisons across periods. Analytics inform explanations but do not replace reported royalty earnings. Estimated earnings, if later introduced, require clear assumptions and must never become payable balances.

Prerequisites: provider permissions, documented data retention, provenance, and no misleading fixed per-stream rate.

## Collaboration administration

### Multiple releases and large catalogues

Scale membership, agreement indexing, reporting, batch imports, and jobs. Migrate from the single-host persistence design when concurrent workload requires it. Keep contract operations bounded and paginate entitlements.

Prerequisites: representative volume tests, explicit storage costs, and recovery of partial batch failures.

### Composition and publishing workflows

Model composition ownership separately from recording participation. Distinguish songwriters, publishers, collection organizations, and payment sources. Never reuse a recording split as an assumed publishing split.

Prerequisites: specialist domain review, suitable data, approved agreements, and validated role/rights semantics. This is a distinct product expansion.

### Complex recoupment and deductions

Support multiple advances, expense categories, caps, territory rules, term changes, and correction periods. Model dependencies and when charges become authorized. Keep the system explainable with independent financial test vectors.

Prerequisites: precise arithmetic and temporal rules; real examples; approval requirements for each deduction; correction and clawback policy.

### Partial release and disputes

Release only clearly uncontested amounts when agreements permit it. Add dispute deadlines, evidence exchange, designated review roles, and documented resolution authority. An agent disagreement is not a legal judgment.

Prerequisites: formal reserved-amount accounting, no prejudicial release of disputed entitlements, and an agreed exit path if parties refuse to cooperate.

### Professionally reviewed documentation and signing

Integrate reviewed agreement templates, identity verification where needed, signature evidence retention, and an appropriate electronic-signature provider if the use case demands it. Wallet approval remains an account action, not a universal guarantee of legal enforceability or ownership.

Prerequisites: jurisdiction-specific professional advice and an agreed service responsibility model. No claim of legal validity based only on putting a hash on-chain.

## Personal representatives

### User-controlled hosting and custody

Allow a participant to operate their own agent and signer, or use verified confidential execution. Define compatibility for shared evidence, proposals, mandates, and callbacks. A separate hosted process is not independent custody by itself.

Prerequisites: key isolation, revocation tests, interoperable message schemas, and explicit operator/attestation trust assumptions.

### Specialist subcontracting

Hire a scoped specialist agent for statement normalization or anomaly analysis, potentially through NEAR Agent Market. Assign a separate operating budget and objective acceptance criteria. Customer royalty reserves cannot silently finance service-company expenses.

Prerequisites: actual service availability, paid-work authorization, idempotent settlement, and useful results beyond routing to another model.

### Recovery and operating-capital controls

Adapt the previous Relay/Margin research internally: reassign failed specialist tasks, retain approved work, and cap service costs while preserving customer obligations. No provider bond or compensation promise without funded collateral and explicit rules.

Prerequisites: one real need in the administration workflow and a verifiable completion/refund contract.

### Chain Signatures

Consider only when participants need RoyaltyDesk to perform an actual action on a supported external chain, beyond an Intents conversion/payout. Validate the transaction semantics before authorizing a signature; arbitrary transaction hashes are not safe spending policies.

Prerequisites: concrete foreign-chain operation, constrained signing path, nonce/gas handling, relay and reconciliation tests. It is not a required integration count booster.

## Commercial service operations

### Commercial pilots

Interview independent labels and creator collectives, process redacted historical statements in shadow mode, compare with their accepted calculations, and measure review time and errors. Obtain explicit authority before changing accounts, contacting collaborators, or moving money.

Prerequisites: a specific buyer, evidence of repeated need, agreed success definition, and willingness to pay. No claim of product-market fit from hackathon judging.

### Production security and operations

Independent contract review, least-privilege infrastructure, protected deployment keys, monitoring, incident response, backup restoration, privacy controls, upgrade governance, and limits suited to real funds. Resolve callback liveness and safe recovery before expanding money at risk.

Prerequisites: documented threat model, remediation of findings, failure drills, and small authorized pilots. A successful testnet demo is not a security audit.

### Service pricing and accounting

Validate per-release/per-period fees, specialist-review pricing, company cost tracking, and transparent invoicing. Distinguish royalties, operational spending, service revenue, and any refunds. Never treat processed payment volume as revenue.

Prerequisites: measured unit economics including failed attempts and human time, clear client approval of fees, and appropriate professional advice for the actual operating jurisdiction.

### Separate rewards or incentives

If creators later want referral bonuses, campaign rewards, or patronage payouts, define an independently funded pool and explicit eligibility. Do not dilute contractual royalties or label bonus tokens as streaming revenue.

Prerequisites: real customer need, separate funding/accounting, verifiable rules, and no dependence on speculative token value.

## Not planned without new justification

A general token launch, compulsory NFTs for royalty ownership, all-chain support, a replacement streaming platform, fully automatic legal arbitration, and an unrestricted autonomous treasury. These are not necessary to deliver royalty administration and would substantially change the product.
