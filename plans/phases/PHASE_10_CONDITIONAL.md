# Phase 10 — Conditional Integrations

Status: deferred by default. Depends on: [Phase 09](PHASE_09_RELEASE.md) and branch-specific prerequisites. Control: [master plan](../MASTER_IMPLEMENTATION_PLAN.md).

## Scope and evidence rule

These are three independent optional branches, corresponding to [F-12, F-13 and F-14](../../docs/FEATURES.md) and [technical design section 11](../../docs/TECHNICAL_DESIGN.md). They do not block completion of the native NEAR P0 product. Select a branch deliberately and record its status separately; completing metadata does not mark Intents complete.

Refresh current official documentation and relevant Context7 references before implementing SDK/API behavior. Record actual supported versions and access. The source product documents describe the integration boundaries, not verified availability.

## Branch 10A — One NEAR Intents payout

### Entry requirements

- Mainnet execution has explicit user authorization, independent mainnet funds/accounts and a bounded pilot amount. The supplied hackathon overview states there is no Intents testnet.
- A design review has resolved entitlement-to-quote authorization binding and trusted signer/adapter assumptions. The native contract's immutable owner payout path remains intact.
- Supported asset/network route, quote validity, destination and refund recipient are confirmed from current provider documentation.

### Tasks

- **P10A-01:** Write `docs/decisions/intents-authorization.md` with exact signed/verified data, trust boundary, replay protection and failure handling. Specify how recipient, source entitlement, asset, maximum input, fee bound, expiry, destination and refund account are authenticated together. An API response alone is not on-chain proof.
- **P10A-02:** Implement an isolated adapter with quoted/authorized/deposit_pending/processing/success/refunded/failed/unknown states. Persist quote identity and execution operation before any funding. The backend cannot substitute an arbitrary deposit address in the native payout method.
- **P10A-03:** Test wrong recipient, tampered quote/address, expired quote, unsupported route, duplicate deposit request, fee excess, RPC/API timeout, partial status visibility and refunds. Unknown status retains the obligation and never causes another payout.
- **P10A-04:** Execute the specifically authorized pilot and reconcile source deposit, destination settlement or actual refund with independent receipts. Testnet entitlements never represent backing for this mainnet transfer.

### Exit and evidence

F-12 requires authenticated binding, actual supported destination receipt and proved refund/unknown semantics. Save the separate environment, adapter version, non-sensitive authorization evidence and source/destination receipt references in `plans/evidence/PHASE_10A.md`.

If authorization binding or mainnet permission is missing, only a clearly labeled dry quote preview is eligible. Record F-12 as deferred/blocked; a quote is not a completed payout.

## Branch 10B — Verified inference evidence

### Entry requirements

The supported NEAR AI gateway verification path is available for the chosen model/request path. Its endpoint evidence and response-integrity requirements are understood separately. Ordinary live inference already works through P0.

### Tasks

- **P10B-01:** Document the current verification policy and accepted measurements/signers. Use the official route-specific verification procedure rather than treating an HTTPS response as an attestation.
- **P10B-02:** Verify endpoint evidence for the actual connection and, where available, the response signature against the expected request/response and attested signer. Bind saved results to the exact model action.
- **P10B-03:** Test missing, expired, tampered, wrong-connection, wrong-signer and mismatched-response evidence. Fail closed for verified labeling while preserving accurately labeled ordinary inference if permitted by the configured policy.
- **P10B-04:** Add a factual evidence display specifying which properties were verified. Do not label correct financial reasoning, agent-host security or operator confidentiality as proved by model endpoint attestation.

### Exit and evidence

F-13 passes only when required verification succeeds on a real supported path and negative fixtures suppress the badge. Save sanitized verification artifacts and policy version in `plans/evidence/PHASE_10B.md`. Unavailable response signatures remain explicitly unverified.

## Branch 10C — Spotify catalogue metadata

### Entry requirements

Authorized app credentials and the actual permitted endpoint are available. Manual recording identity entry continues to function without the integration.

### Tasks

- **P10C-01:** Verify current endpoint access and response schema with official documentation; implement a server-side adapter for explicitly supplied recording IDs/links.
- **P10C-02:** Normalize metadata with provider/source identifiers, retrieval time and confidence where applicable. Require user confirmation of recording identity; do not overwrite active financial terms.
- **P10C-03:** Handle invalid IDs, inaccessible app scope, rate limits, timeout and unavailable tracks. Keep credentials server-side and return a usable manual fallback.
- **P10C-04:** Test that metadata cannot create earnings, funded reserves or an implied fixed stream-to-money rate.

### Exit and evidence

F-14 passes with actual authorized metadata/provenance plus fallback evidence, saved in `plans/evidence/PHASE_10C.md`. Simulated provider payloads prove parser behavior only.

## Regression and handoff

Each branch adds named tests to the existing command contract and reruns affected P0 cases. Any contract or payment change requires contract, sandbox, accounting and recovery regression before live use. Update feature claims, matrix and release manifest for the exact branch evidence; leave unselected branches deferred. No optional integration may weaken the native payout, privacy or authorization invariants to make a demonstration appear complete.
