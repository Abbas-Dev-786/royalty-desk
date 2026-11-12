# Studio web app: manual Phase 05–06 verification

This guide records **manual checks to perform**, not passing evidence. Run it on a local testnet deployment with the studio contract configured. Testnet tokens have no cash value. Keep wallet seed phrases and API keys outside screenshots and issue reports.

## Before opening the app

1. Confirm `.env` points `NEXT_PUBLIC_STUDIO_CONTRACT_ID` to `studio-rd-fa315759.testnet` and `STUDIO_CATALOGUE_DB_PATH` to `private/studio-v2/phase05/studio.sqlite`. Set `NEAR_RPC_URL` to a reachable testnet RPC.
2. Run `npm run check:studio-release`. The current published Phase 03 album should report `ready: true`, three v2 publications and no blockers. The original Phase 03 database and media stay in `private/studio-v2/phase03/studio.sqlite` and `private/studio-media`.
3. The owner-confirmed private permission record is in ignored `private/studio-v2/rights/elevenlabs-permission.json`. Its basis is `owner-confirmed-private-permission`; the underlying agreement was not inspected here. Keep that private record with the local deployment. Publication is already complete; do not republish for this walkthrough.
4. Run `npm ci`, `npm run check`, `npm run build`, then `npm run dev:web`. Open the printed local URL, normally `http://localhost:3000`.

## Public catalogue and playback

1. Use a private browser window with no wallet session. Open `/studio`. Expect the two songs and one album, visible titles, price and contributor shares.
2. Search by each song title. Open each song and the album. Confirm the album order matches the accepted Phase 03 order.
3. Play both songs using the built-in controls. Pause, resume, and seek to the middle. In browser DevTools, confirm media requests return `206 Partial Content` with a valid `Content-Range` for range requests.
4. Inspect the page's credits, media hash and metadata hash. Confirm no private prompt, API key or unpublished draft appears in the page or Network responses.
5. On a phone-size viewport, repeat play/pause/seek. Use only the keyboard to reach search, track links, audio controls and checkout controls; check focus visibility and labels.
6. Try a random 64-character hash at `/api/studio/media/<hash>`; expect `404`. Try an unpublished or quarantined asset hash; expect `404`. Corrupt or remove a copy of a media blob in a disposable setup; expect the catalogue to report a stale item and refuse playback. Restore the blob before purchases.

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

## Evidence worksheet

For each check, record date/time, app commit or source digest, browser/device, account ID, work/version, exact action, expected/actual result, screenshot or short recording path, transaction hash and final receipt status. Keep screenshots free of wallet secrets. Put passing observations in `plan-v2/evidence/PHASE_05.md` and `PHASE_06.md`; mark unrun checks pending.
