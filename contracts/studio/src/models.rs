use near_sdk::json_types::U128;
use near_sdk::{AccountId, near};

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Policy { pub epoch: u32, pub human_review: bool, pub paused: bool, pub max_price_yocto: u128, pub max_tip_yocto: u128 }
#[near(serializers = [json])]
pub struct PolicyInput { pub epoch: u32, pub human_review: bool, pub paused: bool, pub max_price_yocto: U128, pub max_tip_yocto: U128 }
#[near(serializers = [json])]
pub struct PolicyView { pub epoch: u32, pub human_review: bool, pub paused: bool, pub max_price_yocto: U128, pub max_tip_yocto: U128 }
impl Policy { pub fn view(&self) -> PolicyView { PolicyView { epoch: self.epoch, human_review: self.human_review, paused: self.paused, max_price_yocto: U128(self.max_price_yocto), max_tip_yocto: U128(self.max_tip_yocto) } } }

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Agent { pub role: String, pub active: bool, pub expires_at_ms: u64, pub max_actions: u32, pub actions_used: u32 }
#[near(serializers = [json])]
pub struct AgentView { pub account_id: AccountId, pub role: String, pub active: bool, pub expires_at_ms: u64, pub max_actions: u32, pub actions_used: u32 }
impl Agent { pub fn view(&self, account_id: AccountId) -> AgentView { AgentView { account_id, role: self.role.clone(), active: self.active, expires_at_ms: self.expires_at_ms, max_actions: self.max_actions, actions_used: self.actions_used } } }

#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Share { pub account_id: AccountId, pub basis_points: u16 }
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct AlbumTrack { pub song_id: String, pub song_version: u32, pub basis_points: u16 }
#[near(serializers = [json])]
pub struct ReleaseInput {
    pub work_id: String, pub version: u32, pub kind: String,
    pub media_hash: String, pub metadata_hash: String, pub split_hash: String, pub track_order_hash: String,
    pub price_yocto: U128, pub shares: Vec<Share>, pub tracks: Vec<AlbumTrack>, pub policy_epoch: u32,
}
#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Release {
    pub work_id: String, pub version: u32, pub kind: String,
    pub media_hash: String, pub metadata_hash: String, pub split_hash: String, pub track_order_hash: String,
    pub price_yocto: u128, pub shares: Vec<Share>, pub tracks: Vec<AlbumTrack>, pub policy_epoch: u32,
    pub published: bool, pub ever_published: bool, pub commitment: String,
}
#[near(serializers = [json])]
pub struct ReleaseView {
    pub work_id: String, pub version: u32, pub kind: String,
    pub media_hash: String, pub metadata_hash: String, pub split_hash: String, pub track_order_hash: String,
    pub price_yocto: U128, pub shares: Vec<Share>, pub tracks: Vec<AlbumTrack>, pub policy_epoch: u32,
    pub published: bool, pub ever_published: bool, pub commitment: String,
}
impl Release { pub fn view(&self) -> ReleaseView { ReleaseView { work_id: self.work_id.clone(), version: self.version, kind: self.kind.clone(), media_hash: self.media_hash.clone(), metadata_hash: self.metadata_hash.clone(), split_hash: self.split_hash.clone(), track_order_hash: self.track_order_hash.clone(), price_yocto: U128(self.price_yocto), shares: self.shares.clone(), tracks: self.tracks.clone(), policy_epoch: self.policy_epoch, published: self.published, ever_published: self.ever_published, commitment: self.commitment.clone() } } }

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Payment { pub work_id: String, pub version: u32, pub kind: String, pub buyer_id: AccountId, pub gross_yocto: u128, pub commitment: String, pub status: String, pub allocated_yocto: u128 }
#[near(serializers = [json])]
pub struct PaymentView { pub payment_id: String, pub work_id: String, pub version: u32, pub kind: String, pub buyer_id: AccountId, pub gross_yocto: U128, pub commitment: String, pub status: String, pub allocated_yocto: U128 }
impl Payment { pub fn view(&self, payment_id: String) -> PaymentView { PaymentView { payment_id, work_id: self.work_id.clone(), version: self.version, kind: self.kind.clone(), buyer_id: self.buyer_id.clone(), gross_yocto: U128(self.gross_yocto), commitment: self.commitment.clone(), status: self.status.clone(), allocated_yocto: U128(self.allocated_yocto) } } }

#[near(serializers = [borsh])]
#[derive(Clone)]
pub struct Payout { pub recipient_id: AccountId, pub amount_yocto: u128, pub status: String }
#[near(serializers = [json])]
pub struct PayoutView { pub payout_id: String, pub recipient_id: AccountId, pub amount_yocto: U128, pub status: String }
impl Payout { pub fn view(&self, payout_id: String) -> PayoutView { PayoutView { payout_id, recipient_id: self.recipient_id.clone(), amount_yocto: U128(self.amount_yocto), status: self.status.clone() } } }

#[near(serializers = [json])]
pub struct EarningsView { pub account_id: AccountId, pub owed_yocto: U128, pub pending_yocto: U128, pub paid_yocto: U128 }
