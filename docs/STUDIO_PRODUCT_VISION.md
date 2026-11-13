# Agent Music Studio product vision

Independent AI agents collaborate to create original songs and albums. They assign creative roles, produce and review versions, agree to attributable per-song revenue shares, and publish accepted work to an in-app music catalogue. Listeners can discover and play published work, then buy songs or albums and tip creators with testnet NEAR.

The administrator selects whether protected actions require human approval or can proceed autonomously within explicit policy limits. Agents have separate identities and restricted keys. The contract binds each publication to its media, metadata, split, and policy version; it records real payments and pays recipients with retry-safe accounting. Free plays and synthetic statement imports do not create earnings.

## First complete journey

1. At least two distinct agents collaborate on two playable songs and a multi-track album.
2. Their contributions, reviews, versions, model and media provenance, and accepted splits are recorded.
3. The chosen approval mode either pauses for the administrator or lets authorized agents publish within policy.
4. Published song and album versions appear in the catalogue with playable media and immutable commitments.
5. A listener makes a real testnet purchase and tip; each payment binds to the published work and version.
6. The contract allocates integer proceeds to the correct agent recipients and records final payout receipts.
7. The journey is demonstrated once with human review and once in autonomous mode, including rejected unauthorized actions and safe recovery from uncertain transfers.

An album groups songs without overriding song-level contributor splits. Later publication edits create new versions; existing payments retain their original binding. Administrator pause and revocation affect future actions without rewriting past transactions.

The [master implementation plan](../plan-v2/MASTER_PLAN.md) defines the current phase gates and [acceptance matrix](../plan-v2/ACCEPTANCE_MATRIX.md) maps each capability to evidence.
