# Music generation credit policy

Status: active development guard, 2026-11-12. The owner has limited ElevenLabs Starter credits and asked that generation use them carefully.

## Model choice

Keep `music_v2_5` for any ElevenLabs release candidate. ElevenLabs describes it as having better audio quality and prompt adherence than `music_v2`; the older `music_v1` is deprecated. Current public pricing describes Music cost by generated duration and variants, and does not establish a lower per-minute price for `music_v2`. A model downgrade is therefore not a documented credit saving and would risk the requested sung-vocal quality. See [model comparison](https://elevenlabs.io/docs/overview/capabilities/music), [music cost help](https://elevenlabs.io/docs/help-center/product/core-capabilities/music/how-much-does-eleven-music-cost), and [Music API pricing](https://elevenlabs.io/pricing/api).

## Rules for paid calls

1. Complete the lyric, arrangement and split proposals using existing text-model and fixture checks before generating audio. A draft prompt and lyrics must be reviewed before a paid music call.
2. Generate one short candidate at a time. Set `music_length_ms` explicitly. `npm run probe:elevenlabs-music` is fixed at 10 seconds, skips itself when its earlier file exists, and requires `--execute` for the first call when no file exists.
3. Both Stability drafts and ElevenLabs full songs reserve call count and requested audio duration in SQLite before contacting the provider. The Phase 03 project policy permits exactly two calls, at most 20 seconds each and 40 seconds total. Both slots are now used. Unknown paid outcomes retain their reservation until reconciled. Completed outputs are reused by logical key.
4. Do not add live generation to test suites or run a probe to check account status. Use fixture tests, the stored MP3 and read-only account information for routine verification. Avoid parallel candidates and automatic retries after a timeout.
5. Record the provider's actual charged credits or billing response when available. The current API response does not give a trustworthy exact charge in this code path; no fixed credit amount is assumed.

The two Phase 03 full songs were generated through the production ElevenLabs adapter and accepted for the private demo album. Routine checks and the Phase 03 review script read stored files and make no paid music calls. `npm run test:studio-live-music` defaults to a dry run; `--execute` is an explicit live action and the saved project policy prevents a third paid call.
