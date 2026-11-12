# Phase 05 — catalogue, albums and playback

Depends on: 03–04. Status: published on testnet; owner browser observations pending. Outcome: a visitor can discover and play published songs and a two-track album. See [Phase 05 evidence](../evidence/PHASE_05.md).

## Tasks

- **V2-05-01 Catalogue projection:** index contract publication events and verify against chain state; expose bounded public song/album summaries, search/filter and track ordering. Show provenance and contributor credits without exposing private prompts.
- **V2-05-02 Playback:** serve licensed validated media with appropriate access policy, range requests, content type, caching and accessible controls. Decide free preview versus paid full playback in Phase 00; enforce that decision consistently.
- **V2-05-03 Release states:** draft/review/published/unpublished/revised views; publish only exact accepted media and split version. A later revision becomes a new public version without changing existing purchase references.
- **V2-05-04 Takedown:** admin can hide unsafe/infringing works from new visitors and sales while preserving immutable payment records and previously owed balances.

## Evidence and exit

**CAT-01** logged-out visitor finds and plays two published tracks in an album; **CAT-02** draft/unlicensed/unpublished track cannot be fetched publicly; **CAT-03** version update preserves prior order binding; **CAT-04** missing blob, bad hash and stale index fail visibly without claiming publication; **CAT-05** mobile/keyboard playback and range-seek work. Record browser observations plus contract and media hashes; a UI screenshot alone does not prove rights or on-chain publication.
