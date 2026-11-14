# Studio web app: manual Phase 05–09 verification

This guide records **manual checks to perform**, not passing evidence. Run it on a local testnet deployment with the studio contract configured. Testnet tokens have no cash value. Keep wallet seed phrases and API keys outside screenshots and issue reports.

> The administrator-driven release and payout steps below describe the previous deployment. After the agent-run upgrade, use [STUDIO_AGENT_OPERATIONS.md](STUDIO_AGENT_OPERATIONS.md) for the guardian, autonomous release and revenue checks.

## Before opening the app

1. Confirm `.env` points `NEXT_PUBLIC_STUDIO_CONTRACT_ID` to `studio-rd-fa315759.testnet` and `STUDIO_CATALOGUE_DB_PATH` to `private/studio-v2/phase05/studio.sqlite`. Set `NEAR_RPC_URL` to a reachable testnet RPC.
2. Run `npm run check:studio-release`. The current published Phase 03 album should report `ready: true`, three v2 publications and no blockers. The original Phase 03 database and media stay in `private/studio-v2/phase03/studio.sqlite` and `private/studio-media`.
3. The owner-confirmed private permission record is in ignored `private/studio-v2/rights/elevenlabs-permission.json`. Its basis is `owner-confirmed-private-permission`; the underlying agreement was not inspected here. Keep that private record with the local deployment. Publication is already complete; do not republish for this walkthrough.
4. Run `npm ci`, `npm run check`, `npm run build`, then `npm run dev:web`. Open the printed local URL, normally `http://localhost:3000`.
5. For administrator creative sessions, start `npm run dev:worker` in a second terminal. Its health endpoint at `http://127.0.0.1:3101/health` should return `ok`. The ignored `.env` contains a private worker bearer token; keep it out of screenshots. **Run agents with NEAR AI** spends model credits. Once the agents agree, recording starts automatically and spends ElevenLabs music credits.

## Public catalogue and playback

1. Use a private browser window with no wallet session. Open `/studio`. Expect the two songs and one album, visible titles, price and contributor shares.
2. Search by each song title. Open each song and the album. Confirm the album order matches the accepted Phase 03 order.
3. Play both songs using the built-in controls. Pause, resume, and seek to the middle. In browser DevTools, confirm media requests return `206 Partial Content` with a valid `Content-Range` for range requests.
4. Inspect the page's credits, media hash and metadata hash. Confirm no private prompt, API key or unpublished draft appears in the page or Network responses.
5. On a phone-size viewport, repeat play/pause/seek. Use only the keyboard to reach search, track links, audio controls and checkout controls; check focus visibility and labels.
6. Try a random 64-character hash at `/api/studio/media/<hash>`; expect `404`. Try an unpublished or quarantined asset hash; expect `404`. Corrupt or remove a copy of a media blob in a disposable setup; expect the catalogue to report a stale item and refuse playback. Restore the blob before purchases.

## Public agent collaboration for judges

1. Stay signed out or use any listener wallet. On `/studio`, select **See the agents collaborate**. The route is public and must not ask for the administrator wallet.
2. Open `/studio/song-phase03-1/collaboration?version=2`. Read the archived lyric, composition, review and split exchange. Check that each excerpt is labeled **archived concept**, with its output hash. These records show real NEAR AI steps retained from the project; they do not claim every concept line became the final audio.
3. Open `/studio/song-phase03-2/collaboration?version=2`. Its archive contains only lyric and composition steps. Confirm the page does not invent missing review or negotiation messages.
4. On both pages, confirm the published version's contribution hashes, exact share percentages and **accepted on-chain** state for each contributor. Follow the contract and publication links to the NEAR testnet explorer.
5. Open `/studio/album-phase03/collaboration?version=2`. Follow each track story. Verify the album's own split and approval record separately from its song records.
6. Try `/studio/<unpublished-work-id>/collaboration?version=1`. Expect `404`; private drafts, keys, and full prompts must not appear in the HTML or network response. On a narrow viewport and with keyboard navigation, check the timeline and links remain readable.

## Create a judge song with any testnet wallet

1. Start both `npm run dev:web` and `npm run dev:worker`. Confirm the worker has NEAR AI and ElevenLabs credentials. Monitor provider credits before inviting more wallets or creating more songs. Do not put provider keys in the browser.
2. Sign in with a NEAR testnet wallet and open `/studio/create`. Enter a song title and a brief of at least 20 characters. Click **Start my song** once. The new project appears under **Your songs**. Its title and brief stay associated with that project.
3. Watch completed agent replies appear automatically while the worker runs. If the browser closes, reopen the same project from **Your songs**. Confirm its project ID, session ID, and earlier replies remain. **New song** must create a separate project without changing the first one.
   If the page says the NEAR AI outcome is uncertain, stop retries and follow [guest recovery](STUDIO_GUEST_RECOVERY.md). The administrator must check provider usage before sponsoring another run.
4. Read the lyricist, composer, reviewer, split proposal and split response steps. Confirm the page labels the actual model and output hashes. A failed or disputed split must not show a music-generation button. Save a screenshot without wallet secrets.
5. If the agents agree, the worker starts one private ElevenLabs recording automatically, even if the browser closes. Wait for the private MP3 player, play it, refresh, and confirm the same work ID and media hash remain. An unknown paid outcome must block a second call. Earlier guest sessions still use **Make my recording**.
6. Sign out. The guest status and media APIs must return `401`; another signed-in wallet must not see this project's transcript or audio. The new song is a private review draft, absent from `/studio` until the administrator reviews rights and publishes it. After publication, its public collaboration route should link to the saved source hashes.

The repository verifies the guest page build and anonymous/cross-wallet read isolation. A complete new live judge song and browser audio run still needs owner-run evidence because it spends limited provider credits.

## Listener purchase and tip

1. Sign into a funded **testnet** listener wallet. Open a song page. Select purchase; inspect the wallet prompt. Confirm receiver is the configured studio contract, method is `purchase`, work/version/commitment match the page, and attached deposit equals the quoted price in yoctoNEAR.
2. Reject the prompt once. Refresh the page. Confirm no finalized purchase or download entitlement appears. Retry using the same pending order ID if the app retained it.
3. Approve a song purchase. Copy the transaction hash. Refresh before the page reports success, then use the order status action to reconcile. Expect one finalized order and a download link. Check the transaction and final receipt on the NEAR testnet explorer and `get_payment(payment_id)` on the contract.
4. Purchase the album. Confirm the album order ID differs from the song order ID; after finality, confirm both album tracks are downloadable by that buyer.
5. Tip a song and then the album. Confirm method `tip`, entered amount and target work in each wallet prompt. Tips should produce separate payment records and should not grant downloads to an otherwise unpurchased listener.
6. Repeat the same order ID or transaction hash. Expect reconciliation of the original payment, never a second revenue record. Confirm the contract escrow increased only by the four distinct finalized amounts.

## Administrator correction and takedown

1. As the contract admin, request a refund for an unallocated purchase via `/api/studio/refunds`; sign the returned `refund_payment` transaction with exactly one yoctoNEAR, then send its final transaction hash to `/api/studio/refunds/confirm`. Confirm chain payment status `refunded`, local order `refunded`, and download access removed unless another valid purchase covers it.
2. Retry the same refund. Expect rejection. A tip or purchase already allocated in Phase 07 must reject refund under the later payout contract.
3. As admin, request takedown through `/api/studio/takedown`. The local asset should disappear immediately. Sign the returned `unpublish_release` request and verify the chain release is unpublished. Refresh as a logged-out visitor: the work and its media route must be unavailable. Historic payment records must remain queryable.

## Studio operations and agent collaboration

1. Open `/` and confirm it takes you to `/studio`. Open `/royalty` and confirm the older royalty workspace is separately labelled. Open `/studio/operations` without signing in; private drafts and earnings must not appear.
2. Sign in as `studio-rd-fa315759.testnet` and open `/studio/operations`. This is the on-chain administrator created during bootstrap; signing in as a personal account such as `sickhat6192.testnet` will show the current and required account IDs and will not grant private access. The bootstrap key is stored only in ignored `private/studio-v2/testnet/contract-key.json`; never paste it into chat or a public document. Confirm the page shows the on-chain policy epoch, active agents, owed/pending/paid amounts, works with exact version and commitment, local task board, contributions, split acceptances, model activity and order receipts. The Phase 03 reviewer should show `reviewer.studio-rd-fa315759.testnet`, not `reviewer.testnet`.
3. Create a new project with a unique title. Select lyricist, composer and reviewer, then write a brief of at least 20 characters. If you intend to spend model credits, press **Run agents with NEAR AI** once. Record the session ID and whether it finishes or pauses for acceptance. Refresh and inspect the recorded agent activity. If the browser times out or reloads, press **Resume saved agent run**; this uses the same request and session ID. Press **Start another run** only when you intend a new creative session. A different brief in the same project can produce a second song draft; each brief has its own bounded model budget.
4. Enter the song title before running the agents. If they agree, the page starts a private ElevenLabs recording automatically; this spends music credits. Record the work ID, asset hash and duration. Refresh to see the song in the private review queue. Repeating the same brief and title reuses the recorded generation; an unknown provider outcome blocks another paid request for that slot. This action does not publish the draft.
5. After two songs are in the same project, refresh the operations page, choose both songs under **Assemble an album draft**, enter a title and create the album. Check its track order and cover in the private review queue. This step uses no model or music credits.
6. Under **Private media review**, play each draft song and open the generated cover. Select the reviewer record, check the listening and rights confirmation, then accept each draft. Confirm each exact version changes from `review` to `accepted`; the media stays private.
7. Commit each accepted song using **Commit exact release on NEAR**. Confirm the wallet targets `studio-rd-fa315759.testnet`, uses zero deposit, and shows the exact work version and shares. The worker's restricted lyricist and composer keys should accept both splits. In autonomous mode the restricted producer key should then publish the song. Publish both songs before committing the album; the album contract action requires their exact song versions. In human-review mode, attempt publication before approval and expect rejection, then approve with the administrator wallet and publish. Check final transaction hashes and catalogue entries.
8. Change the policy mode and pause through the operations controls. Confirm each wallet prompt targets the studio contract and attaches one yoctoNEAR. The policy confirmation route must synchronize the local mode and music budget. While paused, a new purchase and payout must fail. Unpause before continuing.
9. Use a new, unallocated browser purchase for **Refund buyer**. Confirm a finalized child transfer, local `refunded` status and removed download access. Already allocated purchases must reject refunds.
10. Allocate a new finalized browser payment. Check each agent's owed amount against the committed song or album split. Select an agent and press **Pay recorded earnings**. Confirm the exact recipient, payout ID, final child receipt and updated owed/pending/paid totals. Refresh or repeat the action while pending: it must reconcile the saved ID rather than create a second payout.
11. Repeat selected controls as an outsider wallet. Policy changes, project creation, creative runs, draft playback, media review, release commitment, split acceptance, payout lookup, refund and takedown must be rejected. Test keyboard focus and a phone-size viewport across catalogue, checkout and operations.

## Evidence worksheet

For each check, record date/time, app commit or source digest, browser/device, account ID, work/version, exact action, expected/actual result, screenshot or short recording path, transaction hash and final receipt status. Keep screenshots free of wallet secrets. Put passing observations in `plan-v2/evidence/PHASE_05.md` and `PHASE_06.md`; mark unrun checks pending.
