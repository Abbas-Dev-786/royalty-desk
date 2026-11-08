# NEAR hackathon idea research

Research date: 7 November 2026. Working titles below are proposals, not cleared product names.

## Recommendation

Explore **Relay: autonomous recovery for paid agent jobs** first. A customer funds a bounded job; the buying agent commissions work, checks progress, replaces a failed provider, and reallocates the remaining budget under contract rules. Demonstrate this with one concrete, divisible digital service.

The strongest alternative is **Margin: an autonomous service business with enforceable refund reserves**. Choose it if the priority is a simpler prototype and a clear business narrative. **Accord: agents negotiating early invoice settlement** has a recognizable business customer but more commercial integration risk and direct competition.

These are product hypotheses supported by a landscape review. This research does not establish willingness to pay, global novelty, or production readiness. No competitor software was executed or audited.

## Research method and selection criteria

Exa searches requested 73 results across three workstreams: existing agent-commerce capabilities, documented operational problems, and candidate-specific competitor checks. Results overlap; 73 is not a count of unique companies or fully read papers. Important pages were fetched separately, and NEAR documentation was queried through Context7 using `/near/docs` and `/websites/near-intents`.

Ideas were evaluated on a concrete customer problem, autonomous economic decisions, meaningful NEAR enforcement, a visible demonstration, differentiation from existing products, and feasibility before the 14 November deadline. Feasibility assumes a tightly scoped prototype by a capable solo builder or small team; the user's team and experience are not yet known.

## What the research rules out as a sufficient differentiator

| Familiar idea | Existing evidence | Implication |
| --- | --- | --- |
| An agent wallet with spending limits | [Nevermined](https://nevermined.ai/) documents amount, purchase-count, and expiry mandates; [Coinbase Agentic Wallets](https://www.coinbase.com/developer-platform/discover/launches/agentic-wallets) describes transaction and session limits | Limits belong in our implementation, but are insufficient as the product pitch |
| A marketplace where agents hire agents | [NEAR Agent Market](https://docs.market.near.ai/) already supports hiring and subcontracting; its [October overview](https://near.ai/blog/what-is-agent-market) covers held payments and disputes | Build a specific useful agent or missing workflow; avoid recreating the marketplace |
| Escrow that pays after a verifier accepts work | [Virtuals ACP](https://whitepaper.virtuals.io/about-virtuals/commerce-layer) and [ERC-8183](https://ercs.ethereum.org/ERCS/erc-8183) describe this structure | Verification and escrow alone are established primitives |
| Pay an AI for fixing GitHub issues | [bon travail](https://bontravail.xyz/introducing) and [ResultBond](https://resultbond.com/) describe tested-work payment flows | Too much direct overlap for an undifferentiated hackathon entry |
| Provider failure compensation | [Bonded](https://github.com/successaje/bonded) describes provider collateral and automatic compensation on Arc testnet | Relay must demonstrate actual recovery and partial-work handover, beyond a refund plus penalty |
| Automatic model failover | [LiteLLM](https://docs.litellm.ai/docs/proxy/reliability) and [OpenRouter](https://openrouter.ai/docs/guides/routing/model-fallbacks) already offer fallbacks | Choosing a backup endpoint is insufficient differentiation |
| A GPU group-buying swarm | The [official swarms example](https://github.com/nearai/near-hackathon-prompt-examples/blob/main/tracks/05-swarms.md) proposes this directly | Strong theme alignment, but little distinctiveness without another substantive contribution |

The practical problem is supported by engineering documentation. [Lucid's payment model](https://docs.daydreams.systems/docs/build/payment-model) distinguishes service execution, settlement, accounting, and delivery; it documents failures after settlement and the need for separate reconciliation. [FinOps Foundation](https://www.finops.org/wg/finops-for-ai-overview/) emphasizes variable AI costs and cost per successful outcome. These support investigating recovery and financial control, but do not prove demand for these particular products.

## 1. Relay — an agent that rescues paid jobs

**Customer:** a team outsourcing repeatable digital tasks to independent service agents, where partial failure threatens a deadline.

**Initial service:** extracting structured product attributes from a batch of supplied product documents. Divide the batch into independently payable chunks. Preserve source references, units, and product identifiers. Use a controlled evaluation corpus with known answers for the demo; do not claim those tests prove general extraction accuracy.

### Proposed workflow

1. The buyer chooses a budget, deadline, acceptance rules, and permitted recovery premium.
2. Providers offer prices and capacity. A provider reserves collateral against the agreed failure terms.
3. A purchasing agent chooses a provider and reserves payment for a chunk.
4. Accepted chunks receive payment and become durable checkpoints.
5. If the provider misses a committed deadline, the agent assesses whether the remaining work can still be completed within the available budget and recovery terms.
6. It commissions only unfinished chunks from another provider. The contract prevents duplicate payment and overlapping claims to the same work.
7. A predefined, capped contribution from the failed provider's reserved collateral can cover the replacement premium. Otherwise, unused funds return to the buyer under the agreed partial-delivery policy.

**Illustrative economics, not proposed pricing:** a buyer funds $10. Provider A earns $4 for accepted chunks, leaving $6. Provider B quotes $7 to finish. A previously agreed $1 recovery contribution from A's reserved bond makes completion possible without increasing the buyer's $10 charge. Without enough available collateral or an eligible replacement, the system follows the refund/partial-delivery policy; it cannot guarantee completion.

### Where intelligence matters

The agent compares price, remaining time, provider capabilities, and observed performance. It chooses whether to retry, replace, split remaining work, or stop. A deterministic solver may do the arithmetic; the model can interpret requirements and diagnose failures. An LLM must not invent permissions or adjudicate collateral forfeiture on its own.

### Why NEAR matters

A NEAR contract holds buyer funds and reserved provider collateral, records checkpoint ownership, and enforces budgets and settlement states. Independently operated providers can inspect the same rules. Scoped function-call keys let workers invoke approved methods without authority over the owner's general wallet. Optional NEAR Intents payouts let providers receive supported destination assets after their earnings are established.

Removing the contract would replace independently enforceable shared funds with trust in our backend. NEAR is a coherent fit for this design; the concept is not impossible on another programmable chain.

### Demo and scope

Show a real batch progressing, terminate one provider, show the recovery decision, finish the remaining chunks with a second provider, and display contract balances and transaction receipts. Add one duplicate callback and one attempted unauthorized payout; both must leave balances correct.

MVP: one service, two worker processes, one buyer agent, one NEAR testnet escrow contract, one explicit verifier, one recovery path, and a dashboard. Native testnet NEAR is sufficient for real contract behavior. Label any dollar equivalents illustrative. Cross-chain settlement, open provider registration, general arbitration, and pooled insurance are extensions.

**Main risks:** verifier trust, handover compatibility, collateral economics, and providers refusing the bond requirement. On-chain timestamps can govern deadlines, but contracts do not run themselves: an external worker must submit the timeout/recovery transaction. Keep output acceptance and execution evidence explicit. A signed verifier statement remains a trusted statement unless independently verified.

**Differentiation hypothesis:** recovery of unfinished work with budget continuity and at-most-once chunk settlement. Bonds, failover, and escrow themselves are already available elsewhere.

**Tracks:** `agents`, `business`; `swarms` if independent agent coordination is substantive; `security` if enforcement and adversarial behavior are central.

## 2. Margin — an autonomous business that preserves its ability to refund

**Customer:** a small operator selling fixed-price AI services while purchasing variable-cost inference and specialist services.

**Initial service:** a catalogue localization shop that accepts an input catalogue and delivers a structured language pack. Acceptance includes required fields, preserved identifiers, numerical consistency, and designated review; these checks do not prove translation quality universally.

The business agent quotes work, reserves operating capital, hires specialists, monitors cost, delivers, and distributes earned revenue. It declines a job or stops buying services when the remaining obligations cannot be covered.

The distinctive feature is a contract-enforced separation between customer escrow, the business's operating funds, pending commitments, and distributable profit. The agent cannot spend the money promised back to customers while calling it available revenue.

**Illustrative example:** a $20 customer payment remains refundable in escrow. The business separately reserves up to $8 of its own operating capital for subcontractors. Successful acceptance releases the $20 and permits profit accounting after costs. Failure refunds the customer's $20; the business absorbs any spent operating capital. Spending the customer's entire $20 and still promising a full refund would require separate backing and must never be implied.

### NEAR integration and demo

Use a NEAR contract for per-job escrow, operating allocations, authorization, and revenue release. Restrict the business agent to approved methods. NEAR Intents becomes useful if customers and subcontractors hold different supported assets. NEAR AI Cloud is relevant if private catalogue or commercial data requires confidential inference.

Show two simultaneous orders competing for finite operating capital. Inject a supplier price increase or retry loop. The agent should select a cheaper eligible provider or reject further spending; customer refunds must remain covered. Finish one order and refund another, with a visible balance explanation.

**MVP:** one service, two paid worker adapters, two concurrent orders, one contract, and successful/failed delivery paths. All external provider charges must be covered in accounting; a contract cannot control an unrelated credit card or API credential outside its authority.

**Competition:** Nevermined already markets agent billing, mandates, and margin management, while NEAR Agent Market supports subcontracting. Our proposed distinction is demonstrating customer refund coverage and operating-capital allocation across concurrent jobs, with contract enforcement. This is a hypothesis about useful packaging, not a claim that reserve accounting is new.

**Risks:** buyer acceptance criteria, an initial need for operator capital, and a product that can appear to be a billing dashboard if the autonomous decisions are not visible.

**Tracks:** `business`, `agents`, potentially `security`.

## 3. Accord — agents negotiate when an invoice should be paid

**Customer:** a crypto-native agency and its recurring contractors, both already willing to settle in supported stablecoins.

Use only approved invoices. Each party gives its agent a mandate: acceptable discount, payment dates, recipient, and cash constraints. The agents negotiate an early-payment offer and execute only terms accepted within both mandates.

**Illustrative example:** a contractor has an approved $1,000 invoice due in 30 days and offers to accept $985 today. The buyer agent checks its reserved obligations and the contractor agent checks its minimum receipt. If both permit the deal, they sign the terms and settle. A quote that would reduce the received amount below the agreed minimum must expire or be rejected. This is a demo scenario, not financial advice.

### NEAR integration

NEAR AI Cloud can process private invoices and mandate inputs in its documented confidential-compute flow. A NEAR contract records approved obligations and prevents duplicate settlement. NEAR Intents handles conversion and delivery where parties want different supported assets or chains. The state machine must distinguish agreement, funds reserved, swap pending, paid, and refunded.

Private inference does not make public token transfers private. Keep sensitive invoice contents and negotiation inputs off-chain; even hashes and public transaction metadata need a deliberate disclosure model.

### Commercial reality and scope

[Taulia](https://taulia.com/platform/payables/dynamic-discounting/) and [C2FO](https://c2fo.com/payables-solutions/dynamic-supplier-finance/) already offer early-payment discount products. Search also surfaced Causa Prima's agent-negotiation offering in [reporting](https://pathfounders.com/p/causa-prima-raises-10m-to-let-ai-agents-negotiate); that report was not independently validated through its product API. Consequently, invoice negotiation itself is not a novelty claim.

MVP: one buyer, one contractor, three approved invoices, explicit policy inputs, signed terms, and a replayed invoice rejected. Exclude bank access, lending, ERP integrations, invoice authenticity scoring, and a general accounting platform.

**Risks:** recruiting both sides, proving that crypto settlement is useful to the target segment, protecting commercial metadata, and needing mainnet for an actual Intents swap. It has the most immediately recognizable business use but the weakest novelty case of the shortlist.

**Tracks:** `realworld`, `business`, and `privacy` only if the confidential path is implemented and verified.

## NEAR technical boundaries to preserve

- [Function-call keys](https://docs.near.org/protocol/accounts-contracts/access-keys) restrict the target contract and optionally its methods. Their allowance is a **gas** allowance, not a token-spending budget. They cannot attach NEAR. Owners first fund the contract; the contract enforces economic limits when agents call it with zero deposit.
- [1Click status](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/making-a-request) distinguishes pending, processing, success, and refund states. Successful token delivery is not evidence that a purchased service was satisfactory. A dry quote is not a settled payment.
- [Chain Signatures](https://docs.near.org/chain-abstraction/chain-signatures) involves constructing, signing, and relaying a destination-chain transaction. Add it only when a concrete foreign-chain action is needed. It does not automatically make a multi-chain workflow atomic or enforce a spending policy on arbitrary payloads.
- [NEAR AI Cloud](https://docs.near.ai/cloud/private-inference) documents attestation and response-integrity checks. Attestation identifies execution properties; it does not establish that an AI's business judgment is correct.
- [OutLayer verification](https://app.outlayer.ai/docs/trust-verification) may support an attested verifier implementation, subject to a technical spike. Do not label an ordinary server check TEE-verified.
- NEAR calls and external payouts require explicit pending/failed states, idempotency, and reconciliation. An application should not mark a payout complete merely because it requested one.

## Decision and validation

| Criterion | Relay | Margin | Accord |
| --- | --- | --- | --- |
| Autonomous economic decision | Choose and fund recovery | Accept work and allocate scarce capital | Negotiate price and timing |
| Primary NEAR value | Shared escrow, collateral, settlement rules | Escrow and enforced allocation | Agreement state and cross-chain settlement |
| Most visible demo | Worker failure followed by paid recovery | Price shock with intact refund coverage | Two agents agree and settle an invoice |
| Main difficulty | Verifier and checkpoint design | Complete liability accounting | Commercial integration and metadata privacy |
| Relative prototype scope | Medium-high | Medium | Medium-high with actual cross-chain payments |
| Recommendation | First choice | Strong fallback | Only with access to target users |

Before committing to Relay, ask three potential buyers about the last failed outsourced batch, its consequences, and how they recovered. Ask providers whether they would accept capped collateral, which failure evidence they trust, and whether their outputs can be resumed elsewhere. These interviews have not been performed.

The first technical experiment should demonstrate one accepted chunk, a missed deadline, a replacement assignment, and a rejected duplicate payout on NEAR testnet. If the acceptance rule cannot be made concrete, narrow the service before designing more infrastructure.

The strongest pitch is: **Give an agent a funded objective and enforceable boundaries; watch it adapt its spending when reality changes.**

## Event update

The live [HACKATHON.md](https://nearhackathon.com/HACKATHON.md) was successfully retrieved during this research. It retains the 14 November 2026, 23:59 UTC deadline and testnet eligibility. It now documents organizer-reviewed correction requests at `/request-changes`; the earlier local file's statement that submissions cannot be edited needs that qualification. No second submission should be sent to correct a mistake. The local event file was not modified.
