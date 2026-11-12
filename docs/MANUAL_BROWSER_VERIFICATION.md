# Manual browser verification: three-owner testnet journey

Use this checklist to verify the browser and wallet behavior that the automated HTTP smoke test cannot prove. Record actual account IDs, transaction hashes, observed states, and failures in a private copy of the worksheet at the end. Never put wallet keys, API keys, cookies, private preferences, or real statements in a screenshot or issue.

## Prepare the environment

1. Use three distinct funded **NEAR testnet** owner wallets (A, B, C), one funded administrator/funder wallet (it may also be A), and one separate testnet agent account. Confirm that each wallet displays `testnet`. Keep the agent's full-access/recovery key outside this repository. For delegated signing, install only a function-call key restricted to the configured contract and the selected methods; configure its worker keystore as described in [README](../README.md).
2. Start Docker Desktop with Linux containers. In PowerShell at the repository root run `npm ci`, `npm run verify:release`, and `npm run test:live`. Record the command outcomes. The live probe returning `needs_human` proves connectivity only; the later agent action must be assessed separately.
3. Copy `.env.example` to `.env` if needed. Set `NEXT_PUBLIC_NEAR_NETWORK=testnet`, `NEXT_PUBLIC_CONTRACT_ID` to the deployed testnet contract, unique local secrets, the database and private-file paths, the NEAR AI model/key, and the worker token. Keep `.env` uncommitted. Check the configured contract's `health` view or the recorded deployment manifest before funding anything.
4. Start `npm run dev:worker` and `npm run dev:web` in separate terminals. Open `http://localhost:3000`. Use separate browser profiles for A, B, and C; a private window is acceptable for a temporary profile. Each profile must connect its own wallet and complete the signed login challenge. Do not copy session cookies between profiles.
5. Choose a **new** release ID such as `browser-<date>-<random>`, recording ID `ISRC-DEMO-001`, and a payment month later than any already finalized month in that release. Use a current or future valid `YYYY-MM` month in both CSVs. The examples under `fixtures/statements` use `2026-10`; change the period in your private test copies if needed. Use testnet NEAR only.

## Membership and agreement

6. In the administrator profile, choose **Start a release**. Enter the unique release ID, recording ID, funder account, and the three owner IDs. Submit and approve the `create_release` wallet request. Record its transaction hash. If the app asks for local confirmation, use **Recover local release confirmation** only after checking the contract release exists.
7. In each owner profile, open the release ID. Choose **Accept invitation**, approve `accept_membership` in that owner's wallet, then refresh. Confirm all three IDs appear as accepted. Try opening the release as a fourth, uninvited wallet: private pages and API data must be denied. A wallet name alone must not create a session.
8. In the administrator's **Agreement** page, set shares to A **6000**, B **2500**, C **1500** basis points. Set the effective period to the chosen month. Enable recoupment code `advance-v1`, beneficiary B, cap **2 NEAR**. Choose **Freeze** and approve the wallet request. Confirm the exact version from the contract, then have A, B, and C open the downloadable agreement and compare its terms, document hash, and approval digest. Each owner approves from their own wallet. Agreement state must become active only after the third approval. Record all four transaction hashes.
   Before freezing, each accepted owner can open **My agent**, select **Use NEAR AI Cloud**, and review any structured terms proposals shown under **Shared terms proposals**. A counteroffer should cite an existing proposal ID from the same release. Compare proposed economics with the manually entered agreement; only the owner wallet can freeze or approve the agreement. If no structured proposal appears, record the live negotiation check as unverified rather than treating the standalone model probe as a three-owner negotiation.
9. Negative check: before the last approval, try to use a non-owner/agent account to approve. It must fail on-chain. Do not rely on a hidden or disabled button alone as proof.

## Mandates and evidence review

10. In B's **My agent** page, save private instructions such as “Flag deductions without a receipt.” Configure B's separate agent account. Grant a one-day mandate with gross cap at least **10 NEAR** and the intended approval/dispute methods. Verify the wallet request lists the correct contract, agent, agreement version, expiry, and cap. Check the chain's `get_release` view for the active mandate. In A's profile, verify B's private instructions are not visible.
11. Make a private copy of `fixtures/statements/unsupported-claim.csv`, changing its period to the chosen month. In the administrator's **Statements** page, import it. It should show **10 NEAR gross**, one unsupported claim (`ded-001`), and **not payable**. In each owner profile, confirm the shared validation summary is visible while the administrator's original private file and every owner's private instructions remain inaccessible.
12. In **Payments**, select the same month and choose **Open statement for review**. Approve the wallet request. The settlement should be in review, with approval/finalization blocked by invalid evidence. Have B raise an evidence hold citing `ded-001`; if using the live agent, choose **Use NEAR AI Cloud** in B's agent page and inspect its validated action and any chain operation. A live response of `needs_human` is not a successful objection. If the model misses the issue, use B's owner wallet to raise the hold and record that the agent criterion remains unverified.
13. Attempt to finalize the held settlement. Expect a rejection and unchanged ledger amounts. Record the transaction outcome or the server's explicit `ERR_EVIDENCE_NOT_PAYABLE` response. A rejected request must not look like a confirmed payout.

## Correction, funding, and payout

14. Make a corrected private CSV by removing the unsupported deduction row while retaining the same release recording and period. Import it as a new statement revision. In **Payments**, select the month and choose **Use corrected statement**. Approve the `revise_settlement` wallet request. Verify the chain revision increased, the old approvals are gone, and B's hold remains. Have B explicitly choose **Clear my hold** after reviewing the correction.
15. Have A, B, and C approve the current settlement digest with their own wallets, or use a valid current mandate for one delegated approval. If testing an agent, record the model result and restricted-key transaction separately. Confirm a revoked/expired agent cannot add a new valid approval. An owner must still be able to approve directly.
16. In the funder profile, deposit **10 NEAR** to the selected release-period. Check wallet receiver, attached deposit, contract settlement reserve, and transaction hash before proceeding. Try finalization while underfunded first, if using a separate trial release; it must fail. Once fully funded, finalize. The first period's expected entitlements are A **4.8 NEAR**, B **4.0 NEAR** (including 2 NEAR recoupment), C **1.2 NEAR**. The three amounts must sum to 10 NEAR exactly.
17. Trigger **Pay** once for each entitlement. Refresh after each transaction. Confirm `Paid` only when the contract's `get_settlement` view and final child transfer/callback receipts agree. Record the transaction and child receipt IDs; a submission hash alone is insufficient. The final settlement should be `Complete`, `successful_payouts_yocto` should equal the funded 10 NEAR, and `in_flight_yocto` should be zero. Try a duplicate payout trigger; it must fail without a second transfer.
18. Optional accounting check: create a second, later period with 10 NEAR gross after the first completes. With the 2 NEAR advance exhausted, expected shares are A **6 NEAR**, B **2.5 NEAR**, C **1.5 NEAR**. A prior period's refundable excess must remain separately backed and withdrawable by the funder.

## Recovery and isolation checks

19. During a separate small test operation, close or refresh the browser while the wallet prompt is open. After reconnecting, inspect the contract state and any pending operation before attempting another deposit or payout. If the wallet gave no final response, mark the outcome **unknown** until a chain read resolves it; do not blindly repeat a funding transfer.
20. Switch from A to B in the same profile and refresh. A's private instructions must disappear and B's identity must appear. Log out and use direct page/API URLs; private data must return an unauthorized result. Reconnect A and confirm its own data remains intact.
21. Stop and restart the worker after a model job or signed operation is pending. Confirm the original job/operation ID remains and that no second financial transaction was created. If the UI lacks a way to inspect this, record the case as **unverified**, not passed.

## Record the result

Copy this table into a private evidence note and fill every row with an observation. Use `pass`, `fail`, or `unverified` only.

| Check | Result | Account / period | Transaction or receipt IDs | Screenshot or observation |
| --- | --- | --- | --- | --- |
| Three independent wallet logins and membership |  |  |  |  |
| Agreement freeze and three owner approvals |  |  |  |  |
| Mandate and private-preference isolation |  |  |  |  |
| Invalid claim, hold, rejected finalization |  |  |  |  |
| Corrected revision, owner clearance, fresh approvals |  |  |  |  |
| 10 NEAR funding and 4.8 / 4.0 / 1.2 allocation |  |  |  |  |
| Three final transfer and callback receipts |  |  |  |  |
| Duplicate payout and revoked-agent rejection |  |  |  |  |
| Browser refresh, account switch, worker restart |  |  |  |  |
| Useful live model proposal or evidence-backed objection |  |  |  |  |

Keep screenshots limited to visible account IDs, testnet labels, terms, states, and hashes. Do not mark Phase 08 or Phase 09 browser acceptance complete until every required row has direct evidence at the same code and deployed contract revision.
