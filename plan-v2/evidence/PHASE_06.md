# Phase 06 evidence — implementation in progress

Date: 2026-11-12. Current contract WASM SHA-256 `2b13363226f8b8cff1ea51acb9268ebfd2642d2d0285e164be48a64544e2cf77`; the recorded live synthetic payment transactions finalized under the previous compatible WASM hash `8dd50cf90d5be027cd64c5482cd65cdd348a9ee695ff46b47accc6db2b570424`. Live contract `studio-rd-fa315759.testnet`.

## Implemented

| Task | Behavior |
| --- | --- |
| V2-06-01 | Server stores immutable quote with unique payment ID, buyer, work/version, commitment, exact integer price and expiry. |
| V2-06-02 | Separate tip type and bounded amount; tips never grant download entitlement. |
| V2-06-03 | Contract accepts exact native NEAR purchase or bounded tip only for currently published matching commitment. Unique ID and storage-backed escrow prevent duplicate revenue. |
| V2-06-04 | Listener checkout displays target/method/deposit and submits with connected wallet; server persists requested/submitted/unknown/finalized state and verifies final transaction plus chain payment on retry. |
| V2-06-05 | Admin-only unallocated refund waits for child transfer result; payment and entitlement records become refunded only after final chain state. |

## Checks

| Case | Exact check | Actual | Status |
| --- | --- | --- | --- |
| PAY-01–03 | `npm run test:studio-sandbox` | Song/album purchases and tips finalized; duplicate, underpayment, stale and unpublished cases rejected; refund receipt and escrow checked. | Passed in sandbox |
| PAY-01–03 live | `npm run test:studio-testnet -- --execute` | Final song purchase `Cbpdg5X7xVBbdqok2nyLrE17bgDci1Z2huao7jVsMnMk` (0.010 NEAR), album purchase `3xwiLkDBqL1ejh6wRNrJHuqyXZm8Y5BCrrBxA2B7cNC9` (0.015 NEAR), song tip `71vD2HWBPnni8VGXbyLNGmLuDrN3qXQcitkaDnFCeXqA` (0.001 NEAR), album tip `7XMSk2qUdfUFZRGSpLLRaafRPk3zUsjqALzwTQps7UZn` (0.001 NEAR). Duplicate `G5a3THgciD5Vqge7xafQykAyZ3gL3w7rbJ87aBTLQwYg` and underpaid `9FZ6Sp1EKwLLkxZ8sQkjBZhwc8C9MtCVJSq8EZDdDD65` failed. | Passed on live testnet |
| PAY-04 | Browser wallet reject, interruption and retry | Server reconciliation implemented; `npm run test:studio-e2e` confirms anonymous download rejection through the built app. Wallet rejection/interruption and owner browser run in [guide](../../docs/STUDIO_BROWSER_VERIFICATION.md) remain pending. | Partial |
| PAY-05 | Refund and entitlement | Live refund `DM2rVAZTnxwotcbrU5XRe3bksJ5F9hVbinoMJ2t4SXqk` finalized. `get_payment(purchase-song)` returns `refunded`; other three records remain `finalized`. Expected escrow = 0.015 + 0.001 + 0.001 = 0.017 NEAR, observed `17000000000000000000000` yoctoNEAR. Browser entitlement check pending. | Partial |
| Domain/server | `npm run test:studio-domain`, `npm run test:studio-server`, `npm run test:server`, `npm run check` | 16/16, 2/2, 53/53 and TypeScript/source checks passed. | Passed |
| Complete local gate | `npm run verify:studio` | Passed including build, contract, sandbox, built-app HTTP e2e and full server suites. | Passed |

## Owner browser observation

The owner reported that song purchase and song tip functionality work properly in the web app. This is a user-reported positive browser observation for those two flows; the owner did not provide a browser recording, order ID, transaction hash, wallet account, or detailed step results for this run. The separate live testnet transactions below independently verify finalized song purchase and tip payments. Album checkout, wallet rejection/interruption and retry, buyer download entitlement, browser refund, and takedown remain unreported in the manual walkthrough.

Phase 07 must add on-chain allocation state before creator payouts. Until that change, admin refunds are correctly limited to records still marked unallocated by this version of the contract.

## Real catalogue commerce

`npm run test:studio-real-commerce -- --execute` finalized the following payments against published Phase 03 v2 works using `listener.studio-rd-fa315759.testnet`. The script verified each final chain payment, work/version, gross amount and commitment. Escrow increased exactly from `17000000000000000000000` to `44000000000000000000000` yoctoNEAR. A repeat run found all four chain payments and left escrow unchanged at `44000000000000000000000`, confirming idempotent reconciliation. It uses an ignored journal and refuses to repeat an unknown transaction outcome.

`npm run verify:studio` passed at this revision after an initial sandbox-only Docker permission failure; the successful run included the contract, sandbox, server and built-web suites.

| Payment | Work | Amount | Final transaction |
| --- | --- | --- | --- |
| `real-phase03-song-purchase` | `song-phase03-1` | 0.010 NEAR | `4YYdWEAqShD7XydrQoPFY5xoKmeEndN2RHvpTbjEdoAD` |
| `real-phase03-album-purchase` | `album-phase03` | 0.015 NEAR | `GV5Dygh1vKz1Ajcep3RrF7jsFbi5jfX9kCRfir3p7JUW` |
| `real-phase03-song-tip` | `song-phase03-1` | 0.001 NEAR | `DK4j2DUfe14sfNxkqpUsQqLtB8H13GYZb8aSF5pifAJE` |
| `real-phase03-album-tip` | `album-phase03` | 0.001 NEAR | `57EzVqA566m4jX9W3FAesyMRQipwMiV2c6rQv3Lk65Dx` |

The earlier synthetic transactions still prove rejection and refund paths. These new transactions prove actual published catalogue payments. The owner additionally confirmed that song purchase and tip work in the web app; the remaining buyer browser checks are listed above and in the [manual guide](../../docs/STUDIO_BROWSER_VERIFICATION.md). The first RPC endpoint returned 429; resumption used `https://testnet-rpc.intea.rs` after checking NEAR's [RPC providers](https://docs.near.org/api/rpc/providers#testnet).
