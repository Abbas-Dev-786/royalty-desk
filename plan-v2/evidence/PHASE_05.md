# Phase 05 evidence — implementation in progress

Date: 2026-11-12. The Phase 03 songs and album are published on `studio-rd-fa315759.testnet`. The owner confirmed private ElevenLabs permission for the testnet catalogue; ignored record `private/studio-v2/rights/elevenlabs-permission.json` labels its basis `owner-confirmed-private-permission` and lists the covered uses. The underlying agreement was not inspected in this workspace.

## Implemented

| Task | Behavior |
| --- | --- |
| V2-05-01 | `/studio` and `/studio/[workId]` show chain-verified local publications, titles, ordered tracks, prices, hashes and contributor credits. Search filters summaries. |
| V2-05-02 | Public media route validates hash, rights, accepted review, publication and chain state before serving bytes. Single byte ranges support seeking; responses use `no-store` for immediate takedown. Free full streaming and purchase-gated downloads are recorded in [decision 0006](../../docs/decisions/0006-catalogue-playback.md). |
| V2-05-03 | Publication confirmation checks final signed transaction, exact method/action/event and chain commitment before storing local projection. Revision remains versioned. |
| V2-05-04 | Admin takedown quarantines local media immediately and returns an on-chain unpublish request. Historic payment rows stay intact. |

## Checks

| Case | Exact check | Actual | Status |
| --- | --- | --- | --- |
| CAT-01 | Logged-out browser plays both Phase 03 songs from the published album | Chain publications finalized for `song-phase03-1` `9qfDhu7NoKe7QTcF6QvNn6yLhM9bi4Tsz3wESY8jtqDS`, `song-phase03-2` `58ZCdzwYdMnrVcniK4GCBvbXYkk8R8ay6RUyRWa7yJUD`, and `album-phase03` `6CnFq5w2ao1j9dLMZsCV8h5CrwCKBmdoJpkkbG6Sif5v`. Local HTTP `/api/studio/catalogue` returned all three v2 items with `staleCount: 0`, 50/50 contributor credits, ordered album tracks and chain commitments. Actual browser listening remains for the owner. | Published and HTTP passed; browser pending |
| CAT-02 | Draft/unlicensed/unpublished route rejection | `npm run test:studio-e2e` passed against a built production web server with a temporary draft database: draft absent from `/studio` and catalogue JSON, draft media 404, anonymous download 401. Local HTTP smoke also returned 404 for the private Phase 03 song and album artwork hashes. `npm run test:studio-domain` includes owner-attestation rejection. | Passed for server gate; owner browser check pending |
| CAT-03 | Version binding | Sandbox revision preserves old commitment and stops new sale of old version. Browser projection check remains. | Partial |
| CAT-04 | Missing/bad/stale media | Content-addressed store verifies hashes and projection suppresses stale rows; `npm run test:studio-domain` passes corruption checks. Browser check remains. | Partial |
| CAT-05 | Mobile/keyboard/range seek | `npm run test:studio-server` passes two range cases. Live local HTTP range request for the first published song returned `206 Partial Content`, `content-range: bytes 0-1023/497897`, `audio/mpeg`. [Manual browser guide](../../docs/STUDIO_BROWSER_VERIFICATION.md) awaits owner playback, mobile and keyboard observations. | HTTP passed; browser pending |
| Live draft privacy | `npm run dev:web`, then HTTP GET `/api/studio/catalogue`, `/studio`, and the real first song's media hash | With the Phase 05 derived database and actual testnet contract configured, catalogue JSON was `{"items":[],"staleCount":0}`, the page returned 200 with the empty state, and private song media returned 404. | Passed |

The user's requested browser verification is documented for personal execution. The current public catalogue contains all three real v2 releases. The prepublication empty-catalogue observation above remains a valid privacy regression check.

`npm run prepare:studio-catalogue -- --execute` made a consistent Phase 05 database backup and mapped the old placeholder identities to the live studio admin and distinct agent accounts. The original Phase 03 snapshot remains intact. The derived copy stores the source hash and mapping in `studio_identity_migrations`; inherited local split acceptances were cleared, then new on-chain v2 acceptances were recorded. `npm run commit:studio-catalogue -- --execute` created all six actual Phase 03 song/album versions as unpublished chain commitments, preserving the original v1 and accepted v2 track orders. Repeating the command created no duplicate transactions. The synthetic payment releases still have different IDs and hashes.

`npm run publish:studio-catalogue -- --execute` verified the owner-confirmed private permission record, media, accepted reviews, chain drafts, contributor split acceptances and album order, then finalized the three real publications. Re-running it is journaled and did not duplicate the two already published songs. `npm run check:studio-release` now exits 0 with `ready: true` and `blockers: []`. The authorization reference is an owner confirmation, not a provider agreement identifier.

`npm run verify:studio` passed after the publication update with Docker access: web/package build, Rust contract tests (3/3), sandbox journey, domain (16/16), agents (14/14), media (7/7), server (2/2), built-web HTTP e2e (1/1), and broader server suite (53/53).

The catalogue HTTP check used a web process with network access to the configured testnet RPC. A sandboxed web process without RPC access returned three stale rows, demonstrating the fail-closed chain verification path; this is an environment error, not a release failure.
