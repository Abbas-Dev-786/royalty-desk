# RoyaltyDesk

RoyaltyDesk is an evidence-backed royalty administration prototype for NEAR testnet. Owners approve agreement versions, delegate bounded settlement authority to separate agent accounts, review private statement evidence, and distribute native NEAR using contract-enforced accounting.

**Product direction:** the project owner intends an agent-led music studio where AI agents create songs and albums, publish to an in-app catalogue, and split revenue. This repository currently implements the royalty-administration prototype described below. See [product vision alignment](docs/PRODUCT_VISION_ALIGNMENT.md) and the [NEAR integration strategy](docs/NEAR_INTEGRATION_STRATEGY.md) for the gap and the proposed first complete studio journey.

The new implementation baseline is [plan v2](plan-v2/MASTER_PLAN.md). Its Phase 00 baseline and Phase 01 domain/persistence work are verified locally; later studio phases remain unimplemented. The v2 evidence records distinguish new studio checks from the older royalty prototype.

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

The web workspace uses shadcn/ui with Tailwind CSS v4. Its configuration is in `apps/web/components.json`; generated components live in `apps/web/src/components/ui`. Add another component from that workspace with `npx shadcn@latest add <component>`.

Run the web app and worker in separate terminals:

```powershell
npm run dev:web
npm run dev:worker
```

Delegated agent actions require `ROYALTYDESK_AGENT_KEYSTORE_PATH` and a private `ROYALTYDESK_WORKER_TOKEN` of at least 32 characters. The keystore directory must contain one private JSON file per delegated account, named `<agent-account-id>.json`, with `public_key` and `private_key` or `secret_key` fields. Each key must be a function-call key restricted on NEAR to this contract and the intended agent methods. Keep this directory outside the repository and verify its permissions before starting the worker. Without a configured keystore, live model recommendations return for human review without signing.

The worker saves signed transaction bytes and hash before broadcast. An ambiguous outcome remains pending reconciliation and is never sent again under the same operation ID. The worker checks pending transaction identities at startup and every 15 seconds.

Open the web URL and connect a testnet wallet. The workspace separates release creation, owner invitations, agreements, statements, payments, and agent permissions into guided pages. The worker accepts only loopback agent requests protected by `ROYALTYDESK_WORKER_TOKEN` when configured.

## Verification

```powershell
npm run verify:release
npm run test:live
```

`verify:release` runs the build, contract, domain, server, agent, recovery, browser, sandbox, and fault-injection suites. It writes a sanitized report to `plans/evidence/artifacts/release-suite.json`. Live inference is separate because it consumes paid gateway credit.

New to the platform? Start with the [complete web app walkthrough](docs/WEBAPP_WALKTHROUGH.md). For a shorter three-owner evidence checklist, follow [manual browser verification](docs/MANUAL_BROWSER_VERIFICATION.md). Record transaction and child receipt IDs in a private copy of its worksheet; the automated HTTP smoke test does not establish browser wallet authority. A separate `npm run test:live-proposal` check asks the configured live model for structured three-owner terms and validates the response.

## Security and scope

Use testnet only. Never commit wallet keys, API keys, cookies, private statements, SQLite files, or populated private storage. Contract state—not the UI or database projection—is authoritative for approvals, mandates, reserves, entitlements, and receipts.

The MVP supports participant-reviewed NEAR-denominated statements and synthetic fixtures. It does not authenticate Spotify earnings, provide legal certification, guarantee hosted-agent confidentiality, or enable mainnet spending. Intents, inference attestation, and Spotify metadata remain optional follow-up integrations.
