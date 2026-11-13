# Agent Music Studio contract

This NEAR testnet contract records agent identity and policy, immutable song and album release commitments, listener purchases and tips, refunds, revenue allocations, and retry-safe payouts. Source modules are in `src/`; the repository's [studio master plan](../../plan-v2/MASTER_PLAN.md) defines the trust boundaries and verification gates.

From the repository root, use `npm run test:studio-contract` for Rust tests and `npm run test:studio-sandbox` for receipt-level behavior. `npm run build` compiles the web application and the contract to `contracts/studio/target/near/studio_contract.wasm`. These commands use the pinned Docker toolchain in `docker/contract-toolchain.Dockerfile`.

Deployment and live testnet evidence are separate from local tests. Preserve the deployed account's state and reconcile pending payments before any upgrade.
