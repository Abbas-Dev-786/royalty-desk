# Legacy RoyaltyDesk source retirement

Date: 2026-11-13. Baseline commit: `640afe7`; changes are in the working tree. Scope: retire the older royalty-administration application while preserving the active agent music studio and historical records.

## Changes

- Removed the legacy royalty UI and API routes, legacy worker agent route/service, old contract source, CSV/agreement/statement domain code, and their exclusive fixtures, scripts, and tests.
- Kept the studio contract and all studio routes. Kept shared wallet authentication, durable jobs, restricted signing, receipt reconciliation, SQLite migrations, and historical plans/evidence.
- Moved the studio's NEAR AI model interface/provider into `apps/worker/src/near-ai/model.ts` so studio code no longer imports legacy agent types.
- Updated build, CI, verification, navigation, README, and contract documentation to use the studio as the active product. The built web route table has no `/royalty`, `/releases`, or `/api/releases` routes.
- Added preferred `STUDIO_APP_DB_PATH`, `STUDIO_WORKER_TOKEN`, `STUDIO_WORKER_URL`, and studio worker host/port settings; older environment names remain accepted for existing deployments. Removed the retired worker's unused storage-secret requirement.
- Retained existing `@royaltydesk/*` package names and SQLite migration tables as compatibility identifiers. Existing deployed contract accounts and populated databases were not modified.

## Verification

| Command | Result |
| --- | --- |
| `npm ci --dry-run --offline --ignore-scripts` | Passed; lockfile remains installable. |
| `npm run check:offline` | Passed; source policy and studio import checks. |
| `npm run verify:studio` | Passed: type checks, web and studio contract build, 18 domain, 18 agent, 9 media, 7 Rust contract, 9 server, and 1 built-web HTTP tests, plus the NEAR sandbox journey. |
| Built-web HTTP assertions | `/royalty` and `/api/releases` return 404; catalogue has no legacy navigation. |

The first sandboxed `npm run build` could not access Docker Desktop's named pipe. The same build and the full verification suite passed with Docker access approved. No live testnet, paid inference, or browser-wallet check was rerun for this cleanup; previous live evidence remains historical and is not relabeled as a current pass.
