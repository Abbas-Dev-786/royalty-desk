# Testnet contract upgrade - 2026-11-10

- Network/account: NEAR testnet, `sickhat6192.testnet`.
- Previous deployed WASM SHA-256: `0d4d72b7fdc2342262c5ee36d99ad29575744e6bbedbf216105754f0988d932e`.
- New WASM SHA-256: `c319324997714c43ba10712a00487cfb125bd5ee7e8d7e49e5154b61604b7a3f` (188702 bytes).
- Preflight: the previous code was downloaded and hash checked in the ignored local contract target backup directory. The known release `live-261110-01` had three accepted owners, active agreement version 1, and a completed `2026-11` settlement with no unpaid entitlement or refund. The contract's persisted state layout was unchanged.
- Offline gate: `npm run verify:release` passed all 11 suites (check, build, domain, contract, contract regressions, server, agents, recovery, HTTP E2E, sandbox, and fault injection). Report: `plans/evidence/artifacts/release-suite.json`, source tree hash `bad960553414510828b4c46d8d38136b670ad7b4b5e48c6bf4666c208ded87f5`.
- Upgrade command: `near contract deploy sickhat6192.testnet use-file contracts/royaltydesk/target/near/royaltydesk_contract.wasm without-init-call network-config testnet sign-with-keychain send`.
- Finalized transaction: `BRHdcjbqqD5GAk9aXkTuNmmiQTRf4JtcVGSY5tFUjPio` ([testnet explorer](https://explorer.testnet.near.org/transactions/BRHdcjbqqD5GAk9aXkTuNmmiQTRf4JtcVGSY5tFUjPio)). CLI reported success, 14.3 TGas used, and a 0.0014056320715986 NEAR fee.
- Verification: `npm run verify:deployment -- BRHdcjbqqD5GAk9aXkTuNmmiQTRf4JtcVGSY5tFUjPio --upgrade` passed. It compared final RPC code bytes with the local WASM, checked contract health and transaction success, and confirmed that the upgrade transaction contained no initializer. `npm run release:manifest` recorded `deployment-verified` for the new hash.
- Independent final-state read: `health` still reports `application=royaltydesk`, `network_id=testnet`, `operator_id=sickhat6192.testnet`. Release `live-261110-01` still has three accepted owners, agreement version 1, and exactly one active agreement. Settlement `2026-11` remains `Complete`, with `100000000000000000000000` yoctoNEAR deposited and paid, and zero refundable or unpaid yoctoNEAR. Post-upgrade account storage usage was 191379 bytes.

The account ID and ignored local `.env` stayed the same. This upgrade verifies code identity and continuity of the sampled live release; it does not complete the outstanding browser-wallet or fresh-checkout acceptance work.
