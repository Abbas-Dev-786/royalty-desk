use std::collections::BTreeSet;
use near_sdk::{env, near, require};
use crate::{StudioContract, StudioContractExt, models::{Release, ReleaseInput}};

fn valid_hash(value: &str) -> bool { value.len() == 64 && value.bytes().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()) }
fn digest(bytes: &[u8]) -> String { env::sha256(bytes).iter().map(|b| format!("{b:02x}")).collect() }

#[near]
impl StudioContract {
    #[payable]
    pub fn create_release(&mut self, input: ReleaseInput) -> String {
        self.require_agent_role(&["producer"]);
        require!(!self.policy.paused && input.policy_epoch == self.policy.epoch, "POLICY_STALE_OR_PAUSED");
        require!(self.release_count < 500, "RELEASE_LIMIT");
        require!(!input.work_id.is_empty() && input.work_id.len() <= 64 && input.work_id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-'), "WORK_ID_INVALID");
        require!(input.kind == "song" || input.kind == "album", "WORK_KIND_INVALID");
        require!(valid_hash(&input.media_hash) && valid_hash(&input.metadata_hash) && valid_hash(&input.split_hash) && valid_hash(&input.track_order_hash), "HASH_INVALID");
        require!(input.price_yocto.0 > 0 && input.price_yocto.0 <= self.policy.max_price_yocto, "PRICE_INVALID");
        let expected = self.latest.get(&input.work_id).copied().unwrap_or(0) + 1;
        require!(input.version == expected, "WORK_VERSION_STALE");
        require!(input.shares.len() >= 2 && input.shares.len() <= 10, "SPLIT_COUNT_INVALID");
        let mut seen = BTreeSet::new();
        let mut total = 0_u32;
        for share in &input.shares {
            require!(share.basis_points > 0 && seen.insert(share.account_id.clone()), "SPLIT_DUPLICATE_OR_ZERO");
            require!(self.agents.get(&share.account_id).is_some(), "SPLIT_AGENT_MISSING");
            total += u32::from(share.basis_points);
        }
        require!(total == 10_000, "SPLIT_NOT_10000");
        require!(input.split_hash == digest(&near_sdk::serde_json::to_vec(&input.shares).expect("SPLIT_JSON")), "SPLIT_HASH_MISMATCH");
        require!(input.track_order_hash == digest(&near_sdk::serde_json::to_vec(&input.tracks).expect("TRACK_JSON")), "TRACK_HASH_MISMATCH");
        if input.kind == "song" { require!(input.tracks.is_empty(), "SONG_HAS_TRACKS"); }
        else {
            require!(input.tracks.len() >= 2 && input.tracks.len() <= 20, "ALBUM_TRACK_COUNT");
            let mut track_total = 0_u32;
            let mut tracks = BTreeSet::new();
            for track in &input.tracks {
                require!(track.basis_points > 0 && tracks.insert(track.song_id.clone()), "ALBUM_TRACK_DUPLICATE");
                let song = self.releases.get(&Self::release_key(&track.song_id, track.song_version)).expect("ALBUM_SONG_MISSING");
                require!(song.kind == "song", "ALBUM_TRACK_NOT_SONG");
                track_total += u32::from(track.basis_points);
            }
            require!(track_total == 10_000, "ALBUM_WEIGHTS_INVALID");
        }
        let commitment = digest(&near_sdk::serde_json::to_vec(&input).expect("RELEASE_JSON"));
        let release = Release { work_id: input.work_id.clone(), version: input.version, kind: input.kind, media_hash: input.media_hash, metadata_hash: input.metadata_hash, split_hash: input.split_hash, track_order_hash: input.track_order_hash, price_yocto: input.price_yocto.0, shares: input.shares, tracks: input.tracks, policy_epoch: input.policy_epoch, published: false, ever_published: false, commitment: commitment.clone() };
        self.releases.insert(Self::release_key(&release.work_id, release.version), release.clone());
        self.latest.insert(release.work_id.clone(), release.version);
        self.release_count += 1;
        self.require_storage_reserve();
        Self::event("release_created", near_sdk::serde_json::json!({"work_id": release.work_id, "version": release.version, "commitment": commitment}));
        commitment
    }

    pub fn accept_split(&mut self, work_id: String, version: u32, split_hash: String, policy_epoch: u32) {
        let caller = self.require_agent_role(&["lyricist", "composer", "producer", "reviewer"]);
        require!(policy_epoch == self.policy.epoch, "POLICY_EPOCH_STALE");
        let release = self.releases.get(&Self::release_key(&work_id, version)).expect("RELEASE_MISSING");
        require!(!release.published && release.policy_epoch == policy_epoch && release.split_hash == split_hash, "SPLIT_STALE");
        require!(release.shares.iter().any(|share| share.account_id == caller), "NOT_SPLIT_PARTICIPANT");
        let key = Self::acceptance_key(&work_id, version, &caller);
        require!(self.acceptances.get(&key).is_none(), "SPLIT_ALREADY_ACCEPTED");
        self.acceptances.insert(key, true);
        self.require_storage_reserve();
        Self::event("split_accepted", near_sdk::serde_json::json!({"work_id": work_id, "version": version, "account_id": caller}));
    }

    #[payable]
    pub fn approve_release(&mut self, work_id: String, version: u32, commitment: String, policy_epoch: u32) {
        self.require_admin_one_yocto();
        require!(!self.policy.paused && policy_epoch == self.policy.epoch, "POLICY_STALE_OR_PAUSED");
        let release = self.releases.get(&Self::release_key(&work_id, version)).expect("RELEASE_MISSING");
        require!(release.commitment == commitment && release.policy_epoch == policy_epoch && !release.published, "APPROVAL_STALE");
        self.approvals.insert(Self::approval_key(&work_id, version, policy_epoch), true);
        self.require_storage_reserve();
        Self::event("release_approved", near_sdk::serde_json::json!({"work_id": work_id, "version": version, "commitment": commitment, "epoch": policy_epoch}));
    }

    pub fn publish_release(&mut self, work_id: String, version: u32, commitment: String, policy_epoch: u32) {
        self.require_agent_role(&["producer"]);
        require!(!self.policy.paused && policy_epoch == self.policy.epoch, "POLICY_STALE_OR_PAUSED");
        let key = Self::release_key(&work_id, version);
        let mut release = self.releases.get(&key).cloned().expect("RELEASE_MISSING");
        require!(!release.ever_published && release.policy_epoch == policy_epoch && release.commitment == commitment, "PUBLICATION_STALE");
        for share in &release.shares { require!(self.acceptances.get(&Self::acceptance_key(&work_id, version, &share.account_id)).is_some(), "SPLIT_ACCEPTANCE_MISSING"); }
        if self.policy.human_review { require!(self.approvals.get(&Self::approval_key(&work_id, version, policy_epoch)).is_some(), "HUMAN_APPROVAL_REQUIRED"); }
        if release.kind == "album" { for track in &release.tracks { require!(self.releases.get(&Self::release_key(&track.song_id, track.song_version)).is_some_and(|song| song.published), "ALBUM_SONG_UNPUBLISHED"); } }
        if version > 1 {
            let previous_key = Self::release_key(&work_id, version - 1);
            if let Some(previous) = self.releases.get(&previous_key).cloned() { if previous.published { self.releases.insert(previous_key, Release { published: false, ..previous }); } }
        }
        release.published = true;
        release.ever_published = true;
        self.releases.insert(key, release);
        Self::event("release_published", near_sdk::serde_json::json!({"work_id": work_id, "version": version, "commitment": commitment, "epoch": policy_epoch}));
    }

    #[payable]
    pub fn unpublish_release(&mut self, work_id: String, version: u32) {
        self.require_admin_one_yocto();
        let key = Self::release_key(&work_id, version);
        let mut release = self.releases.get(&key).cloned().expect("RELEASE_MISSING");
        require!(release.published, "RELEASE_NOT_PUBLISHED");
        release.published = false;
        self.releases.insert(key, release);
        Self::event("release_unpublished", near_sdk::serde_json::json!({"work_id": work_id, "version": version}));
    }
}
