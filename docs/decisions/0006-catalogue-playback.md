# 0006 — Free catalogue playback and testnet support payments

Status: selected for the first studio catalogue, 2026-11-12.

Visitors can stream complete published songs without a wallet. A purchase is a version-bound testnet support payment that records the buyer and entitles that buyer to a download; a tip is support only and grants no purchase entitlement. The server serves audio only while a local publication, rights/review records, a matching published studio-contract commitment, and the content-addressed blob all verify. Byte-range requests support seeking. A takedown removes public access and future payments while preserving earlier payment records.

Prices are 0.01 testnet NEAR per song and 0.015 testnet NEAR per album for the initial release. Tips range from 0.001 to 1 testnet NEAR. The contract stores integer yoctoNEAR and rejects duplicate IDs and wrong deposits. A successful purchase or tip is final except an administrator correction before any creator proceeds are allocated; the refund callback settles success or restores the finalized payment after a failed transfer.

No mainnet payments are authorized by this decision. Catalogue publication still requires the separate ElevenLabs permission reference described in [decision 0005](0005-elevenlabs-final-songs.md).
