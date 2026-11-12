# RoyaltyDesk: complete web app walkthrough

This guide explains the product in plain language and gives you a click-by-click test of every feature currently exposed in the web app. It describes the running implementation, not a future product idea. Use **NEAR testnet accounts and testnet NEAR only**. The sample CSVs are synthetic; they do not represent money earned from Spotify or Bandcamp.

**Vision update:** this is a walkthrough of the existing royalty-administration prototype. The intended product is an [agent-led music studio](PRODUCT_VISION_ALIGNMENT.md) in which agents create songs/albums, publish them to an in-app catalogue, and split revenue from paid purchases and tips. The administrator chooses whether a human must approve protected actions or agents run autonomously. Those studio features are not present in this web app yet; the new [implementation plan](../plans/AGENT_MUSIC_STUDIO_IMPLEMENTATION_PLAN.md) tracks them separately.

## What the platform does

RoyaltyDesk helps a small group divide the income reported for one music recording. A release has a fixed list of owners. The owners approve a written split agreement. An administrator imports a monthly CSV statement. Owners review the statement, approve it or put it on hold, and a designated funder deposits testnet NEAR. The contract calculates each owner's entitlement and sends each payment separately. Personal AI agents can suggest terms or review evidence, but the contract and wallet permissions decide what is allowed.

The important distinction is **reported amount versus deposited money**. A CSV saying “10 NEAR” creates no money. The registered funder must actually deposit 10 testnet NEAR before the contract can finalize and pay that month.

```text
Create release → Owners accept → Freeze agreement → Every owner approves
       → Import statement → Open payment month → Owners review/hold/approve
       → Funder deposits → Administrator finalizes → Pay each owner
```

### Who does what

| Role | In the walkthrough | Can do in the web app |
| --- | --- | --- |
| Administrator | D | Create the release, prepare agreement versions, import statements, open/revise payment months, finalize. |
| Owner | A, B, C | Accept an invitation, approve an agreement, set private agent instructions, grant/revoke agent permission, approve or hold a payment month, clear their own hold, vote to cancel. |
| Registered funder | D | Deposit NEAR to a particular month and withdraw refundable excess. |
| Agent account | E, optional | Make recommendations; with a separately configured restricted key and a current owner mandate, perform only allowed contract methods. |
| Any accepted member | A, B, C, D | See the release's public contract facts and their authorized workspace information. A payout trigger cannot change the recipient or amount. |

One wallet may hold multiple roles, but this guide uses **four distinct human wallets** so you can see the permission boundaries. The administrator D is also the funder. You can use D as an owner too, but then adapt the owner list and the expected shares.

### Words you will see

- **Release:** One recording and its fixed invited owner list. The release ID is an app/contract identifier, not a song title.
- **Agreement version:** Frozen terms for a recording: owner shares, first applicable month, and optionally a capped recoupment. A new version needs fresh approvals.
- **Basis points:** Whole-number shares. 10,000 basis points = 100%; 6,000 = 60%.
- **Recoupment:** A capped amount returned to one named owner before splitting the rest. In the example, B first receives 2 NEAR, then the remaining 8 NEAR is split 60/25/15.
- **Statement:** An uploaded CSV claiming what a recording earned in a month. Its source and truth are not independently verified by this app.
- **Payment month / settlement:** One contract record binding a specific statement revision and agreement version to a month.
- **Hold / dispute:** An owner's objection. It blocks finalization until that same owner clears it. Revising the statement does not erase the hold.
- **Reserve:** NEAR actually deposited for a month. **Entitlement** is the immutable amount owed to an owner after finalization. **Paid** means the transfer callback succeeded.
- **Mandate:** An owner-approved, time-limited authorization for a separate agent account. Saving agent instructions does not grant a mandate.
- **Wallet activity:** Local record of requested/submitted/unknown wallet operations. A transaction link by itself is not proof that a child payout transfer completed.

## Before opening the app

1. Install Node.js 24+, npm 11, and Docker Desktop with Linux containers. At the repository root run `npm ci` and `npm run verify:release`. The latter is the automated contract, server, recovery, and HTTP smoke suite. It does not replace your browser test.
2. Copy `.env.example` to `.env` if needed. Set `NEXT_PUBLIC_NEAR_NETWORK=testnet`, `NEXT_PUBLIC_CONTRACT_ID` to the deployed testnet contract, `ROYALTYDESK_AUTH_ORIGIN=http://localhost:3000`, and unique `ROYALTYDESK_STORAGE_SECRET` and `ROYALTYDESK_WORKER_TOKEN` values of at least 32 characters. Set the database and private-file paths. The example contract name is a placeholder. See [README](../README.md) for deployment and key setup.
3. For **live AI** testing, set a funded `NEAR_AI_API_KEY` and supported `NEAR_AI_MODEL` in `.env`. For **delegated on-chain agent actions**, also set `ROYALTYDESK_AGENT_KEYSTORE_PATH` to a private directory containing E's restricted function-call key. Those are separate tests: live inference can run without a signing key, and a saved agent profile alone cannot send transactions.
4. Start `npm run dev:worker` and `npm run dev:web` in two PowerShell windows. Open `http://localhost:3000`. Keep both terminals running. If the worker is off, **My agent → Review with agent** will fail, but the human workflow can still proceed.
5. Prepare four browser profiles or browsers: D (administrator and funder), A, B, and C (owners). Each must control its own `.testnet` wallet with some testnet NEAR for transaction fees; D needs enough testnet NEAR for the example deposit. Do not share a browser session cookie between them. E is a separate agent account if you want to test delegated signing.
6. Pick a unique release ID, for example `walkthrough-20261111-01`, and recording ID `ISRC-DEMO-001`. Use a first month such as `2026-11` and a later second month such as `2026-12`; both must be on or after the agreement's first payment month. In **private copies** of the sample CSVs, replace `2026-10` with your first month. Do not edit the repository's original fixtures.

## First look: header, home, and wallet login

1. The header shows **NEAR testnet** and **Connect wallet**. Click **Connect wallet** in D's profile. Choose D's testnet account and approve the **message-signing** request. This establishes an app session; it does not transfer NEAR. D's account ID should replace the button. Repeat separately for A, B, and C.
2. On **All releases** (`/`), inspect the four explanation cards. **Your releases** shows releases linked to the current wallet. **Have a release ID?** opens a release by ID. A wrong ID should show a load error. The left sidebar provides **All releases** and **Create a release**.
3. Test **Sign out** in a spare profile. The account ID disappears; the release list should no longer show private memberships. Sign in again. A direct release URL may still show public contract facts; private API data, uploaded file content, agent preferences, and owner actions must remain restricted.

## 1. Create and join a release

1. In D's profile, click **Create a release**. Enter your unique release ID, `ISRC-DEMO-001` as the recording ID, D's account as **Who will deposit testnet NEAR?**, and A, B, C in **Owner accounts**, one per line. Include D in the owner list only if D should also approve terms. The owner list is fixed on-chain at creation.
2. Click **Create release on testnet**. In the wallet, check that the receiver is your configured contract and the method is `create_release`; approve. The app should open the release overview. If wallet success and local confirmation diverge, use **Confirm existing transaction** on the creation page or **Recover local release confirmation** on the Overview after verifying the release exists on testnet.
3. In each of A, B, and C, open the release from **Your releases** or **Have a release ID?**. The Overview should show **Invitation waiting** and **Accept invitation**. Click it and approve `accept_membership` in that owner's wallet. If the chain transaction succeeded but the page still says Waiting, click **Already accepted in wallet? Confirm here**, then **Refresh**.
4. Confirm Overview shows **3/3 accepted**. The role badge in each profile should say **Owner**; D should say **Administrator**. In **My wallet activity**, look for your own actions and any transaction links. Refresh the page and confirm the activity remains.

**Check the rejection path:** Try a fifth, uninvited wallet. It can view public contract facts by release ID, but cannot accept an invitation or retrieve the private statement/agent data. Trying to create a release with duplicate owners, fewer than two owners, an invalid `.testnet` account, or an invalid release ID should show form errors before a wallet prompt.

## 2. Prepare and approve the agreement

1. In D's release, click **Agreement**. The **Current agreement** card initially says none exists. Under **Set owner shares**, set A to `6000`, B to `2500`, C to `1500`. The total must be 10,000. Set **First payment month** to your first month.
2. In **Deduction cap**, choose **Add a capped recoupment**. Enter `advance-v1` as the statement deduction code, B's account as **Owner receiving recovery**, and `2` as **Maximum to recover (NEAR)**. This is an example of a recoverable advance; it does not send B 2 NEAR at agreement time.
3. Click **Freeze version 1** and approve the wallet's `freeze_agreement` transaction. Wait for the app to confirm the frozen version. If needed, use **Confirm version 1 from contract**. The card should say **Waiting for approvals**, and **Read frozen document** should download its Markdown text.
4. In A, B, and C, use **Agreement → Read frozen document** and inspect the downloaded file. Compare the recording, period, shares, recoupment, version, and document hash. Each owner clicks **Approve version 1** and approves the wallet transaction. Refresh. The last approval should make version 1 **Active**. D alone cannot approve for them.
5. To test amendment behavior later, D can prepare **version 2** with a later effective period, then each owner must approve again. Use a separate release or wait until the first period is completed; changing terms mid-test makes the payment example harder to follow.

**Check the rejection path:** Enter shares totaling `9999`; the form should reject them. An unaccepted owner cannot approve. An agent account cannot approve initial agreement terms. Do not infer contract rejection solely from a hidden button: if you need on-chain proof, use a separate test account and record the failed transaction.

## 3. Set up an owner's personal agent

1. In B's profile, click **My agent**. In **Private instructions**, enter E's `.testnet` account and a sentence such as `Flag any deduction without a receipt; ask me before approval.` Click **Save instructions**. This saves encrypted app data; no wallet request is expected. Refresh and confirm B sees the saved text. A must not see B's instructions.
2. In **Ask your agent**, choose the first month and **Preview with a test fixture**, then click **Review with agent**. Expand **View agent response**. Fixture mode is deterministic and does **not** call NEAR AI Cloud. If there is not yet a statement or enough context, a human-review result is valid; this is not evidence that it found a deduction.
3. Once the invalid statement is imported in step 4, repeat in **Use NEAR AI Cloud**. Inspect the action, rationale, evidence IDs, and status in the response. A live model may say `needs_human`; that is a request for review, not an objection or approval. The worker must be running, and the AI key/model configured.
4. After version 1 is active, set E under **Wallet permission**, set the maximum statement gross to at least `10` NEAR, and click **Grant one-day permission**. Approve the wallet's `set_mandate` transaction. The active mandate should show E, its gross limit, and agreement version. The UI grants the fixed methods `approve_settlement` and `dispute_settlement`; it does not offer arbitrary method selection.
5. Click **Revoke permission** and approve `revoke_mandate` when you are ready to test revocation. Subsequent delegated calls under that mandate must fail. B can still act with B's own wallet. To test successful delegation first, postpone revocation until after the agent has made a valid action.
6. If an agent returns `propose_terms` or `counter_terms`, **Shared terms proposals** lists the structured split and any parent proposal ID for accepted owners. Those suggestions do not change the agreement. The current web form does not let you directly convert a proposal into a frozen agreement; D must enter the agreed numbers in **Agreement**. A live model is not guaranteed to propose terms on every run.

**Check the rejection path:** Enter a cap of `0` or an invalid agent account; the form should reject it. An administrator who is not an accepted owner should see that owner agent permissions are unavailable. Repeat an agent call with a stopped worker to see an explicit error. Do not paste secret keys into **Private instructions**.

## 4. Import and review a statement

1. In D's **Statements** page, use **Choose a CSV file** or **Or paste CSV contents** with your private copy of `fixtures/statements/unsupported-claim.csv` and the selected month. Click **Import and validate statement**. No wallet prompt is expected. The page should show **10 NEAR gross**, revision 1, and a claim to review. The unsupported row is `ded-001` with code `unapproved-marketing`.
2. In an owner profile, open **Statements**. The owner sees the period, gross, statement ID, revision, and payable/claim status. The original upload is kept in private encrypted storage; the UI is a validation summary, not a file-download screen.
3. In D's **Payments**, choose the same month and click **View month**. It should say no payment period is open. Click **Open statement for review**, approve the wallet's `open_settlement` transaction, and view the month again. Its status should be **Review** or **Held**; the unsupported claim makes **Approve this month** and **Finalize approved month** unavailable or rejected.
4. In B's **Payments**, enter a reason of at least 10 characters under **Need to raise a hold?** and click **Raise evidence hold**. Approve `dispute_settlement`. The app puts only a hash of the reason on-chain, so keep the actual wording in your private notes. Refresh and see **Held**.
5. In D's **Statements**, import a private copy of `fixtures/statements/canonical.csv` for the same month. This has the same 10 NEAR gross without the unsupported deduction. It should appear as a later revision and **Payable**. In D's **Payments**, click **Use corrected statement** and approve `revise_settlement`. Refresh: the settlement revision changes, old approvals cannot be reused, and B's hold remains until B clicks **Clear my hold** in B's profile.

**Check the rejection path:** Import `fixtures/statements/duplicate-line.csv` or `invalid-amount.csv` after editing its period to your test month. Expect a clear import error and no payable new revision. Reimport the exact canonical CSV; it should not create a second economic period. Try a CSV above 1 MB; the form or server should reject it. Only D can import. A non-admin owner should see statements but not the import form.

## 5. Approve, fund, and finalize a month

1. After B clears the hold, A, B, and C each open **Payments**, choose the first month, click **View month**, and review the current revision. Each clicks **Approve this month** and approves `approve_settlement` in their own wallet. The approval is bound to this exact statement and agreement version. If B's agent has a current mandate and restricted key, you can separately test its delegated approval; the ordinary owner-wallet path is the reliable manual route.
   The current Payments page shows the agreement version, statement revision, gross, and status before finalization, but does **not** display a per-owner allocation preview there. Compare the agreed shares and recoupment against the statement yourself before approving, then check the exact entitlements after finalization.
2. In D's **Payments**, inspect the metrics: **Reported gross** is 10 NEAR, **Reserved obligations** is initially 0, and **Paid to owners** is 0. Under **Funder actions**, enter `10` in **Amount (testnet NEAR)**, click **Deposit to reserve**, and approve `fund_settlement` with a 10 NEAR attached deposit. Check the wallet receiver and amount carefully. Refresh the month and verify the reserve increased. Importing the CSV did not make this deposit.
3. In D's **Administrator actions**, click **Finalize approved month** and approve `finalize_settlement`. If any owner approval, funding, evidence, or hold is still missing, the contract must reject finalization. Once it succeeds, the settlement status is **Finalized** and entitlements are fixed.
4. Expected first-month entitlements with the example terms are **A 4.8 NEAR, B 4.0 NEAR, C 1.2 NEAR**. The contract gives B the first 2 NEAR of the cap, then divides the remaining 8 NEAR by 60/25/15. The displayed amounts must total exactly 10 NEAR.

**Check the rejection path:** On a separate small trial month, try finalizing before full funding; it must fail. If you revise an approved statement, those earlier approvals must disappear. If a hold remains, finalization must fail. Record the contract state after each failure; a wallet prompt or transaction hash alone is not success.

## 6. Pay owners and inspect receipts

1. In **Payments**, click **Pay** beside A, then B, then C. Confirm each wallet request is `execute_payout` for the intended release, month, and owner. The amount and destination come from the finalized contract entitlement; the button cannot edit them.
2. After each call, click **View month** or the release **Refresh** button. A transfer may briefly be **Pending**. Wait for the contract's asynchronous transfer and callback. Only count a payment as completed when the entitlement says **Paid** and the final child transfer receipt succeeded. Use the transaction link in **My wallet activity** and the testnet explorer to inspect the receipt chain.
   The app shows entitlement status and a top-level transaction link; it does **not** present child receipt details in its own page. Use the testnet explorer for that evidence.
3. After all three succeed, **Paid to owners** should be 10 NEAR, **Still owed** should be 0, and the settlement should become **Complete**. Record the three amounts and transaction/receipt IDs.
4. Test duplicate protection by trying to trigger the same paid owner again through an authorized test transaction or checking that the UI no longer offers a valid Pay action. The contract must not transfer twice.

**Failure and recovery:** If a recipient transfer actually fails, its entitlement must remain owed or become retryable only after the failure callback. A pending or unknown transfer must not be blindly retried. This branch is hard to force safely through the normal web UI; the automated sandbox and fault-injection suites cover it. Mark the browser case **unverified** if you did not observe a real failure.

## 7. Other branches to test on separate periods or releases

| Feature | How to exercise it | Expected result |
| --- | --- | --- |
| Second month after recoupment | Import a new 10 NEAR CSV for a later month, open, approve, fund, finalize, pay. Use new statement/line IDs. | The 2 NEAR cap is already exhausted; shares become A 6, B 2.5, C 1.5 NEAR. |
| Excess deposit/refund | On a separate month, deposit more than the 10 NEAR gross and complete or cancel as appropriate. D clicks **Withdraw ... refundable NEAR** when shown. | Only D can withdraw the refundable amount; finalized owner entitlements remain backed. |
| Cancellation | On a separate month still in Review/Held, each owner clicks **Vote to cancel this month**. | Cancellation needs all owner votes; reserved funds become refundable to D. Do not use the main happy-path month. |
| Agent revocation | Grant a mandate to E, test an allowed delegated action, then click **Revoke permission** in B's profile. | A later E call under the revoked mandate is rejected; B's direct wallet actions remain available. |
| Browser interruption | On a separate harmless wallet operation, refresh while a wallet prompt is open. Reopen Overview → **My wallet activity**. | Requested/unknown operation remains visible. Check chain state before attempting it again. |
| Account switching | Sign out of B, sign in as A in the same profile, then open **My agent**. | B's saved instructions must not appear; A sees only A's data. |
| Agreement amendment | After a completed month, D freezes a new version effective in a later month; all owners approve. | Earlier finalized payments do not change; old mandate authority does not silently apply to the new agreement. |

## Screen and action checklist

Use this as a quick coverage list after completing the walkthrough. Mark `pass`, `fail`, or `unverified`; do not use `pass` for a button you never clicked.

| Screen | Actions to try | Result |
| --- | --- | --- |
| Header and home | Connect wallet, sign message, sign out, list/open release, invalid release ID |  |
| Create release | Valid 3-owner form, validation errors, wallet transaction, local confirmation recovery |  |
| Overview | Accept invitation, confirm acceptance, Refresh, role badge, owner count, wallet activity, transaction link |  |
| Agreement | Invalid share total, capped recoupment, freeze, read document, three approvals, later version |  |
| Statements | File upload, paste CSV, supported/unsupported claim, duplicate/invalid file, revision, owner summary |  |
| Payments | View month, open, hold, revise, clear hold, approve, deposit, finalize, pay, refund, cancellation |  |
| My agent | Save/reload private instructions, fixture run, live run, shared proposals, grant/revoke mandate |  |
| Recovery/privacy | Refresh during wallet action, owner switch, outsider access, pending payout, worker restart |  |

For each wallet transaction, note **who signed, method, amount attached, transaction hash, final status, and changed contract state**. For payouts, also note the child transfer/callback receipt. Put these notes in a private file. Never save wallet keys, API keys, cookies, or raw private instructions in the repository.

The separate [manual browser verification checklist](MANUAL_BROWSER_VERIFICATION.md) has a compact evidence worksheet for the three-owner acceptance journey. [Phase 09 evidence](../plans/evidence/PHASE_09.md) remains open until the browser journey has actually been observed and recorded. Optional Phase 10 integrations—mainnet Intents payout, verified inference attestation, and Spotify catalogue metadata—are outside this testnet web app walkthrough.
