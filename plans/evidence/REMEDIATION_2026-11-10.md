# Important-findings remediation

Implemented so far:

- Reject duplicate release registration under an SQLite write transaction, preventing callers from granting themselves administration of an existing local release.
- Preserve consumed recoupment on agreement amendment.
- Permit the original disputing owner to clear their preserved hold after a correction.
- Reject periods before the agreement effective period or at/before an already finalized period.
- Return contract-compatible snake_case settlement inputs and calculate the contract settlement digest for agent context.
- Stop automatic resubmission of existing operations, including unknown operations without a transaction hash. This is a fail-closed mitigation; durable pre-broadcast signing and automatic reconciliation remain unfinished.

Verification: workspace checks, production web/contract build, 15 server tests (including ambiguous-response replay regression), and the existing compiled-WASM sandbox suite passed.

The added `npm run test:contract-regressions` exercises dispute correction, amendment accounting, and period ordering against the compiled production contract in a disposable sandbox. Its underlying command completed successfully: corrected holds cleared, earlier periods were rejected, and the amended agreement paid the expected 50% share without recouping the exhausted advance again.

Follow-up implementation on 2026-11-10:

- Owner console signs API-returned contract transaction requests through the connected testnet wallet, after checking that the wallet account matches the authenticated session. Login/logout refreshes console session state. Release creation, membership acceptance, agreement freeze/approval and selected settlement/payout actions now have controls or transaction requests.
- Live personal-agent recommendations pass through current on-chain mandate and access-key permission checks before the restricted signer; fixture recommendations stay review-only.
- The signer persists signed bytes/hash before broadcast. Worker startup and a 15-second loop reconcile signed/unknown transactions by their original identity. Agent signing requires a private worker API token and an account-specific restricted key file.
- `npm run check` and all 15 server tests passed after these changes. The web smoke and full build checks are recorded separately once complete.

Further integration work:

- Release creation and agreement freezing now return contract transaction requests, and the console can submit acceptance, agreement approvals, reserve funding, dispute clearance, finalization and payout requests with an account-matched wallet. Contract settlement state can be read directly to derive the exact approval digest.
- SQLite schema v4 supports overlapping administrator, owner and funder roles. An old single-role database migrates without losing membership. Two new role tests passed.
- Web and worker scripts load the same root `.env`; relative database and private-file paths resolve from the repository root. Node 24 is the supported runtime baseline.
- Agent model runs now use durable job records. A restart test verified that a completed fixture job returns its persisted result without another model call.
- Owner mandate creation and revocation now return wallet requests, with corresponding console controls.
- The worker derives the session digest from the exact prompt context it later checks. The web app sends that context when creating the session, removing the previous digest mismatch.
- Local administrator membership is recorded only after the contract read confirms the on-chain release administrator. The confirmation action can be retried after an RPC failure.
- `docs/SETUP.md` now reflects the Dockerfile, Node baseline and server-side wallet verification.
- Settlement opening now rejects a client commitment unless it matches the latest stored payable statement, its gross amount and revision, the frozen agreement recording and participant shares. The console uses the imported statement hash and gross instead of a fabricated statement hash.
- Latest verification after these changes: `npm run check`, 18 server tests and the web production build passed. The HTTP smoke suite passed after the release confirmation route was added. No live wallet journey was performed.
- Latest local checks: `npm run check`, 18 server tests, web production build and HTTP smoke test passed. The Docker-backed full build succeeded before the later web/job changes; the contract itself was unchanged by those changes.

Still required for full end-to-end acceptance:

- Complete mandate setup, settlement correction, all settlement steps and role-aware navigation in one coherent owner workflow. Current screens still require manual fields and have no complete three-owner journey.
- Validate process-crash recovery around real broadcasts.
- Expose confirmed chain reads and final payout receipts in the UI; a submitted transaction hash alone is not a payment receipt.
- Prove authenticated API isolation, cross-layer transactions and the complete browser workflow with regression tests.

At the time of the initial remediation above, no deployment had been performed. The original review remains a historical record of findings before these changes; this file does not mark all findings resolved.

## 2026-11-10 continuation: current working tree

- Read the repository NEAR API JS, dApp, smart contract, and AI Cloud skills; checked NEAR Docs MCP for wallet and RPC transaction behavior and Context7 for near-api-js provider signatures.
- `open_settlement` requests now derive the latest payable statement, active contract agreement and recoupment already consumed on-chain. The server computes the integer entitlement preview and hashes its canonical data; the caller no longer supplies arbitrary recoupment, funded amount, owner list, or preview hash. The contract release view now exposes recoupment cap and consumed amount.
- Personal-agent context reads the actual on-chain settlement before producing a settlement digest, so a prepared local projection cannot by itself trigger a recommendation.
- The console now defaults to the three-owner 60/25/15 example, can read contract release state to populate the current agreement version and approval digest, and can execute a payout for a selected owner. Agreement and mandate actions use the selected version instead of a hard-coded version 1.
- The settlement API and console now expose a correction action for a newer payable statement while the chain settlement is in review or held state. The same server-derived commitment and allocation preview are used for opening and correction; unchanged statements are rejected for correction.
- `npm run verify:release` passed all 10 offline suites on this working tree: check, build, domain, contract, server, agents, recovery, HTTP smoke, sandbox, and fault injection. The compiled contract SHA-256 was `0d4d72b7fdc2342262c5ee36d99ad29575744e6bbedbf216105754f0988d932e` during this run. The subsequent web workflow changes were followed by passing `npm run check` and `npm run build --workspace @royaltydesk/web`.
- `npm run test:contract-regressions` passed against the compiled contract, including the new recoupment view assertion, dispute correction, period ordering, and amendment carry-forward.
- `npm run test:live` completed one NEAR AI Cloud inference on model `z-ai/glm-5.3-flash`; it returned `needs_human` using 32 input and 274 output tokens. This is gateway evidence, not a completed agent-authorized chain action or TEE attestation.

Deployment was later completed and verified on `sickhat6192.testnet`; see `plans/evidence/TESTNET_DEPLOYMENT_2026-11-10.md`. A live CLI journey with three owner accounts, one delegated agent account, real NEAR AI inference and three confirmed payouts is recorded in `plans/evidence/LIVE_JOURNEY_2026-11-10.md`. The UI is still a manual console and has not passed a full browser wallet journey. The release suite report is `plans/evidence/artifacts/release-suite.json`; it covers offline checks only.

After the live journey, the worker model timeout was increased to 120 seconds and `WorkerAgentService` now heartbeats its durable job lease during inference and signing. The live job that exposed the expired lease was recovered only after its finalized approval transaction and successful persisted chain operation were verified. The full `npm run verify:release` gate then passed all 10 offline suites, and `npm run verify:deployment -- CshZsy29hEh9R548asV8be8SCdTR7UnKhx7mDd1gLvrd` confirmed the rebuilt artifact still matches the deployed code. The ignored local `.env` now points to the private agent keystore outside this repository.
