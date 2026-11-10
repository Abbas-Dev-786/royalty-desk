# Testnet deployment — 2026-11-10

Target: `sickhat6192.testnet` on NEAR testnet, authorized by the account holder.

- Installed CLI: `near-cli-rs 0.31.1`.
- Account view at block 277071689: 10 NEAR, 182 B storage, no contract code, one full-access key.
- Compiled WASM: `contracts/royaltydesk/target/near/royaltydesk_contract.wasm`, SHA-256 `0d4d72b7fdc2342262c5ee36d99ad29575744e6bbedbf216105754f0988d932e`.
- The account holder imported the existing on-chain full-access key into the OS keychain. The public key used to sign was `ed25519:9DPW1JaissusVbTeXMMiBwPPhzEqa3SrawdZ3xkz4mhH`.
- Deployment and initialization were sent in one transaction using `near contract deploy ... use-file ... with-init-call new base64-args ... network-config testnet sign-with-keychain send`. The initialization JSON was `{"network_id":"testnet","operator_id":"sickhat6192.testnet"}`.
- Transaction: `CshZsy29hEh9R548asV8be8SCdTR7UnKhx7mDd1gLvrd` ([testnet explorer](https://explorer.testnet.near.org/transactions/CshZsy29hEh9R548asV8be8SCdTR7UnKhx7mDd1gLvrd)). CLI reported successful deployment and `new` execution, 15.7 TGas used, and a 0.0015411276122482 NEAR transaction fee. `near transaction view-status` reported `final_execution_status: Final` and `status: SuccessValue`.
- `near contract inspect` at block 277072805 reported SHA-256 `0d4d72b7fdc2342262c5ee36d99ad29575744e6bbedbf216105754f0988d932e`, exactly matching the local compiled WASM, with 188.9 KB account storage used.
- `health` returned `{"application":"royaltydesk","last_agent_caller":null,"network_id":"testnet","operator_id":"sickhat6192.testnet"}`.
- `npm run verify:deployment -- CshZsy29hEh9R548asV8be8SCdTR7UnKhx7mDd1gLvrd` independently re-read final RPC code bytes, contract health and final transaction status; it passed and wrote `plans/evidence/artifacts/testnet-deployment.json`. `npm run release:manifest` then recorded `deployment-verified` with the same account, transaction and WASM hash.
- The ignored root `.env` now sets `NEXT_PUBLIC_CONTRACT_ID=sickhat6192.testnet`. No signing key or secret was written to the repository.

The contract deployment is verified. Live application acceptance still needs the three-owner wallet journey, funder deposit, payout receipts, and agent action evidence. No release was created on this testnet contract during deployment verification.
