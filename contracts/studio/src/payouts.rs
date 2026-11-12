use near_sdk::json_types::U128;
use near_sdk::{AccountId, Gas, NearToken, Promise, env, near, require};
use crate::{StudioContract, StudioContractExt, models::{Share, Payout}};

const BASIS: u128 = 10_000;
const MAX_PAYOUT_YOCTO: u128 = 100_000_000_000_000_000_000_000;

#[near]
impl StudioContract {
    /// Deterministically allocates a finalized, unrefunded payment exactly once.
    pub fn allocate_payment(&mut self, payment_id: String) {
        self.require_admin();
        let mut payment = self.payments.get(&payment_id).cloned().expect("PAYMENT_MISSING");
        require!(payment.status == "finalized" && payment.allocated_yocto == 0, "PAYMENT_NOT_ALLOCATABLE");
        let release = self.releases.get(&Self::release_key(&payment.work_id, payment.version)).cloned().expect("RELEASE_MISSING");
        require!(release.commitment == payment.commitment, "PAYMENT_COMMITMENT_MISMATCH");
        if release.kind == "song" {
            self.allocate_shares(payment.gross_yocto, &release.shares);
        } else {
            require!(release.kind == "album" && !release.tracks.is_empty(), "RELEASE_KIND_INVALID");
            let mut remaining = payment.gross_yocto;
            for (index, track) in release.tracks.iter().enumerate() {
                let amount = if index + 1 == release.tracks.len() { remaining } else { payment.gross_yocto.checked_mul(u128::from(track.basis_points)).expect("ALLOCATION_OVERFLOW") / BASIS };
                remaining = remaining.checked_sub(amount).expect("ALLOCATION_UNDERFLOW");
                let song = self.releases.get(&Self::release_key(&track.song_id, track.song_version)).cloned().expect("ALBUM_SONG_MISSING");
                self.allocate_shares(amount, &song.shares);
            }
            require!(remaining == 0, "ALBUM_DUST_REMAINING");
        }
        let gross = payment.gross_yocto;
        payment.allocated_yocto = gross;
        self.payments.insert(payment_id.clone(), payment);
        self.require_storage_reserve();
        Self::event("payment_allocated", near_sdk::serde_json::json!({"payment_id": payment_id, "gross_yocto": U128(gross)}));
    }

    fn allocate_shares(&mut self, amount: u128, shares: &[Share]) {
        require!(!shares.is_empty(), "SPLIT_EMPTY");
        let mut remaining = amount;
        for (index, share) in shares.iter().enumerate() {
            let share_amount = if index + 1 == shares.len() { remaining } else { amount.checked_mul(u128::from(share.basis_points)).expect("ALLOCATION_OVERFLOW") / BASIS };
            remaining = remaining.checked_sub(share_amount).expect("ALLOCATION_UNDERFLOW");
            let old = self.owed.get(&share.account_id).copied().unwrap_or(0);
            self.owed.insert(share.account_id.clone(), old.checked_add(share_amount).expect("OWED_OVERFLOW"));
        }
        require!(remaining == 0, "SPLIT_DUST_REMAINING");
    }

    #[payable]
    pub fn request_payout(&mut self, payout_id: String, recipient_id: AccountId) -> Promise {
        require!(!self.policy.paused, "STUDIO_PAUSED");
        require!(env::attached_deposit().as_yoctonear() == 1, "ONE_YOCTO_REQUIRED");
        require!(env::predecessor_account_id() == self.admin_id || !self.policy.human_review && env::predecessor_account_id() == recipient_id, "PAYOUT_CALLER_FORBIDDEN");
        require!(self.agents.get(&recipient_id).is_some(), "PAYOUT_RECIPIENT_NOT_AGENT");
        require!(!payout_id.is_empty() && payout_id.len() <= 64 && payout_id.bytes().all(|c| c.is_ascii_alphanumeric() || c == b'-'), "PAYOUT_ID_INVALID");
        require!(self.payouts.get(&payout_id).is_none() && self.payout_count < 50_000, "PAYOUT_DUPLICATE_OR_LIMIT");
        let amount = self.owed.get(&recipient_id).copied().unwrap_or(0).min(MAX_PAYOUT_YOCTO);
        require!(amount > 0, "PAYOUT_NOTHING_OWED");
        self.owed.insert(recipient_id.clone(), self.owed.get(&recipient_id).copied().unwrap_or(0).checked_sub(amount).expect("OWED_UNDERFLOW"));
        self.pending.insert(recipient_id.clone(), self.pending.get(&recipient_id).copied().unwrap_or(0).checked_add(amount).expect("PENDING_OVERFLOW"));
        self.pending_payout_yocto = self.pending_payout_yocto.checked_add(amount).expect("PENDING_OVERFLOW");
        self.payouts.insert(payout_id.clone(), Payout { recipient_id: recipient_id.clone(), amount_yocto: amount, status: "pending".to_string() });
        self.payout_count += 1;
        self.require_storage_reserve();
        Self::event("payout_requested", near_sdk::serde_json::json!({"payout_id": payout_id, "recipient_id": recipient_id, "amount_yocto": U128(amount)}));
        Promise::new(recipient_id).transfer(NearToken::from_yoctonear(amount))
            .then(Self::ext(env::current_account_id()).with_static_gas(Gas::from_tgas(30)).on_payout_result(payout_id))
    }

    #[private]
    pub fn on_payout_result(&mut self, payout_id: String) -> bool {
        let mut payout = self.payouts.get(&payout_id).cloned().expect("PAYOUT_MISSING");
        require!(payout.status == "pending", "PAYOUT_NOT_PENDING");
        self.pending_payout_yocto = self.pending_payout_yocto.checked_sub(payout.amount_yocto).expect("PENDING_UNDERFLOW");
        let old_pending = self.pending.get(&payout.recipient_id).copied().unwrap_or(0);
        self.pending.insert(payout.recipient_id.clone(), old_pending.checked_sub(payout.amount_yocto).expect("PENDING_UNDERFLOW"));
        let success = env::promise_result_checked(0, 1024).is_ok();
        if success {
            payout.status = "paid".to_string();
            self.escrow_yocto = self.escrow_yocto.checked_sub(payout.amount_yocto).expect("ESCROW_UNDERFLOW");
            self.paid_payout_yocto = self.paid_payout_yocto.checked_add(payout.amount_yocto).expect("PAID_OVERFLOW");
            let old_paid = self.paid.get(&payout.recipient_id).copied().unwrap_or(0);
            self.paid.insert(payout.recipient_id.clone(), old_paid.checked_add(payout.amount_yocto).expect("PAID_OVERFLOW"));
        } else {
            payout.status = "failed".to_string();
            let old_owed = self.owed.get(&payout.recipient_id).copied().unwrap_or(0);
            self.owed.insert(payout.recipient_id.clone(), old_owed.checked_add(payout.amount_yocto).expect("OWED_OVERFLOW"));
        }
        self.payouts.insert(payout_id.clone(), payout);
        self.require_storage_reserve();
        Self::event(if success { "payout_paid" } else { "payout_failed" }, near_sdk::serde_json::json!({"payout_id": payout_id}));
        success
    }
}
