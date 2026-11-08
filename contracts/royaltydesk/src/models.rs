use near_sdk::{near, json_types::{U128, U64}, AccountId};

#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq, Eq)]
pub struct ParticipantInput { pub owner_id: AccountId, pub basis_points: String }
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct RecoupmentInput { pub code: String, pub beneficiary_id: AccountId, pub cap_yocto: U128 }
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct AgreementInput { pub recording_id: String, pub participants: Vec<ParticipantInput>, pub recoupment: Option<RecoupmentInput>, pub effective_period: String, pub document_hash: String }
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct ParticipantShare { pub owner_id: AccountId, pub basis_points: u16 }
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct RecoupmentState { pub code: String, pub beneficiary_id: AccountId, pub cap_yocto: u128, pub consumed_yocto: u128 }
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct AgreementProposal { pub version: u64, pub recording_id: String, pub participants: Vec<ParticipantShare>, pub recoupment: Option<RecoupmentState>, pub effective_period: String, pub document_hash: String, pub rules_hash: String, pub approval_digest: String, pub approvals: Vec<ApprovalRecord>, pub active: bool, pub superseded: bool }
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct ApprovalRecord { pub owner_id: AccountId, pub actor_id: AccountId, pub revision: u64, pub digest: String, pub epoch: u64 }
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct MandateInput { pub agent_id: AccountId, pub agreement_version: U64, pub actions: Vec<String>, pub max_gross_yocto: U128, pub expires_at_nanoseconds: U64 }
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct MandateState { pub owner_id: AccountId, pub agent_id: AccountId, pub agreement_version: u64, pub actions: Vec<String>, pub max_gross_yocto: u128, pub expires_at_nanoseconds: u64, pub epoch: u64, pub revoked: bool }
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct SettlementInput { pub period: String, pub agreement_version: U64, pub normalized_statement_hash: String, pub gross_yocto: U128, pub deduction_evidence_hash: String, pub allocation_preview_hash: String }
#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq, Eq)]
pub enum SettlementStatus { Review, Held, Finalized, Paying, Complete, Cancelled }
#[near(serializers = [json, borsh])]
#[derive(Clone, PartialEq, Eq)]
pub enum EntitlementStatus { Available, Pending, Paid }
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct Entitlement { pub owner_id: AccountId, pub amount_yocto: u128, pub status: EntitlementStatus, pub attempt_id: u64 }
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct DisputeRecord { pub owner_id: AccountId, pub revision: u64, pub reason_hash: String }
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct RefundAttempt { pub attempt_id: u64, pub amount_yocto: u128 }
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct SettlementState { pub period: String, pub revision: u64, pub agreement_version: u64, pub normalized_statement_hash: String, pub gross_yocto: u128, pub deduction_evidence_hash: String, pub allocation_preview_hash: String, pub status: SettlementStatus, pub total_deposited_yocto: u128, pub unallocated_yocto: u128, pub refundable_yocto: u128, pub unpaid_entitlements_yocto: u128, pub in_flight_yocto: u128, pub successful_payouts_yocto: u128, pub successful_refunds_yocto: u128, pub approvals: Vec<ApprovalRecord>, pub disputes: Vec<DisputeRecord>, pub cancellation_votes: Vec<AccountId>, pub entitlements: Vec<Entitlement>, pub next_attempt_id: u64, pub refund_attempt: Option<RefundAttempt> }
#[near(serializers = [json, borsh])]
#[derive(Clone)]
pub struct ReleaseState { pub release_id: String, pub recording_id: String, pub administrator_id: AccountId, pub funder_id: AccountId, pub invited_owner_ids: Vec<AccountId>, pub accepted_owner_ids: Vec<AccountId>, pub next_agreement_version: u64, pub active_agreement_version: Option<u64>, pub agreements: Vec<AgreementProposal>, pub mandates: Vec<MandateState>, pub settlements: Vec<SettlementState> }
