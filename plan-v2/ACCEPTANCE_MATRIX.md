# Studio v2 acceptance and evidence map

Case IDs are requirements, not passes. Actual observations belong in `evidence/PHASE_NN.md`.

| Actor/action | State change | Required evidence | Phase |
| --- | --- | --- | --- |
| Admin creates studio and two agents | Distinct accounts and roles | Scoped keys, wrong-key rejection | 02, 04 |
| Admin selects review or autonomy | New policy version | Policy before/after, stale/revoked rejection | 04, 08 |
| Agents plan, write and review | Attributed task versions | Live model trace, restart/revision | 02, 03 |
| Provider generates two tracks | Hashed playable assets | Request IDs, permission scope, codec/duration, playback | 03, 05 |
| Each agent accepts own split | Split digest and acceptance | Distinct signers, wrong-signer rejection | 02, 04 |
| Work is published | Exact song/album commitment | Policy gate, chain receipt, hashes | 04, 05, 08 |
| Listener plays tracks | Published media served | Browser playback, draft rejection | 05, 08 |
| Listener buys song and album | Version-bound payment | Wallet signer, amount, final receipt, unique order | 06 |
| Listener tips creators | Separate tip event | Target work, tip ID, final receipt | 06 |
| Contract allocates funds | Per-agent entitlements | Independent integer vectors, conservation | 07 |
| Agents trigger payout | Pending then paid/owed | Scoped signer, child receipt, duplicate rejection | 07 |
| Admin pauses an agent | Future action rejected | Policy epoch, rejected call | 04, 09 |
| Worker/browser restarts | Same operation resolved | Operation ID, no duplicate transfer | 02, 06, 07, 09 |
| Owner follows walkthrough | Both modes completed | Browser and chain/model/media proof | 08, 10 |
