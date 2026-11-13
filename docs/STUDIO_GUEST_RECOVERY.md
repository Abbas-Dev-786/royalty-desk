# Recover an interrupted guest song

The guest generation flow journals every NEAR AI request before sending it. If the worker stops while a request is in flight, the request may have been billed even when no output was saved. The app therefore blocks automatic retry. This is expected accounting behavior, not a reason to delete operation rows.

## Inspect the affected wallet

Run:

```powershell
npm run inspect:studio-guest -- --account-id=<wallet.testnet>
```

`inspection_only` reads the wallet's most recent guest project unless `--expected-project-id=<project-id>` selects a specific song. It reports the job, saved outputs, audio count and operation states without revealing the brief, keys or model text. A `failed` job with `requested` or `unknown` model operations and no saved output has an uncertain provider outcome. Check the NEAR AI Cloud account's usage/activity for the time of the attempt before deciding whether to sponsor another run. This repository cannot prove that an in-flight request was free when the worker stopped before saving its response.

## Explicitly allow another run

Only after reviewing the possible credit charge, copy the exact project ID from the inspection output and run:

```powershell
npm run inspect:studio-guest -- --account-id=<wallet.testnet> --expected-project-id=<project-id> --execute --acknowledge-possible-duplicate-ai-charge
```

The command refuses to reset a song with saved model output, generated audio, a work ID, a non-failed job, or a finalized model operation. A recorded provider response ID is allowed only for an operation explicitly marked `failed`, such as a completed reply without usable content. It makes a persistent SQLite backup under ignored `private/studio-v2/recovery`, marks the selected project cancelled, retains its operation journal, and creates a fresh project for the same wallet with the same title and brief. It makes **no** model or music API request. A new agent run may consume NEAR AI credits.

Run the worker with `npm run dev:worker` during paid generation. This command now stays on one process; `npm run dev:watch --workspace @studio/worker` is for development when no paid requests are running.
