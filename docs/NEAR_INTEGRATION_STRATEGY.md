# NEAR integration strategy for the agent-led music studio

Status: design direction, not an implemented feature list. Use alongside [the studio product vision](STUDIO_PRODUCT_VISION.md) and [studio master plan](../plan-v2/MASTER_PLAN.md). This document was checked against the local NEAR skills and NEAR Docs MCP on 2026-11-11; recheck live docs before implementation.

“Use NEAR at its full potential” means making its capabilities solve the studio's actual problems: attributable agent actions, configurable autonomy, real listener payments, immutable split commitments, and recoverable payouts. Adding unrelated protocols would make the demo harder to verify without improving those outcomes.

## Core architecture

| Studio need | NEAR capability | Concrete behavior |
| --- | --- | --- |
| Distinct AI creators | Named agent accounts or subaccounts, with separate access keys | Each agent has an on-chain identity. The worker holds only a [function-call key](https://docs.near.org/protocol/accounts-contracts/access-keys#function-call-keys) limited to the studio contract and allowed methods. An administrator keeps recovery authority outside the worker. |
| Admin-selectable autonomy | Versioned contract policy | The contract checks `human_review` versus `autonomous` mode, agent identities, method scope, budgets, and effective policy version before accepting a split, publication, or financial action. Admin can pause/revoke future actions. |
| Agent collaboration | NEAR AI Cloud inference plus persistent jobs | NEAR AI proposes briefs, lyrics, roles, revisions, splits, and review decisions. The worker records model, input/output hashes, task, agent identity, and validated action. [TEE attestation and response signatures](https://docs.near.ai/cloud/verification) can be added where supported; they attest execution origin, not musical quality or economic correctness. |
| Published song/album integrity | Contract-held commitments and event logs | Store hashes of the approved audio/artwork/metadata, album track list, split version, publication version, and policy version. Keep large media off-chain and serve it from durable content-addressed storage; [NEAR storage staking](https://docs.near.org/protocol/storage/storage-staking) makes raw audio on-chain an expensive default. |
| Listener purchases and tips | Payable NEAR contract methods | Listener wallet pays the song/album price or tip. The contract binds payment to work ID, publication version, buyer, amount, and split; it records an idempotent revenue event. A free play creates no earnings. |
| Agent earnings | Contract ledger and native transfers | Allocate integer proceeds to agent recipients under the committed split. Record each transfer as pending before dispatch and settle it from a [private callback](https://docs.near.org/smart-contracts/security/cross-contract-calls/refunds). A failed or unknown outcome remains owed or unresolved and cannot be blindly replayed. |
| Usable web app | NEAR wallet login, contract views, and indexed events | Administrator and listener sign in with testnet wallets. Read final contract state for sales, tips, balances, and payment receipts. Use an indexer for activity views, with chain state still authoritative. |

### Two transaction paths

1. **Listener purchase or tip:** the listener signs a payable call and attaches testnet NEAR to the studio contract. An agent's function-call key cannot attach NEAR, so it is not used for this step. The contract verifies the price, work version, and unique order/tip ID before crediting revenue.
2. **Agent publication or payout trigger:** the agent signs a zero-deposit call using its restricted key. The contract checks the administrator's policy and acts on already escrowed funds or stored assets. A function-call key cannot directly transfer NEAR or call another receiver; the contract controls recipients and amounts. [Access-key rules](https://docs.near.org/protocol/accounts-contracts/access-keys#function-call-keys).

That separation is central to autonomous mode: agents can operate the studio within explicit rules without receiving a broad wallet key or the ability to invent revenue.

## AI and music generation

Use NEAR AI Cloud for the multi-agent reasoning, review, artwork generation if suitable, and optionally audio **transcription**. Its current [specialized endpoint documentation](https://docs.near.ai/cloud/guides/specialized-endpoints) lists audio transcription, not a music-generation endpoint. A separate music-generation provider or model is needed for the actual playable songs. Verify its API, output quality, publishing rights, and cost before claiming that songs were generated autonomously. Record the provider and file provenance alongside the NEAR AI collaboration trace.

## Integrations that need a real use case

| Capability | When it improves this product | Boundary |
| --- | --- | --- |
| NEAR Intents | Cross-chain listener checkout or payouts after the native NEAR purchase and royalty flow works. | The hackathon's [live rules](https://nearhackathon.com/HACKATHON.md) say Intents has no testnet. A real route requires separately authorized mainnet funds, binding of quote/destination to the work and recipient, and refund/unknown-status handling. A dry quote is only a preview. |
| Chain Signatures | An agent must perform an actual, justified action on another chain, such as a supported cross-chain payout or external platform account operation. | Do not add foreign-chain signing merely to increase an integration count. Define the transaction policy and recovery first. |
| Agent Market | A studio agent hires an external specialist for a bounded task (for example mastering or artwork) and pays on accepted delivery. | Show the specialist's actual work, budget, acceptance condition, and payment. A model routing call alone is not an agent economy. |
| NFTs | A purchased edition needs transferable ownership or access rights with behavior. | A catalogue song does not require an NFT. If added, keep ownership, music rights, and revenue participation separate. [NFT metadata](https://docs.near.org/primitives/nft/standard) can point to off-chain media. |
| Gas keys or relayers | Agent jobs create enough parallel transactions or listener onboarding needs sponsored gas. | Add after measuring actual throughput and validating supported wallet/provider behavior. See [access keys](https://docs.near.org/protocol/accounts-contracts/access-keys). |

## Evidence for a NEAR-centered demo

At minimum show: two separate agent accounts, a policy switch from human review to autonomous mode, a trace of two agents collaborating, an on-chain publication/split commitment, a testnet listener purchase and tip, exact ledger allocations, and final payout receipts. Show a revoked agent call failing and a duplicate payment remaining single. The demo should distinguish NEAR AI reasoning from the external audio-generation service and show that real listener payments, rather than CSV figures, back the payouts.

The studio contract implements its own authority, publication, commerce, and payout state. Verify listener commerce and autonomous publishing against the studio contract rather than relying on historical accounting behavior.
