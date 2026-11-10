# RoyaltyDesk

RoyaltyDesk is an evidence-backed royalty administration prototype for NEAR testnet. Owners approve agreement versions, delegate bounded settlement authority to separate agent accounts, review private statement evidence, and distribute native NEAR using contract-enforced accounting.

## Requirements

- Node.js 20.9 or newer and npm 11.
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

The contract build writes `contracts/royaltydesk/target/near/royaltydesk_contract.wasm`. Record its checksum with:

```powershell
npm run release:manifest
```

The manifest is intentionally labeled as an artifact record, not proof of deployment. Deployment and account-key custody remain explicit operator actions.

## Development

Run the web app and worker in separate terminals:

```powershell
npm run dev:web
npm run dev:worker
```

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
