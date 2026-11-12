use near_sdk::json_types::U128;
use near_sdk::{Gas, NearToken, Promise, env, near, require};
use crate::{StudioContract, StudioContractExt, models::Payment};

const MIN_TIP_YOCTO: u128 = 1_000_000_000_000_000_000_000;

#[near]
impl StudioContract {
    #[payable]
    pub fn purchase(&mut self, payment_id: String, work_id: String, version: u32, commitment: String, quote_expires_at_ms: u64) {
        self.record_payment(payment_id, work_id, version, commitment, quote_expires_at_ms, "purchase");
    }
    #[payable]
    pub fn tip(&mut self, payment_id: String, work_id: String, version: u32, commitment: String, quote_expires_at_ms: u64) {
        self.record_payment(payment_id, work_id, version, commitment, quote_expires_at_ms, "tip");
    }
    fn record_payment(&mut self, payment_id: String, work_id: String, version: u32, commitment: String, quote_expires_at_ms: u64, kind: &str) {
        require!(!self.policy.paused, "STUDIO_PAUSED");
        require!(!payment_id.is_empty() && payment_id.len() <= 64 && payment_id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-'), "PAYMENT_ID_INVALID");
        require!(self.payments.get(&payment_id).is_none() && self.payment_count < 50_000, "PAYMENT_DUPLICATE_OR_LIMIT");
        require!(quote_expires_at_ms >= env::block_timestamp_ms() && quote_expires_at_ms <= env::block_timestamp_ms() + 300_000, "QUOTE_EXPIRED_OR_TOO_LONG");
        let release = self.releases.get(&Self::release_key(&work_id, version)).expect("RELEASE_MISSING");
        require!(release.published && release.commitment == commitment, "RELEASE_STALE_OR_UNPUBLISHED");
        if release.kind == "album" { for track in &release.tracks { require!(self.releases.get(&Self::release_key(&track.song_id, track.song_version)).is_some_and(|song| song.published), "ALBUM_SONG_UNPUBLISHED"); } }
        let amount = env::attached_deposit().as_yoctonear();
        if kind == "purchase" { require!(amount == release.price_yocto, "PRICE_MISMATCH"); }
        else { require!(amount >= MIN_TIP_YOCTO && amount <= self.policy.max_tip_yocto, "TIP_AMOUNT_INVALID"); }
        self.escrow_yocto = self.escrow_yocto.checked_add(amount).expect("ESCROW_OVERFLOW");
        let payment = Payment { work_id: work_id.clone(), version, kind: kind.to_string(), buyer_id: env::predecessor_account_id(), gross_yocto: amount, commitment: commitment.clone(), status: "finalized".to_string(), allocated_yocto: 0 };
        self.payments.insert(payment_id.clone(), payment);
        self.payment_count += 1;
        self.require_storage_reserve();
        Self::event("payment_finalized", near_sdk::serde_json::json!({"payment_id": payment_id, "kind": kind, "work_id": work_id, "version": version, "gross_yocto": U128(amount), "commitment": commitment}));
    }

    /// An admin correction can refund only funds that have not been allocated to creators.
    #[payable]
    pub fn refund_payment(&mut self, payment_id: String) -> Promise {
        self.require_admin_one_yocto();
        let mut payment = self.payments.get(&payment_id).cloned().expect("PAYMENT_MISSING");
        require!(payment.status == "finalized" && payment.allocated_yocto == 0, "REFUND_ALREADY_ACTIVE_OR_ALLOCATED");
        payment.status = "refund_pending".to_string();
        self.payments.insert(payment_id.clone(), payment.clone());
        self.require_storage_reserve();
        Self::event("refund_requested", near_sdk::serde_json::json!({"payment_id": payment_id, "gross_yocto": U128(payment.gross_yocto)}));
        Promise::new(payment.buyer_id).transfer(NearToken::from_yoctonear(payment.gross_yocto))
            .then(Self::ext(env::current_account_id()).with_static_gas(Gas::from_tgas(20)).on_refund_result(payment_id))
    }

    #[private]
    pub fn on_refund_result(&mut self, payment_id: String) -> bool {
        let mut payment = self.payments.get(&payment_id).cloned().expect("PAYMENT_MISSING");
        require!(payment.status == "refund_pending", "REFUND_NOT_PENDING");
        if env::promise_result_checked(0, 1024).is_ok() {
            payment.status = "refunded".to_string();
            self.escrow_yocto = self.escrow_yocto.checked_sub(payment.gross_yocto).expect("ESCROW_UNDERFLOW");
            self.payments.insert(payment_id.clone(), payment);
            Self::event("refund_completed", near_sdk::serde_json::json!({"payment_id": payment_id}));
            true
        } else {
            payment.status = "finalized".to_string();
            self.payments.insert(payment_id.clone(), payment);
            Self::event("refund_failed", near_sdk::serde_json::json!({"payment_id": payment_id}));
            false
        }
    }
}
