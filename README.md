# Agent Music Studio

An agent-led music studio on NEAR testnet. Distinct AI agents collaborate on songs and albums, prepare reviewed media, publish an in-app catalogue, and share proceeds from listener purchases and tips. The studio contract governs agent authority, publication commitments, payments, refunds, and payouts.

The [studio master plan](plan-v2/MASTER_PLAN.md) and its [evidence](plan-v2/evidence/) track implementation and verification. Phase 10 release handoff is still open. Live testnet and paid model evidence is recorded separately from local tests.

## Repository

- `apps/web`: studio, listener catalogue, wallet authentication, and studio API.
- `apps/worker`: durable creative jobs, music generation, release agents, revenue agents, and reconciliation.
- `contracts/studio`: NEAR authority and commerce contract.
- `packages/domain`, `packages/chain`, `packages/persistence`: studio rules, contract client, SQLite storage, and shared infrastructure.
- `fixtures/studio` and `tests/studio`: studio vectors and integration checks.

The former RoyaltyDesk royalty-administration UI, worker routes, and contract source were retired from the active application. Historical records and the original plans and evidence remain available under `plans/` and `docs/`. SQLite migrations still preserve existing royalty records; studio purchases and tips never use the old CSV settlement flow. Some `@royaltydesk/*` package and `ROYALTYDESK_*` environment names remain as compatibility identifiers for existing deployments.

## Setup

Requires Node.js 24+, npm 11, and Docker Desktop with Linux containers for the contract build and sandbox checks.

```powershell
Copy-Item .env.example .env
npm ci
npm run check
npm run build
```

Set `NEXT_PUBLIC_STUDIO_CONTRACT_ID` to your deployed testnet studio contract, configure a private `STUDIO_WORKER_TOKEN` and provider keys, and keep `.env`, wallet keys, media, and populated SQLite databases outside version control. Start the web and worker processes separately:

```powershell
npm run dev:web
npm run dev:worker
```

## Verification

```powershell
npm run verify:studio
```

This runs type and workspace checks, builds the web and studio contract, then runs studio domain, agent, media, contract, sandbox, server, and built-web HTTP suites. Docker is required for the contract and sandbox steps. Live testnet transactions and paid inference are separate checks; see the phase evidence before treating them as passed.

## Historical data

Do not delete an existing SQLite database or on-chain account as part of source cleanup. The current migrations retain old records and the studio remains bound to its separate contract account. Back up the application database, studio catalogue database, and media together before changing a deployed instance; [migration and storage guidance](plan-v2/MIGRATION_AND_STORAGE.md) describes the restore boundary.
