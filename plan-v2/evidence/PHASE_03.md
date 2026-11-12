# Phase 03 evidence — verified for private creative assets

Updated 2026-11-12. Phase 02 dependency is verified. The final-song choice is [decision 0005](../../docs/decisions/0005-elevenlabs-final-songs.md). This phase produced two live sung recordings and one accepted private two-track album. Public catalogue publication belongs to Phases 04–05 and remains gated on a separate ElevenLabs permission reference.

## Live artifacts and provenance

`node --env-file=.env --experimental-strip-types scripts/live/studio-elevenlabs-album.ts --execute` submitted exactly two sequential 20-second `music_v2_5` composition plans. The source lyrics and composition outputs came from two distinct saved Phase 02 live NEAR AI Cloud agent sessions; the script checked every selected lyric line against its source output. The selected plan, source-output hashes, model, operation identity, owner-attested license basis, generation row and media hash are stored in ignored `private/studio-v2/phase03/studio.sqlite` and adjacent metadata files. No provider request ID or exact charged-credit count was returned, so neither is asserted.

| Song | SHA-256 | File | Decoded audio |
| --- | --- | --- | --- |
| River of First Light | `a45b9aecb38d671c9cde958f285b4d56776b8cd16ff15b2cbab9c6ef4d707bb9` | `private/studio-v2/phase03/review/01-river-of-first-light.mp3` | 20,040 ms; MPEG Layer 3; 48 kHz stereo; 497,897 bytes; RMS 0.1007 |
| Riverlight | `e9002f41dbef0933d22dbe946c1a2e5842c602300d79c78bf12b57ef00a88d72` | `private/studio-v2/phase03/review/02-riverlight.mp3` | 20,040 ms; MPEG Layer 3; 48 kHz stereo; 497,897 bytes; RMS 0.1187 |

The owner listened to both files on 2026-11-12 and confirmed that vocals are clearly sung and both songs are acceptable for the demo album. This is the listening observation; an independent word-by-word lyric transcription was not performed. The deterministic review script independently read the stored bytes after reopening SQLite, verified SHA-256, decoded full audio, checked duration and non-silence, checked metadata hashes, and recorded review notes under the scoped reviewer agent. It did not claim that the reviewer agent listened like a human. The source plan and the owner's listening acceptance together support the creative review.

`npm run review:studio-phase03` created accepted version 2 of both songs and accepted version 2 of album `album-phase03`, with track order 1/2 and original SVG cover SHA-256 `1ba1bf6ed3ae16100df051d95b8fb93bed41c5fd7bf729ac2a243bbafae9de71`. Version 1 drafts remain intact. The album and its exact track list are in ignored `private/studio-v2/phase03/album-phase03.json`; review notes are in the sibling `review/` directory. Re-running the script succeeded without a paid call or duplicate version.

## Checks

| Case | Actual verification | Result |
| --- | --- | --- |
| MED-01 | Two distinct live MP3 hashes, complete decoded audio, and owner listening approval | passed for private demo |
| MED-02 | Agent source output, composition-plan hash, model, generation operation, media hash, metadata, license attestation and review notes linked per song | passed; request ID/cost unavailable from response |
| MED-03 | `npm run test:studio-media`: corrupt, non-audio, silent and invalid provider outputs rejected; live MP3s decode without error | passed |
| MED-04 | `npm run test:studio-media`: bounded revision creates a second distinct asset, retains the first, and respects budget | fixture passed; live songs accepted without revision |
| MED-05 | `npm run test:studio-domain`: absent rights/review rejected; Stability instrumental rejected; ElevenLabs owner attestation alone rejected without separate permission reference; admin quarantine hides the song and containing album, blocks another publication, and retains finalized revenue | passed |
| MED-06 | Reopened database and content-addressed media read by `npm run review:studio-phase03`; fixture restart and corruption checks in studio domain/media suites | passed |
| V2-03-06 | Phase 03 policy reserved two calls, 20,000 ms each, 40,000 ms total; operation ledger confirms exactly two finalized requests; cached repeat made no request | passed |

`npm run check` passed. `npm run test:studio-domain` passed 16/16; `npm run test:studio-media` passed 7/7; `npm run test:server` passed 53/53. `npm run build` passed, including the Docker contract build, when run with Docker Desktop access. The first sandboxed build reached the contract step and reported Docker unavailable; its authorized Docker-access rerun passed. The private review command passed twice, demonstrating idempotent recovery.

## Rights and publication boundary

The owner states that ElevenLabs granted written permission for the hackathon testnet catalogue, including public playback, paid purchases, tips and downloads. That statement is recorded as an owner attestation for each asset. The permission document and a non-secret agreement reference were not supplied or inspected. [ElevenLabs Music Terms](https://elevenlabs.io/music-terms) require express written authorization for a Starter music library. The publication repository now requires a separate `provider_permission_ref` on each ElevenLabs song, and the accepted album has **not** been published. Phase 05 must record and check the actual reference and scope before a public catalogue release. Recording a reference does not replace reviewing its terms.

The audio, database and `.env` remain in ignored private storage. No proprietary audio or key was committed. No further ElevenLabs generation is needed for these accepted assets.
