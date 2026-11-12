# Phase 03 — creative production and media

Depends on: 02 and Phase 00 provider-rights decision. Status: verified for private demo assets; see [evidence](../evidence/PHASE_03.md). Outcome: actual playable, reviewable songs with source and license provenance.

## Tasks

- **V2-03-01 Provider interface:** implement typed audio-generation adapters with prompt/composition plan, provider/model, duration, request ID when returned, output metadata, cost when returned and retry identity. ElevenLabs Music v2.5 is the selected full-song provider for intelligible vocals and accompaniment in one final recording. Stability AI Stable Audio 3 remains an optional instrumental adapter.
- **V2-03-02 Pipeline:** agents create original lyrics and arrangement plans, invoke real sung-song generation, validate binary size/type/duration and decoded PCM, hash media, store durably, and attach provenance for the final song version. Create artwork/credits with their own provenance and rights checks. Separate stems are required only if a provider supplies them.
- **V2-03-03 Review:** audio reviewer and producer inspect playable files, request bounded revisions, and accept the exact final version. Technical checks include silent/corrupt/truncated output, codec, length and storage retrieval.
- **V2-03-04 Publication gate:** only assets with recorded allowed public rights, validated files, metadata, credits and completed review can move to publishable state. Quarantine or unpublish flagged assets while preserving financial history.
- **V2-03-05 Album:** generate at least two different songs, assign track order and artwork, and link each song's own contributors/split.
- **V2-03-06 Credit safety:** cap paid generation by call count, per-request duration and reserved total duration under the current studio policy. Cache completed outputs, resume known asynchronous jobs, and never automatically repeat an uncertain paid request. Keep live probes opt-in and record real provider cost when it is available. Use the shortest viable draft and reserve full-length generation for accepted briefs.

## Evidence and exit

**MED-01** two live-generated songs with intelligible sung lyrics play end to end and have distinct hashes; **MED-02** plan/model/generation/license/media hash trace is complete for each produced asset; **MED-03** corrupt/empty/oversized/unsupported/silent files are rejected; **MED-04** bounded revision changes version and does not overwrite old asset; **MED-05** unauthorized publication-rights flag blocks release; **MED-06** storage restart restores playback. Record provider request IDs when returned, file metadata, playback observation and owner rights attestation; never commit proprietary audio or secrets unless rights allow it.
