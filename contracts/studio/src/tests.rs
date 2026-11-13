use std::panic::{AssertUnwindSafe, catch_unwind};
use near_sdk::json_types::U128;
use near_sdk::test_utils::VMContextBuilder;
use near_sdk::{NearToken, testing_env};
use crate::{LegacyStudioContract, PolicyInput, ReleaseInput, StudioContract};
use crate::models::{AlbumTrack, Payment, Release, Share};

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
fn guardian_handover_removes_bootstrap_policy_authority_and_does_not_grant_publishing() {
    context("studio.testnet", 0);
    let mut contract = StudioContract::new("studio.testnet".parse().unwrap());
    context("studio.testnet", 1);
    contract.transfer_guardian("sickhat6192.testnet".parse().unwrap());
    assert_eq!(contract.get_guardian().as_str(), "sickhat6192.testnet");
    assert!(catch_unwind(AssertUnwindSafe(|| contract.transfer_guardian("other.testnet".parse().unwrap()))).is_err());
    let next = || PolicyInput { epoch: 2, human_review: false, paused: false, max_price_yocto: U128(10_u128.pow(23)), max_tip_yocto: U128(10_u128.pow(24)) };
    assert!(catch_unwind(AssertUnwindSafe(|| contract.set_policy(next()))).is_err());
    context("sickhat6192.testnet", 1);
    contract.set_policy(next());
    assert!(!contract.get_policy().human_review);
    context("sickhat6192.testnet", 0);
    let empty = ReleaseInput { work_id: "guardian-song".to_string(), version: 1, kind: "song".to_string(), media_hash: "a".repeat(64), metadata_hash: "b".repeat(64), split_hash: "c".repeat(64), track_order_hash: "d".repeat(64), price_yocto: U128(1), shares: vec![], tracks: vec![], policy_epoch: 2 };
    assert!(catch_unwind(AssertUnwindSafe(|| contract.create_release(empty))).is_err());
}

#[test]
fn guardian_can_extend_only_an_active_agent_without_resetting_used_actions() {
    context("studio.testnet", 0);
    let mut contract = StudioContract::new("studio.testnet".parse().unwrap());
    context("studio.testnet", 10_u128.pow(23));
    contract.register_agent("producer.testnet".parse().unwrap(), "producer".to_string(), 10_000, 5);
    context("studio.testnet", 1);
    contract.transfer_guardian("guardian.testnet".parse().unwrap());
    context("outsider.testnet", 1);
    assert!(catch_unwind(AssertUnwindSafe(|| contract.renew_agent("producer.testnet".parse().unwrap(), 20_000, 10))).is_err());
    context("guardian.testnet", 1);
    assert!(catch_unwind(AssertUnwindSafe(|| contract.renew_agent("producer.testnet".parse().unwrap(), 9_999, 10))).is_err());
    assert!(catch_unwind(AssertUnwindSafe(|| contract.renew_agent("producer.testnet".parse().unwrap(), 20_000, 4))).is_err());
    contract.renew_agent("producer.testnet".parse().unwrap(), 20_000, 10);
    let agent = contract.get_agent("producer.testnet".parse().unwrap()).unwrap();
    assert_eq!(agent.role, "producer");
    assert_eq!(agent.max_actions, 10);
    assert_eq!(agent.actions_used, 0);
    assert_eq!(agent.expires_at_ms, 20_000);
    contract.revoke_agent("producer.testnet".parse().unwrap());
    assert!(catch_unwind(AssertUnwindSafe(|| contract.renew_agent("producer.testnet".parse().unwrap(), 30_000, 20))).is_err());
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
    for (account, role) in [("lyricist.testnet", "lyricist"), ("composer.testnet", "composer"), ("producer.testnet", "producer")] {
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
    context("producer.testnet", 0);
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

#[test]
fn v1_state_migrates_without_losing_escrow_or_payments() {
    context("studio.testnet", 0);
    let mut original = StudioContract::new("admin.testnet".parse().unwrap());
    original.schema_version = 1;
    original.escrow_yocto = 77;
    original.payments.insert("old-payment".to_string(), Payment { work_id: "old-song".to_string(), version: 1, kind: "tip".to_string(), buyer_id: "buyer.testnet".parse().unwrap(), gross_yocto: 77, commitment: "old".to_string(), status: "finalized".to_string(), allocated_yocto: 0 });
    original.payments.flush();
    let legacy = LegacyStudioContract { schema_version: 1, admin_id: original.admin_id, policy: original.policy, agents: original.agents, releases: original.releases, latest: original.latest, acceptances: original.acceptances, approvals: original.approvals, payments: original.payments, agent_count: 0, release_count: 0, payment_count: 1, escrow_yocto: 77 };
    near_sdk::env::state_write(&legacy);
    let migrated = StudioContract::migrate();
    assert_eq!(migrated.get_schema_version(), 2);
    assert_eq!(migrated.get_escrow_yocto().0, 77);
    assert_eq!(migrated.get_payment("old-payment".to_string()).unwrap().gross_yocto.0, 77);
    assert_eq!(migrated.get_pending_payout_yocto().0, 0);
}

#[test]
fn album_allocation_uses_track_then_song_splits_and_assigns_dust_to_last() {
    context("studio.testnet", 0);
    let mut contract = StudioContract::new("admin.testnet".parse().unwrap());
    let first: near_sdk::AccountId = "first.testnet".parse().unwrap();
    let second: near_sdk::AccountId = "second.testnet".parse().unwrap();
    let song = |work_id: &str, first_bp, second_bp| Release { work_id: work_id.to_string(), version: 1, kind: "song".to_string(), media_hash: String::new(), metadata_hash: String::new(), split_hash: String::new(), track_order_hash: String::new(), price_yocto: 1, shares: vec![Share { account_id: first.clone(), basis_points: first_bp }, Share { account_id: second.clone(), basis_points: second_bp }], tracks: vec![], policy_epoch: 1, published: true, ever_published: true, commitment: "song".to_string() };
    contract.releases.insert("s1:1".to_string(), song("s1", 3333, 6667));
    contract.releases.insert("s2:1".to_string(), song("s2", 6000, 4000));
    contract.releases.insert("album:1".to_string(), Release { work_id: "album".to_string(), version: 1, kind: "album".to_string(), media_hash: String::new(), metadata_hash: String::new(), split_hash: String::new(), track_order_hash: String::new(), price_yocto: 101, shares: vec![], tracks: vec![AlbumTrack { song_id: "s1".to_string(), song_version: 1, basis_points: 3333 }, AlbumTrack { song_id: "s2".to_string(), song_version: 1, basis_points: 6667 }], policy_epoch: 1, published: true, ever_published: true, commitment: "album-commit".to_string() });
    contract.payments.insert("album-tip".to_string(), Payment { work_id: "album".to_string(), version: 1, kind: "tip".to_string(), buyer_id: "buyer.testnet".parse().unwrap(), gross_yocto: 101, commitment: "album-commit".to_string(), status: "finalized".to_string(), allocated_yocto: 0 });
    contract.escrow_yocto = 101;
    context("admin.testnet", 0);
    contract.allocate_payment("album-tip".to_string());
    assert_eq!(contract.get_earnings(first.clone()).owed_yocto.0, 50);
    assert_eq!(contract.get_earnings(second).owed_yocto.0, 51);
    assert_eq!(contract.get_payment("album-tip".to_string()).unwrap().allocated_yocto.0, 101);
    assert!(catch_unwind(AssertUnwindSafe(|| contract.allocate_payment("album-tip".to_string()))).is_err());
}
