# Phase 00 evidence — verified

Audio-provider update (2026-11-11): the ElevenLabs choice below is historical evidence from the Phase 00 run. The owner subsequently selected Stability AI and required sung vocals. [Decision 0004](../../docs/decisions/0004-stability-audio.md) governs Phase 03. The Phase 00 harness and economic checks remain as recorded; provider-specific live verification is still pending.

Date: 2026-11-11. Source: Git baseline `a381d13` plus the working-tree v2 changes; no commit has been made. Environment: Windows, Node 24.21.0, npm 11.19.0, Docker Server 29.8.2 outside the command sandbox. Scope: hackathon testnet baseline, not proof of a deployed studio.

| Task | Implemented decision or check |
| --- | --- |
| V2-00-01 | [Acceptance matrix](../ACCEPTANCE_MATRIX.md) maps admin, agent and listener actions to state and later evidence. Both approval modes and the two-song album journey are explicit in the master plan. |
| V2-00-02 | ElevenLabs selected. Rights basis is the owner's 2026-11-11 statement that ElevenLabs granted written permission for the proposed hackathon testnet catalogue, purchase, tip and download uses. This is an owner attestation; the private permission document was not inspected. Phase 03 still gates actual public publication on recording its details and licensed live output. |
| V2-00-03 | [Decision 0003](../../docs/decisions/0003-studio-v2-baseline.md) fixes native testnet NEAR, 0.01 song/0.015 album prices, 0.001–1 tip range, zero platform fee, weighted album allocation, initial refund rule, agent-key custody and separate gas/storage funding. The album sale and song tip examples conserve the full amount in integer yoctoNEAR. |
| V2-00-04 | Selected `StudioMediaStore` on a persistent local volume with content hashes, separate backup path, single-host SQLite, new studio contract account, administrator upgrade/recovery and legacy-data isolation. [Recovery procedure](../MIGRATION_AND_STORAGE.md) and media corruption/restore test exist. Moderation uses a publish gate and administrator takedown; actual UI is Phase 05/08. |
| V2-00-05 | Locked npm install, typecheck, build and v2 suite commands verified. Missing suites exit nonzero. Docker, NEAR testnet RPC and live NEAR AI connectivity passed. Actual ElevenLabs compose, studio contract sandbox and studio wallet journey belong to Phases 03/04/08. |

## Observed verification

| Case | Exact command | Actual | Result |
| --- | --- | --- | --- |
| BASE-01 | Review `docs/decisions/0003-studio-v2-baseline.md`, `.env.example`, `plan-v2/ACCEPTANCE_MATRIX.md` | Provider, rights basis, economics, custody, topology, recovery and testnet scope recorded | pass for design baseline |
| BASE-02 | `npm run test:studio-domain` | 14 tests passed, including independent album purchase, tip and refund vectors | pass |
| BASE-03 | `npm run test:studio-agents` | Missing suite reported; exit 1 | pass for empty-suite rejection |
| BASE-04 | `npm ci --ignore-scripts --no-audit --no-fund` | Added 352 pinned packages; exit 0 | pass |
| BASE-04 | `npm run check` | All workspace type/source checks passed; exit 0 | pass |
| BASE-04 | `npm run build` with Docker access | Web, worker, packages and **legacy** RoyaltyDesk contract built; exit 0. Legacy WASM SHA-256 `c319324997714c43ba10712a00487cfb125bd5ee7e8d7e49e5154b61604b7a3f` | pass for current workspace build only |
| BASE-04 | `npm run test:studio-domain` | Media copy/restore and corruption rejection included; 14/14 passed | pass |
| BASE-05 | `npm run probe:studio-testnet` outside sandbox | RPC identified `testnet`, block height 277214411; exit 0 | pass |
| BASE-05 | `npm run test:live` outside sandbox | Live NEAR AI response from `z-ai/glm-5.3-flash`, `needs_human`, 32 input/113 output tokens; exit 0 | pass for connectivity, not studio collaboration |
| Release gate | `npm run verify:studio` with Docker access | Built current app, ran studio domain, then exited 1 at missing Phase 02 agent suite | expected incomplete release |

The command sandbox initially denied Docker and network access; authorized reruns passed. No studio contract transaction, ElevenLabs generation or listener payment occurred. No external operation needs reconciliation. The existing wallet compatibility record is in [legacy Phase 00 evidence](../../plans/evidence/PHASE_00.md); the studio wallet journey remains Phase 08. The owner-authorized rights scope is a planning basis, while the specific licensed audio call and publication proof remain Phase 03.

Exit: BASE-01 through BASE-05 satisfied for the Phase 00 baseline. Next task: V2-02-01.
