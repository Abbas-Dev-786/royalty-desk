# Catalogue RPC fallback verification

Date: 15 November 2026

## Incident and change

The hosted `/api/studio/catalogue` returned HTTP 503 with `ERR_NEAR_RPC_UNAVAILABLE`. The configured Intea RPC returned a rate-limit response. Read-only calls through FastNEAR and the official NEAR testnet RPC verified that the existing example song was published. The local catalogue database and media directory existed, with schema version 18 and four active publications.

Web contract reads now try configured testnet backups on transport failures, rate limits, and timeouts. Each attempt is bounded to 2.5 seconds within a shared eight-second deadline. A successful endpoint is reused for subsequent reads in that client. Missing releases and contract errors do not trigger fallback. Transaction submission does not use read fallback. Catalogue rights, publication, commitment, contributor, album-track, and media-hash checks remain in force.

The example environment and Render Blueprint use FastNEAR as primary and the official testnet RPC as backup. Existing environment configurations with Intea as primary gain default backups when `NEAR_RPC_FALLBACK_URLS` is unset.

## Automated verification

- `node --test packages/chain/tests/bounded-rpc-provider.test.ts packages/chain/tests/read-fallback-rpc-provider.test.ts`: passed, 11 tests. Covers rate limits, stalled requests, shared deadlines, network failure, missing releases, RPC errors, and submission isolation.
- `node --test apps/web/tests/catalogue-unavailable.test.mjs`: passed, 2 production-server tests. Covers unavailable providers and a rate-limited primary with a working backup, including four verified catalogue items and media retrieval. These tests use local RPC fixtures and do not establish live chain behavior.
- `npm run check --workspace @studio/chain`: passed.
- `npm run check --workspace @studio/web`: passed.
- `npm run build --workspace @studio/web`: passed.
- `git diff --check`: passed.

## Live testnet verification

Started the updated production web build on an ephemeral localhost port with the existing local catalogue, media, and `.env` configuration. The configured primary remained Intea; the new default fallbacks were used. No blockchain transactions or paid generation calls were made.

- `/api/studio/catalogue`: HTTP 200 in 3,852 ms; four items; zero stale entries.
- `/studio`: contained a verified release title and no unavailable notice.
- A published song's media endpoint: HTTP 200, `audio/mpeg`, 497,897 bytes.

## Remaining deployment step

The hosted Render service was diagnosed but not changed or redeployed. Apply the primary and fallback environment settings and deploy the updated code, then repeat the catalogue and playback checks on the hosted service. No browser automation, wallet/payment checks, contract sandbox tests, or full offline verification suite were run for this read-provider fix. The referenced `plan-v2/EVIDENCE_TEMPLATE.md` is absent in this checkout, so evidence is recorded here.
