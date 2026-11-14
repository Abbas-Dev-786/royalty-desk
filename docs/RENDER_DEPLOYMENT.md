# Render deployment

This repository uses two SQLite databases and local media files shared by the Next.js app and its private worker. Deploy it as the single disk-backed web service in [`render.yaml`](../render.yaml). The startup script runs both processes in that service; the worker listens only on loopback. Render's [persistent disks](https://render.com/docs/disks) are available to one service instance, so two separate services cannot share these files. The Blueprint selects the paid 1 CPU / 2 GB plan in Singapore, one instance, a 10 GB disk, and manual deploys.

At [Render's listed rates](https://render.com/pricing), that selection is approximately **US$27.50 per month** for compute and disk before bandwidth and AI/music provider usage. Render prorates compute billing; confirm the displayed total in your workspace before applying the Blueprint.

## Before the first deploy

1. Push the reviewed repository branch to GitHub. In Render, create a **Blueprint** from that repository and review the service, plan, disk, and region before applying it. Render's [Blueprint specification](https://render.com/docs/blueprint-spec) defines the fields used here.
2. Confirm that the public `NEXT_PUBLIC_STUDIO_CONTRACT_ID` in the Blueprint is the intended deployed **testnet** studio contract. It is set to the ID in the local configuration. Set `NEAR_AI_MODEL`, `NEAR_AI_API_KEY`, `ELEVENLABS_API_KEY`, and `ELEVENLABS_PERMISSION_REF` in Render's environment settings. The last value must identify the existing permission record for the music provider. The Blueprint generates `STUDIO_WORKER_TOKEN` and keeps it server-side. Never enter provider keys or wallet keys in Git or in the browser.
3. For on-chain agent release operations, upload the existing private `journey.json` as a Render **Secret File** named `studio-journey.json`. Render places it at `/etc/secrets/studio-journey.json`; `STUDIO_JOURNEY_PATH` is set to that path. This file contains scoped signing keys and must stay out of Git. See [Render Secret Files](https://render.com/docs/configure-environment-variables#secret-files).
   Wallet challenges use Render's `RENDER_EXTERNAL_URL` automatically. If you later serve a custom domain, set `STUDIO_AUTH_ORIGIN` to its exact `https://` origin.
4. The first deploy starts an empty database. **Do not sign in or create projects before importing the existing studio data.** Its `/api/health` endpoint checks that the web app can reach the internal worker; it does not prove that catalogue data or provider credentials are present.

## Import the existing studio

On the local machine, run `node scripts/render/create-seed.mjs` from the repository root. It creates SQLite-consistent snapshots, verifies each referenced media file, and includes the two archived agent records used by the published demo songs. The resulting `private/render-seed` directory is ignored by Git and contains private account, payment, and music data. Its contents must be transferred only to the Render disk.

After the first service starts, use the service's [Render SSH access](https://render.com/docs/ssh) to create `/opt/render/project/src/runtime-data/import`, then use [SCP with `-s`](https://render.com/docs/disks#scp) to upload `private/render-seed/app.sqlite`, `catalogue.sqlite`, `media`, and `archive` into it. Render's SSH address and service identifier come from the service's **Connect** menu. Do not copy the files into the active database paths while the app runs.

Trigger a manual redeploy. Before either process starts, `scripts/render/import-seed.mjs` verifies the staged SQLite files and media hashes, refuses to replace a studio with users, projects, or payments, copies the snapshots into the active disk paths, and writes a one-time marker. The original staged files remain on the disk as a recovery copy. Subsequent deploys skip the import.

## Verify the live service

1. Open `https://<your-service>.onrender.com/api/health`; expect `{"status":"ok"}`.
2. Open `/studio` and verify the two existing songs and album against their NEAR testnet publication records. Open a song and play the audio. Check `/studio/agents` and the public collaboration page.
3. Sign in with the guardian wallet and open `/studio/operations`. Confirm the projects, existing agent accounts, and balances. Do a private test song only after checking provider quotas and the worker logs.
4. Check Render logs for `Studio worker listening`, `Imported studio snapshots`, and any missing scoped-key or provider messages. A green health check alone is insufficient proof of music generation, wallet authority, or payment settlement.

## Operational limits

- The disk-backed service has a single instance and brief downtime on deploy. Render does not make a disk available during the build step, so database import happens at runtime before the app starts. See [Render disk limitations](https://render.com/docs/disks#disk-limitations-and-considerations).
- SQLite, media, and the one-time import copy consume disk space. Back up both active databases and media together before a migration or restore.
- The Blueprint turns automatic deploys off. Review and trigger each production deploy after checking database compatibility and paid provider operations.
