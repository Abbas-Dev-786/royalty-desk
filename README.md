# RoyaltyDesk

RoyaltyDesk is an evidence-backed royalty administration prototype for NEAR testnet. Owners approve agreement versions, delegate bounded settlement authority to separate agent accounts, review private statement evidence, and distribute native NEAR using contract-enforced accounting.

## Requirements

- Node.js 24 or newer and npm 11.
- Docker Desktop using Linux containers for Rust/contract builds and sandbox tests. Rust is not required on the host.
- A NEAR testnet wallet for browser authentication and owner actions.
- A funded NEAR AI Cloud API key only for the live inference check.

## Fresh setup

```powershell
Copy-Item .env.example .env
# Edit .env with a testnet contract ID and local secrets (never commit .env).
npm ci
npm run check
npm run build
```

The contract build writes `contracts/royaltydesk/target/near/royaltydesk_contract.wasm`. After an initial deployment to the configured testnet account, verify the live code, initializer, and final transaction receipt, then generate the manifest:

```powershell
npm run verify:deployment -- <deployment-transaction-hash>
npm run release:manifest
```

For an existing contract, use a deployment without an init call so its state is preserved. Verify the upgrade transaction and regenerated manifest with:

```powershell
near contract deploy <contract-account.testnet> use-file contracts/royaltydesk/target/near/royaltydesk_contract.wasm without-init-call network-config testnet sign-with-keychain send
npm run verify:deployment -- <upgrade-transaction-hash> --upgrade
npm run release:manifest
```

The current testnet deployment is `sickhat6192.testnet`; its verified upgrade and preserved settlement state are recorded in `plans/evidence/TESTNET_UPGRADE_2026-11-10.md`. Set `NEXT_PUBLIC_CONTRACT_ID` to the account used in your own environment.

The manifest marks deployment verified only when the live verification artifact matches its contract ID and WASM hash. Account-key custody remains with the operator.

## Development

Run the web app and worker in separate terminals:

```powershell
npm run dev:web
npm run dev:worker
```

Delegated agent actions require `ROYALTYDESK_AGENT_KEYSTORE_PATH` and a private `ROYALTYDESK_WORKER_TOKEN` of at least 32 characters. The keystore directory must contain one private JSON file per delegated account, named `<agent-account-id>.json`, with `public_key` and `private_key` or `secret_key` fields. Each key must be a function-call key restricted on NEAR to this contract and the intended agent methods. Keep this directory outside the repository and verify its permissions before starting the worker. Without a configured keystore, live model recommendations return for human review without signing.

The worker saves signed transaction bytes and hash before broadcast. An ambiguous outcome remains pending reconciliation and is never sent again under the same operation ID. The worker checks pending transaction identities at startup and every 15 seconds.

Open the web URL, connect a testnet wallet, and use the owner workspace. The worker accepts only loopback agent requests protected by `ROYALTYDESK_WORKER_TOKEN` when configured.

## Verification

```powershell
npm run verify:release
npm run test:live
```

`verify:release` runs the build, contract, domain, server, agent, recovery, browser, sandbox, and fault-injection suites. It writes a sanitized report to `plans/evidence/artifacts/release-suite.json`. Live inference is separate because it consumes paid gateway credit.

## Security and scope

Use testnet only. Never commit wallet keys, API keys, cookies, private statements, SQLite files, or populated private storage. Contract state—not the UI or database projection—is authoritative for approvals, mandates, reserves, entitlements, and receipts.

The MVP supports participant-reviewed NEAR-denominated statements and synthetic fixtures. It does not authenticate Spotify earnings, provide legal certification, guarantee hosted-agent confidentiality, or enable mainnet spending. Intents, inference attestation, and Spotify metadata remain optional follow-up integrations.
