# Live NEAR testnet journey — 2026-11-10

The deployed RoyaltyDesk contract `sickhat6192.testnet` completed a synthetic three-owner settlement for release `live-261110-01`, period `2026-11`. This was test data and testnet NEAR, not real royalty revenue.

## Identities and authority

- Funder and administrator: `sickhat6192.testnet`.
- Owners: `rd1-261110.sickhat6192.testnet`, `rd2-261110.sickhat6192.testnet`, `rd3-261110.sickhat6192.testnet`. Each accepted membership and approved the frozen agreement with its own account key.
- Owner 2 granted `rdagent-261110.sickhat6192.testnet` a mandate limited to `approve_settlement`, agreement version 1, a 0.1 NEAR gross ceiling, and a 24-hour expiry. The agent's on-chain function-call key is restricted to `approve_settlement` and `dispute_settlement` on the contract, with a 0.2 NEAR gas allowance. Its private key resides outside the repository.
- The model `z-ai/glm-5.3-flash` returned `recommend_approval` for settlement digest `5956c5f649941e25b46737c819f155794282ba677fddcfdcd1c2ca1211e678c7`. The real worker policy and restricted signer submitted owner 2's delegated approval. [Approval transaction](https://testnet.nearblocks.io/txns/EeAu3ayr38KhStTsdHv71xuEGAR8zBRCo1fz92BcKZ64) finalized with `SuccessValue` under the restricted public key `ed25519:FrguQGMteswgLqMKLuDgusM2sNQL61kFWvR5VMNbhp9r`.

## Settlement transactions

| Step | Transaction |
| --- | --- |
| Create release | [873a5JDRn1UG9fNJBFW46Q4TNaeTjFF8Ubgi67iQQsKy](https://testnet.nearblocks.io/txns/873a5JDRn1UG9fNJBFW46Q4TNaeTjFF8Ubgi67iQQsKy) |
| Owner 1 approval | [6pysopCMoam5ajBLYZz5ggADcR5ukAdBcnVEqgWWepwG](https://testnet.nearblocks.io/txns/6pysopCMoam5ajBLYZz5ggADcR5ukAdBcnVEqgWWepwG) |
| Owner 3 approval | [25338dG8XgqikYmeX2Hdbuntnf78dqJWJPCwit9rE2BM](https://testnet.nearblocks.io/txns/25338dG8XgqikYmeX2Hdbuntnf78dqJWJPCwit9rE2BM) |
| Fund 0.1 NEAR | [3FFbTEZheHmpkmB3g9qttLnx8AKAuTnQEU3je67WhSW1](https://testnet.nearblocks.io/txns/3FFbTEZheHmpkmB3g9qttLnx8AKAuTnQEU3je67WhSW1) |
| Finalize | [A6sJB8BeCNm9xWyjaRjRgUZqcQGoBxyGXibW7tjJjEPy](https://testnet.nearblocks.io/txns/A6sJB8BeCNm9xWyjaRjRgUZqcQGoBxyGXibW7tjJjEPy) |
| Owner 1 payout, 0.068 NEAR | [3EDYMdbD8HLbaAmaUgvs5wYpR5snHbFMKXNgabWrw3Dk](https://testnet.nearblocks.io/txns/3EDYMdbD8HLbaAmaUgvs5wYpR5snHbFMKXNgabWrw3Dk) |
| Owner 2 payout, 0.020 NEAR | [3926J6h6J2ArdRMHTZC7mhnNRqLgPhf1kDYqjq1FgvB1](https://testnet.nearblocks.io/txns/3926J6h6J2ArdRMHTZC7mhnNRqLgPhf1kDYqjq1FgvB1) |
| Owner 3 payout, 0.012 NEAR | [5coGfjQWzNWRKrhhJEpGAEjauoS4TJqJdFgAM6BsB35k](https://testnet.nearblocks.io/txns/5coGfjQWzNWRKrhhJEpGAEjauoS4TJqJdFgAM6BsB35k) |

The final independent `get_settlement` read returned `Complete`, `total_deposited_yocto = successful_payouts_yocto = 100000000000000000000000`, and three `Paid` entitlements of `68000000000000000000000`, `20000000000000000000000`, and `12000000000000000000000` yoctoNEAR. The deposit and payout totals match exactly.

## Recovery observation

The first live inference returned no usable content at a 500-token output budget. A second request hit the worker's former 20-second timeout. The third produced the valid approval and a successful chain operation, but the 30-second durable job lease expired before the result was persisted. The finalized on-chain transaction and persisted signed operation were checked before repairing that local job record; the approval was not resent. The worker now heartbeats its lease during a live run, and the model client allows 120 seconds.

Local ignored journal: `plans/evidence/artifacts/live-testnet-journey.json`. Local ignored agent database: `plans/evidence/artifacts/live-agent.sqlite`. These contain test-run records, not keys. The private agent key is stored outside the repository.

## Verification boundary

This proves a live CLI account flow, real NEAR AI Cloud inference, a delegated restricted-key approval, and final native testnet payouts. It does not prove the browser wallet connection, web form/API path, or independent TEE attestation. Those acceptance checks remain open.
