use std::panic::{AssertUnwindSafe, catch_unwind};
use near_sdk::json_types::U128;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{NearToken, testing_env};
use crate::{PolicyInput, ReleaseInput, StudioContract};
use crate::models::{AlbumTrack, Share};

fn context(predecessor: &str, deposit: u128) {
    let mut builder = VMContextBuilder::new();
    builder.current_account_id("studio.testnet".parse().unwrap())
        .predecessor_account_id(predecessor.parse().unwrap())
        .account_balance(NearToken::from_near(10))
        .attached_deposit(NearToken::from_yoctonear(deposit));
    testing_env!(builder.build());
}

#[test]
fn auth_policy_epoch_and_admin_are_enforced() {
    context("studio.testnet", 0);
    let mut contract = StudioContract::new("admin.testnet".parse().unwrap());
    assert_eq!(contract.get_schema_version(), 2);
    assert!(contract.get_policy().human_review);
    context("outsider.testnet", 1);
    let policy = PolicyInput { epoch: 2, human_review: false, paused: false, max_price_yocto: U128(10_u128.pow(23)), max_tip_yocto: U128(10_u128.pow(24)) };
    assert!(catch_unwind(AssertUnwindSafe(|| contract.set_policy(policy))).is_err());
    context("admin.testnet", 1);
    let stale = PolicyInput { epoch: 1, human_review: false, paused: false, max_price_yocto: U128(10_u128.pow(23)), max_tip_yocto: U128(10_u128.pow(24)) };
    assert!(catch_unwind(AssertUnwindSafe(|| contract.set_policy(stale))).is_err());
    let current = PolicyInput { epoch: 2, human_review: false, paused: false, max_price_yocto: U128(10_u128.pow(23)), max_tip_yocto: U128(10_u128.pow(24)) };
    contract.set_policy(current);
    assert_eq!(contract.get_policy().epoch, 2);
    assert!(!contract.get_policy().human_review);
}

#[test]
fn auth_storage_reserve_rejects_underfunded_state() {
    context("studio.testnet", 0);
    let mut contract = StudioContract::new("admin.testnet".parse().unwrap());
    let mut builder = VMContextBuilder::new();
    builder.current_account_id("studio.testnet".parse().unwrap())
        .predecessor_account_id("admin.testnet".parse().unwrap())
        .account_balance(NearToken::from_yoctonear(1))
        .storage_usage(1000);
    testing_env!(builder.build());
    assert!(catch_unwind(AssertUnwindSafe(|| contract.require_storage_reserve())).is_err());
}

#[test]
fn draft_album_can_reference_unpublished_songs_but_cannot_publish() {
    context("studio.testnet", 0);
    let mut contract = StudioContract::new("admin.testnet".parse().unwrap());
    for (account, role) in [("lyricist.testnet", "lyricist"), ("composer.testnet", "composer")] {
        context("admin.testnet", 100_000_000_000_000_000_000_000);
        contract.register_agent(account.parse().unwrap(), role.to_string(), 100_000_000_000, 20);
    }
    let shares = vec![
        Share { account_id: "lyricist.testnet".parse().unwrap(), basis_points: 5_000 },
        Share { account_id: "composer.testnet".parse().unwrap(), basis_points: 5_000 },
    ];
    let hash = |value: &str| value.repeat(64);
    let digest = |value: Vec<u8>| near_sdk::env::sha256(&value).iter().map(|byte| format!("{byte:02x}")).collect::<String>();
    let split_hash = digest(near_sdk::serde_json::to_vec(&shares).unwrap());
    let input = |work_id: &str, kind: &str, tracks: Vec<AlbumTrack>| ReleaseInput {
        work_id: work_id.to_string(), version: 1, kind: kind.to_string(),
        media_hash: hash("a"), metadata_hash: hash("b"), split_hash: split_hash.clone(),
        track_order_hash: digest(near_sdk::serde_json::to_vec(&tracks).unwrap()),
        price_yocto: U128(10_000_000_000_000_000_000_000), shares: shares.clone(), tracks, policy_epoch: 1,
    };
    context("admin.testnet", 0);
    contract.create_release(input("song-one", "song", vec![]));
    contract.create_release(input("song-two", "song", vec![]));
    let album_tracks = vec![
        AlbumTrack { song_id: "song-one".to_string(), song_version: 1, basis_points: 5_000 },
        AlbumTrack { song_id: "song-two".to_string(), song_version: 1, basis_points: 5_000 },
    ];
    let commitment = contract.create_release(input("draft-album", "album", album_tracks));
    for account in ["lyricist.testnet", "composer.testnet"] {
        context(account, 0);
        contract.accept_split("draft-album".to_string(), 1, split_hash.clone(), 1);
    }
    context("admin.testnet", 1);
    contract.approve_release("draft-album".to_string(), 1, commitment.clone(), 1);
    context("admin.testnet", 0);
    assert!(catch_unwind(AssertUnwindSafe(|| contract.publish_release("draft-album".to_string(), 1, commitment, 1))).is_err());
    assert!(!contract.get_release("draft-album".to_string(), 1).unwrap().published);
}
