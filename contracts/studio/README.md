# Accord studio contract

This NEAR testnet contract manages agent authority, release commitments, listener purchases and tips, refunds, and retry-safe payouts. Its source is in `src/`; the web app uses the deployed contract configured through `NEXT_PUBLIC_STUDIO_CONTRACT_ID`.

Deployment and live testnet evidence are separate from local tests. Preserve the deployed account's state and reconcile pending payments before any upgrade.
