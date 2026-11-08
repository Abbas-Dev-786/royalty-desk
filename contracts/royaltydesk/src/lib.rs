mod accounting;
mod errors;
mod models;

use accounting::{allocate, recoupment_remaining};
use errors::fail;
use models::*;
use near_sdk::{env, near, json_types::U64, AccountId, Gas, NearToken, PanicOnDefault, Promise, PromiseError};

const MAX_INVITED: usize = 10;
const MAX_PARTICIPANTS: usize = 5;
const MAX_ACTIONS: usize = 3;
const MAX_AGREEMENTS: usize = 8;
const MAX_SETTLEMENTS: usize = 64;
const CALLBACK_GAS: Gas = Gas::from_tgas(10);

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct RoyaltyDeskContract {
    application: String,
    network_id: String,
    operator_id: AccountId,
    last_agent_caller: Option<AccountId>,
    releases: Vec<ReleaseState>,
}

#[near]
impl RoyaltyDeskContract {
    #[init]
    pub fn new(network_id: String, operator_id: AccountId) -> Self {
        if network_id != "testnet" { fail("ERR_CONFIG_NETWORK"); }
        Self { application: "royaltydesk".to_string(), network_id, operator_id, last_agent_caller: None, releases: Vec::new() }
    }
    pub fn health(&self) -> ContractHealth { ContractHealth { application: self.application.clone(), network_id: self.network_id.clone(), operator_id: self.operator_id.clone(), last_agent_caller: self.last_agent_caller.clone() } }
    pub fn agent_probe(&mut self) -> AccountId { self.require_zero_deposit(); let predecessor = env::predecessor_account_id(); self.last_agent_caller = Some(predecessor.clone()); predecessor }
    pub fn owner_probe(&self) -> AccountId { let predecessor = env::predecessor_account_id(); if predecessor != self.operator_id { fail("ERR_OWNER_CALLER"); } predecessor }

    pub fn create_release(&mut self, release_id: String, recording_id: String, funder_id: AccountId, invited_owner_ids: Vec<AccountId>) {
        self.require_zero_deposit();
        let creator = env::predecessor_account_id();
        if release_id.is_empty() || release_id.len() > 128 || recording_id.is_empty() { fail("ERR_RELEASE_INPUT"); }
        if invited_owner_ids.is_empty() || invited_owner_ids.len() > MAX_INVITED { fail("ERR_INVITATIONS_BOUNDS"); }
        for (i, id) in invited_owner_ids.iter().enumerate() { if invited_owner_ids[..i].contains(id) { fail("ERR_DUPLICATE_OWNER"); } }
        if self.releases.iter().any(|r| r.release_id == release_id) { fail("ERR_RELEASE_EXISTS"); }
        self.releases.push(ReleaseState { release_id, recording_id, administrator_id: creator, funder_id, invited_owner_ids, accepted_owner_ids: Vec::new(), next_agreement_version: 1, active_agreement_version: None, agreements: Vec::new(), mandates: Vec::new(), settlements: Vec::new() });
    }
    pub fn accept_membership(&mut self, release_id: String) { self.require_zero_deposit(); let caller = env::predecessor_account_id(); let release = self.release_mut(&release_id); if !release.invited_owner_ids.contains(&caller) { fail("ERR_NOT_INVITED"); } if release.accepted_owner_ids.contains(&caller) { fail("ERR_DUPLICATE_ACCEPTANCE"); } if release.accepted_owner_ids.len() >= MAX_PARTICIPANTS { fail("ERR_PARTICIPANTS_BOUNDS"); } release.accepted_owner_ids.push(caller); }

    pub fn freeze_agreement(&mut self, release_id: String, input: AgreementInput) -> U64 {
        self.require_zero_deposit();
        let admin = env::predecessor_account_id();
        let release = self.release_mut(&release_id);
        if release.administrator_id != admin { fail("ERR_ADMIN_CALLER"); }
        if input.recording_id != release.recording_id { fail("ERR_RECORDING_SCOPE"); }
        if release.accepted_owner_ids.len() < 2 || input.participants.len() != release.accepted_owner_ids.len() || input.participants.len() > MAX_PARTICIPANTS { fail("ERR_PARTICIPANTS"); }
        if release.active_agreement_version.is_some() && release.settlements.iter().any(|s| matches!(s.status, SettlementStatus::Review | SettlementStatus::Held | SettlementStatus::Finalized | SettlementStatus::Paying)) { fail("ERR_LIVE_SETTLEMENT"); }
        if release.agreements.len() >= MAX_AGREEMENTS { fail("ERR_AGREEMENT_BOUNDS"); }
        for proposal in release.agreements.iter_mut() { if !proposal.active { proposal.superseded = true; } }
        let mut participants = input.participants.iter().map(|p| ParticipantShare { owner_id: p.owner_id.clone(), basis_points: p.basis_points.parse::<u16>().unwrap_or_else(|_| fail("ERR_BASIS_POINTS")) }).collect::<Vec<_>>();
        participants.sort_by(|a,b| a.owner_id.cmp(&b.owner_id));
        if participants.iter().any(|p| p.basis_points == 0) || participants.iter().map(|p| u32::from(p.basis_points)).sum::<u32>() != 10_000 { fail("ERR_BASIS_POINTS"); }
        if participants.iter().any(|p| !release.accepted_owner_ids.contains(&p.owner_id)) || participants.windows(2).any(|w| w[0].owner_id == w[1].owner_id) { fail("ERR_PARTICIPANTS"); }
        let recoupment = input.recoupment.map(|r| { if r.cap_yocto.0 == 0 || !participants.iter().any(|p| p.owner_id == r.beneficiary_id) { fail("ERR_RECOUPMENT"); } RecoupmentState { code: r.code, beneficiary_id: r.beneficiary_id, cap_yocto: r.cap_yocto.0, consumed_yocto: 0 } });
        if let Some(active_version) = release.active_agreement_version {
            let active = release.agreements.iter().find(|a| a.version == active_version).unwrap_or_else(|| fail("ERR_AGREEMENT_VERSION"));
            if let (Some(old), Some(new)) = (active.recoupment.as_ref(), recoupment.as_ref()) {
                if old.beneficiary_id != new.beneficiary_id || new.cap_yocto < old.consumed_yocto { fail("ERR_RECOUPMENT_AMENDMENT"); }
            }
            if active.recoupment.is_some() && recoupment.is_none() { fail("ERR_RECOUPMENT_AMENDMENT"); }
        }
        let version = release.next_agreement_version;
        release.next_agreement_version = checked_add_u64(version, 1);
        let rules_hash = hash_hex(canonical_rules(&release.release_id, &input.recording_id, &participants, recoupment.as_ref(), &input.effective_period));
        let approval_digest = hash_hex(canonical_approval(&env::current_account_id(), &release.release_id, version, &rules_hash, &input.document_hash));
        release.agreements.push(AgreementProposal { version, recording_id: input.recording_id, participants, recoupment, effective_period: input.effective_period, document_hash: input.document_hash, rules_hash, approval_digest, approvals: Vec::new(), active: false, superseded: false });
        U64(version)
    }
    pub fn approve_agreement(&mut self, release_id: String, version: U64, approval_digest: String) {
        self.require_zero_deposit(); let caller = env::predecessor_account_id();
        let release = self.release_mut(&release_id);
        if !release.accepted_owner_ids.contains(&caller) { fail("ERR_OWNER_CALLER"); }
        let owner_count = release.accepted_owner_ids.len();
        let activates = {
        let agreement = release.agreements.iter_mut().find(|a| a.version == version.0).unwrap_or_else(|| fail("ERR_AGREEMENT_VERSION"));
            if agreement.approval_digest != approval_digest || agreement.active || agreement.superseded { fail("ERR_AGREEMENT_DIGEST"); }
            agreement.approvals.retain(|a| a.owner_id != caller);
            agreement.approvals.push(ApprovalRecord { owner_id: caller.clone(), actor_id: caller, revision: version.0, digest: approval_digest, epoch: 0 });
            agreement.approvals.len() == owner_count
        };
        if activates { release.agreements.iter_mut().find(|a| a.version == version.0).unwrap_or_else(|| fail("ERR_AGREEMENT_VERSION")).active = true; release.active_agreement_version = Some(version.0); }
    }

    pub fn set_mandate(&mut self, release_id: String, input: MandateInput) {
        self.require_zero_deposit(); let owner = env::predecessor_account_id(); let release = self.release_mut(&release_id);
        if !release.accepted_owner_ids.contains(&owner) { fail("ERR_OWNER_CALLER"); }
        if owner == input.agent_id || input.actions.is_empty() || input.actions.len() > MAX_ACTIONS || input.expires_at_nanoseconds.0 <= env::block_timestamp() { fail("ERR_MANDATE_INPUT"); }
        if release.active_agreement_version != Some(input.agreement_version.0) { fail("ERR_MANDATE_SCOPE"); }
        if release.mandates.iter().any(|m| m.agent_id == input.agent_id && m.owner_id != owner) { fail("ERR_AGENT_ALREADY_BOUND"); }
        if input.actions.iter().any(|a| !matches!(a.as_str(), "approve_settlement" | "dispute_settlement" | "execute_payout")) { fail("ERR_MANDATE_ACTION"); }
        let epoch = release.mandates.iter().find(|m| m.owner_id == owner).map(|m| checked_add_u64(m.epoch, 1)).unwrap_or(1);
        release.mandates.retain(|m| m.owner_id != owner);
        release.mandates.push(MandateState { owner_id: owner, agent_id: input.agent_id, agreement_version: input.agreement_version.0, actions: input.actions, max_gross_yocto: input.max_gross_yocto.0, expires_at_nanoseconds: input.expires_at_nanoseconds.0, epoch, revoked: false });
    }
    pub fn revoke_mandate(&mut self, release_id: String) { self.require_zero_deposit(); let owner = env::predecessor_account_id(); let release = self.release_mut(&release_id); let mandate = release.mandates.iter_mut().find(|m| m.owner_id == owner).unwrap_or_else(|| fail("ERR_MANDATE_NOT_FOUND")); mandate.revoked = true; mandate.epoch = checked_add_u64(mandate.epoch, 1); }

    pub fn open_settlement(&mut self, release_id: String, input: SettlementInput) {
        self.require_zero_deposit(); let admin = env::predecessor_account_id(); let release = self.release_mut(&release_id);
        if release.administrator_id != admin { fail("ERR_ADMIN_CALLER"); }
        if input.gross_yocto.0 == 0 || release.active_agreement_version != Some(input.agreement_version.0) { fail("ERR_SETTLEMENT_INPUT"); }
        if release.settlements.len() >= MAX_SETTLEMENTS { fail("ERR_SETTLEMENT_BOUNDS"); }
        if release.settlements.iter().any(|s| s.period == input.period) { fail("ERR_PERIOD_EXISTS"); }
        if release.settlements.iter().any(|s| matches!(s.status, SettlementStatus::Review | SettlementStatus::Held | SettlementStatus::Finalized | SettlementStatus::Paying)) { fail("ERR_LIVE_SETTLEMENT"); }
        release.settlements.push(new_settlement(input));
    }
    pub fn revise_settlement(&mut self, release_id: String, input: SettlementInput) {
        self.require_zero_deposit(); let admin = env::predecessor_account_id(); let release = self.release_mut(&release_id); if release.administrator_id != admin { fail("ERR_ADMIN_CALLER"); }
        let settlement = current_settlement_mut(release, &input.period); if !matches!(settlement.status, SettlementStatus::Review | SettlementStatus::Held) || settlement.agreement_version != input.agreement_version.0 || input.gross_yocto.0 == 0 { fail("ERR_REVISION_STATE"); }
        settlement.revision = checked_add_u64(settlement.revision, 1); settlement.normalized_statement_hash = input.normalized_statement_hash; settlement.gross_yocto = input.gross_yocto.0; settlement.deduction_evidence_hash = input.deduction_evidence_hash; settlement.allocation_preview_hash = input.allocation_preview_hash; settlement.approvals.clear(); settlement.cancellation_votes.clear();
    }
    pub fn approve_settlement(&mut self, release_id: String, period: String, digest: String) {
        self.require_zero_deposit(); let caller = env::predecessor_account_id(); let release = self.release_mut(&release_id); let (agreement_version, gross) = { let s = current_settlement(release, &period); if !matches!(s.status, SettlementStatus::Review | SettlementStatus::Held) { fail("ERR_APPROVAL_STATE"); } (s.agreement_version, s.gross_yocto) }; let expected = settlement_digest(current_settlement(release, &period)); if digest != expected { fail("ERR_SETTLEMENT_DIGEST"); } let (owner_id, epoch) = resolve_actor(release, agreement_version, gross, "approve_settlement", &caller); let settlement = current_settlement_mut(release, &period); settlement.approvals.retain(|a| a.owner_id != owner_id); settlement.approvals.push(ApprovalRecord { owner_id, actor_id: caller, revision: settlement.revision, digest, epoch });
    }
    pub fn dispute_settlement(&mut self, release_id: String, period: String, reason_hash: String) {
        self.require_zero_deposit(); let caller = env::predecessor_account_id(); let release = self.release_mut(&release_id); let (agreement_version, gross) = { let s = current_settlement(release, &period); if !matches!(s.status, SettlementStatus::Review | SettlementStatus::Held) { fail("ERR_DISPUTE_STATE"); } (s.agreement_version, s.gross_yocto) }; let (owner_id, _) = resolve_actor(release, agreement_version, gross, "dispute_settlement", &caller); let settlement = current_settlement_mut(release, &period); settlement.disputes.retain(|d| d.owner_id != owner_id); settlement.disputes.push(DisputeRecord { owner_id, revision: settlement.revision, reason_hash }); settlement.status = SettlementStatus::Held;
    }
    pub fn clear_dispute(&mut self, release_id: String, period: String) { self.require_zero_deposit(); let caller = env::predecessor_account_id(); let settlement = current_settlement_mut(self.release_mut(&release_id), &period); if !settlement.disputes.iter().any(|d| d.owner_id == caller && d.revision == settlement.revision) { fail("ERR_DISPUTE_OWNER"); } settlement.disputes.retain(|d| d.owner_id != caller); if settlement.disputes.is_empty() { settlement.status = SettlementStatus::Review; } }

    #[payable]
    pub fn fund_settlement(&mut self, release_id: String, period: String) { let caller = env::predecessor_account_id(); let amount = env::attached_deposit().as_yoctonear(); if amount == 0 { fail("ERR_ZERO_FUNDING"); } let release = self.release_mut(&release_id); if release.funder_id != caller { fail("ERR_FUNDER_CALLER"); } let settlement = current_settlement_mut(release, &period); if !matches!(settlement.status, SettlementStatus::Review | SettlementStatus::Held) { fail("ERR_FUNDING_STATE"); } settlement.total_deposited_yocto = checked_add(settlement.total_deposited_yocto, amount); settlement.unallocated_yocto = checked_add(settlement.unallocated_yocto, amount); }
    pub fn approve_cancellation(&mut self, release_id: String, period: String) { self.require_zero_deposit(); let caller = env::predecessor_account_id(); let release = self.release_mut(&release_id); if !release.accepted_owner_ids.contains(&caller) { fail("ERR_OWNER_CALLER"); } let owner_count = release.accepted_owner_ids.len(); let settlement = current_settlement_mut(release, &period); if !matches!(settlement.status, SettlementStatus::Review | SettlementStatus::Held) { fail("ERR_CANCELLATION_STATE"); } if !settlement.cancellation_votes.contains(&caller) { settlement.cancellation_votes.push(caller); } if settlement.cancellation_votes.len() == owner_count { settlement.refundable_yocto = checked_add(settlement.refundable_yocto, settlement.unallocated_yocto); settlement.unallocated_yocto = 0; settlement.status = SettlementStatus::Cancelled; } }
    pub fn finalize_settlement(&mut self, release_id: String, period: String) {
        self.require_zero_deposit();
        let release = self.release_mut(&release_id);
        let settlement_index = release.settlements.iter().position(|s| s.period == period).unwrap_or_else(|| fail("ERR_PERIOD_NOT_FOUND"));
        let agreement_version = release.settlements[settlement_index].agreement_version;
        let agreement_index = release.agreements.iter().position(|a| a.version == agreement_version && a.active).unwrap_or_else(|| fail("ERR_AGREEMENT_VERSION"));
        let agreement = release.agreements[agreement_index].clone();
        let accepted_owner_ids = release.accepted_owner_ids.clone();
        let snapshot = release.settlements[settlement_index].clone();
        if !matches!(snapshot.status, SettlementStatus::Review) || !snapshot.disputes.is_empty() { fail("ERR_FINALIZE_STATE"); }
        if snapshot.unallocated_yocto < snapshot.gross_yocto { fail("ERR_INSUFFICIENT_RESERVE"); }
        let digest = settlement_digest(&snapshot);
        if snapshot.approvals.len() != accepted_owner_ids.len() || accepted_owner_ids.iter().any(|owner| !snapshot.approvals.iter().any(|approval| approval.owner_id == *owner && approval.revision == snapshot.revision && approval.digest == digest && approval_is_valid(release, agreement.version, snapshot.gross_yocto, approval))) { fail("ERR_APPROVALS"); }
        let recoup_remaining = recoupment_remaining(&agreement);
        let beneficiary = agreement.recoupment.as_ref().map(|r| &r.beneficiary_id);
        let gross = snapshot.gross_yocto;
        {
            let settlement = &mut release.settlements[settlement_index];
            settlement.entitlements = allocate(gross, recoup_remaining, &agreement.participants, beneficiary);
            settlement.unallocated_yocto -= gross;
            settlement.refundable_yocto = checked_add(settlement.refundable_yocto, settlement.unallocated_yocto);
            settlement.unallocated_yocto = 0;
            settlement.unpaid_entitlements_yocto = gross;
            settlement.status = SettlementStatus::Finalized;
        }
        if let Some(r) = release.agreements[agreement_index].recoupment.as_mut() { r.consumed_yocto = checked_add(r.consumed_yocto, gross.min(recoup_remaining)); }
    }

    pub fn execute_payout(&mut self, release_id: String, period: String, owner_id: AccountId) -> Promise { self.require_zero_deposit(); let release = self.release_mut(&release_id); let settlement = current_settlement_mut(release, &period); if !matches!(settlement.status, SettlementStatus::Finalized | SettlementStatus::Paying) { fail("ERR_PAYOUT_STATE"); } let entitlement_index = settlement.entitlements.iter().position(|e| e.owner_id == owner_id).unwrap_or_else(|| fail("ERR_ENTITLEMENT_OWNER")); if settlement.entitlements[entitlement_index].status != EntitlementStatus::Available { fail("ERR_PAYOUT_PENDING"); } let amount = settlement.entitlements[entitlement_index].amount_yocto; if amount == 0 { settlement.entitlements[entitlement_index].status = EntitlementStatus::Paid; maybe_complete(settlement); return Promise::new(env::current_account_id()); } let attempt = settlement.next_attempt_id; settlement.next_attempt_id = checked_add_u64(attempt, 1); settlement.entitlements[entitlement_index].attempt_id = attempt; settlement.entitlements[entitlement_index].status = EntitlementStatus::Pending; settlement.unpaid_entitlements_yocto -= amount; settlement.in_flight_yocto = checked_add(settlement.in_flight_yocto, amount); settlement.status = SettlementStatus::Paying; Promise::new(owner_id.clone()).transfer(NearToken::from_yoctonear(amount)).then(Self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS).on_payout_complete(release_id, period, owner_id, attempt)) }
    #[cfg(feature = "fault-injection")]
    #[private]
    pub fn on_payout_complete(&mut self, release_id: String, period: String, owner_id: AccountId, attempt_id: u64, #[callback_result] result: Result<(), PromiseError>) {
        let _ = (release_id, period, owner_id, attempt_id, result);
        fail("ERR_FAULT_INJECT_CALLBACK");
    }

    #[cfg(not(feature = "fault-injection"))]
    #[private]
    pub fn on_payout_complete(&mut self, release_id: String, period: String, owner_id: AccountId, attempt_id: u64, #[callback_result] result: Result<(), PromiseError>) {
        let release = self.release_mut(&release_id); let settlement = current_settlement_mut(release, &period); let entitlement_index = settlement.entitlements.iter().position(|e| e.owner_id == owner_id).unwrap_or_else(|| fail("ERR_ENTITLEMENT_OWNER")); if settlement.entitlements[entitlement_index].status != EntitlementStatus::Pending || settlement.entitlements[entitlement_index].attempt_id != attempt_id { return; } let amount = settlement.entitlements[entitlement_index].amount_yocto; settlement.in_flight_yocto -= amount; if result.is_ok() { settlement.entitlements[entitlement_index].status = EntitlementStatus::Paid; settlement.successful_payouts_yocto = checked_add(settlement.successful_payouts_yocto, amount); } else { settlement.entitlements[entitlement_index].status = EntitlementStatus::Available; settlement.unpaid_entitlements_yocto = checked_add(settlement.unpaid_entitlements_yocto, amount); } maybe_complete(settlement); }
    pub fn withdraw_refundable(&mut self, release_id: String, period: String) -> Promise { self.require_zero_deposit(); let caller = env::predecessor_account_id(); let release = self.release_mut(&release_id); if release.funder_id != caller { fail("ERR_FUNDER_CALLER"); } let settlement = current_settlement_mut(release, &period); if settlement.refundable_yocto == 0 || settlement.refund_attempt.is_some() { fail("ERR_REFUND_STATE"); } let amount = settlement.refundable_yocto; let attempt = settlement.next_attempt_id; settlement.next_attempt_id = checked_add_u64(attempt, 1); settlement.refundable_yocto = 0; settlement.in_flight_yocto = checked_add(settlement.in_flight_yocto, amount); settlement.refund_attempt = Some(RefundAttempt { attempt_id: attempt, amount_yocto: amount }); Promise::new(caller.clone()).transfer(NearToken::from_yoctonear(amount)).then(Self::ext(env::current_account_id()).with_static_gas(CALLBACK_GAS).on_refund_complete(release_id, period, attempt)) }
    #[private]
    pub fn on_refund_complete(&mut self, release_id: String, period: String, attempt_id: u64, #[callback_result] result: Result<(), PromiseError>) { let release = self.release_mut(&release_id); let settlement = current_settlement_mut(release, &period); let refund = settlement.refund_attempt.clone().unwrap_or_else(|| fail("ERR_REFUND_ATTEMPT")); if refund.attempt_id != attempt_id { return; } settlement.in_flight_yocto -= refund.amount_yocto; if result.is_ok() { settlement.successful_refunds_yocto = checked_add(settlement.successful_refunds_yocto, refund.amount_yocto); } else { settlement.refundable_yocto = checked_add(settlement.refundable_yocto, refund.amount_yocto); } settlement.refund_attempt = None; maybe_complete(settlement); }
    pub fn get_release(&self, release_id: String) -> ReleaseView { release_view(self.release(&release_id)) }
    pub fn get_settlement(&self, release_id: String, period: String) -> SettlementView { settlement_view(current_settlement(self.release(&release_id), &period)) }
    fn require_zero_deposit(&self) { if env::attached_deposit().as_yoctonear() != 0 { fail("ERR_NO_DEPOSIT"); } }
    fn release(&self, id: &str) -> &ReleaseState { self.releases.iter().find(|r| r.release_id == id).unwrap_or_else(|| fail("ERR_RELEASE_NOT_FOUND")) }
    fn release_mut(&mut self, id: &str) -> &mut ReleaseState { self.releases.iter_mut().find(|r| r.release_id == id).unwrap_or_else(|| fail("ERR_RELEASE_NOT_FOUND")) }
}

#[near(serializers = [json])]
pub struct ContractHealth { pub application: String, pub network_id: String, pub operator_id: AccountId, pub last_agent_caller: Option<AccountId> }

#[near(serializers = [json])]
pub struct AgreementView { pub version: U64, pub recording_id: String, pub rules_hash: String, pub approval_digest: String, pub document_hash: String, pub active: bool, pub superseded: bool, pub participants: Vec<ParticipantShare> }
#[near(serializers = [json])]
pub struct ReleaseView { pub release_id: String, pub recording_id: String, pub administrator_id: AccountId, pub funder_id: AccountId, pub invited_owner_ids: Vec<AccountId>, pub accepted_owner_ids: Vec<AccountId>, pub active_agreement_version: Option<U64>, pub agreements: Vec<AgreementView> }
#[near(serializers = [json])]
pub struct SettlementView { pub period: String, pub revision: U64, pub agreement_version: U64, pub normalized_statement_hash: String, pub gross_yocto: near_sdk::json_types::U128, pub deduction_evidence_hash: String, pub allocation_preview_hash: String, pub status: SettlementStatus, pub total_deposited_yocto: near_sdk::json_types::U128, pub unallocated_yocto: near_sdk::json_types::U128, pub refundable_yocto: near_sdk::json_types::U128, pub unpaid_entitlements_yocto: near_sdk::json_types::U128, pub in_flight_yocto: near_sdk::json_types::U128, pub successful_payouts_yocto: near_sdk::json_types::U128, pub successful_refunds_yocto: near_sdk::json_types::U128, pub entitlements: Vec<EntitlementView> }
#[near(serializers = [json])]
pub struct EntitlementView { pub owner_id: AccountId, pub amount_yocto: near_sdk::json_types::U128, pub status: EntitlementStatus, pub attempt_id: U64 }

fn checked_add(a: u128, b: u128) -> u128 { a.checked_add(b).unwrap_or_else(|| fail("ERR_OVERFLOW")) }
fn checked_add_u64(a: u64, b: u64) -> u64 { a.checked_add(b).unwrap_or_else(|| fail("ERR_OVERFLOW")) }
fn new_settlement(input: SettlementInput) -> SettlementState { SettlementState { period: input.period, revision: 1, agreement_version: input.agreement_version.0, normalized_statement_hash: input.normalized_statement_hash, gross_yocto: input.gross_yocto.0, deduction_evidence_hash: input.deduction_evidence_hash, allocation_preview_hash: input.allocation_preview_hash, status: SettlementStatus::Review, total_deposited_yocto: 0, unallocated_yocto: 0, refundable_yocto: 0, unpaid_entitlements_yocto: 0, in_flight_yocto: 0, successful_payouts_yocto: 0, successful_refunds_yocto: 0, approvals: Vec::new(), disputes: Vec::new(), cancellation_votes: Vec::new(), entitlements: Vec::new(), next_attempt_id: 1, refund_attempt: None } }
fn current_settlement<'a>(release: &'a ReleaseState, period: &str) -> &'a SettlementState { release.settlements.iter().find(|s| s.period == period).unwrap_or_else(|| fail("ERR_PERIOD_NOT_FOUND")) }
fn current_settlement_mut<'a>(release: &'a mut ReleaseState, period: &str) -> &'a mut SettlementState { release.settlements.iter_mut().find(|s| s.period == period).unwrap_or_else(|| fail("ERR_PERIOD_NOT_FOUND")) }
fn resolve_actor(release: &ReleaseState, version: u64, gross: u128, action: &str, caller: &AccountId) -> (AccountId, u64) { if release.accepted_owner_ids.contains(caller) { return (caller.clone(), 0); } let mandate = release.mandates.iter().find(|m| m.agent_id == *caller && m.agreement_version == version && !m.revoked && m.expires_at_nanoseconds > env::block_timestamp() && m.max_gross_yocto >= gross && m.actions.iter().any(|a| a == action)).unwrap_or_else(|| fail("ERR_MANDATE_AUTH")); (mandate.owner_id.clone(), mandate.epoch) }
fn approval_is_valid(release: &ReleaseState, version: u64, gross: u128, approval: &ApprovalRecord) -> bool { if approval.actor_id == approval.owner_id { return release.accepted_owner_ids.contains(&approval.owner_id); } release.mandates.iter().any(|m| m.owner_id == approval.owner_id && m.agent_id == approval.actor_id && m.agreement_version == version && !m.revoked && m.epoch == approval.epoch && m.expires_at_nanoseconds > env::block_timestamp() && m.max_gross_yocto >= gross && m.actions.iter().any(|a| a == "approve_settlement")) }
fn maybe_complete(s: &mut SettlementState) { if !matches!(s.status, SettlementStatus::Finalized | SettlementStatus::Paying) { return; } if s.unpaid_entitlements_yocto == 0 && s.in_flight_yocto == 0 && s.refundable_yocto == 0 && s.refund_attempt.is_none() && s.entitlements.iter().all(|e| e.status == EntitlementStatus::Paid) { s.status = SettlementStatus::Complete; } }
fn settlement_digest(s: &SettlementState) -> String { hash_hex(format!("{}|{}|{}|{}|{}|{}|{}", s.period, s.revision, s.agreement_version, s.normalized_statement_hash, s.gross_yocto, s.deduction_evidence_hash, s.allocation_preview_hash).as_bytes()) }
fn canonical_rules(release_id: &str, recording_id: &str, participants: &[ParticipantShare], recoupment: Option<&RecoupmentState>, effective_period: &str) -> String { let participants = participants.iter().map(|p| format!(r#"{{"basisPoints":"{}","ownerId":"{}"}}"#, p.basis_points, p.owner_id)).collect::<Vec<_>>().join(","); let recoupment = recoupment.map(|r| format!(r#"{{"beneficiaryId":"{}","capYocto":"{}","code":"{}"}}"#, r.beneficiary_id, r.cap_yocto, r.code)).unwrap_or_else(|| "null".to_string()); format!(r#"{{"effectivePeriod":"{}","participants":[{}],"recordingId":"{}","recoupment":{},"releaseId":"{}","schemaVersion":"1"}}"#, effective_period, participants, recording_id, recoupment, release_id) }
fn canonical_approval(contract_id: &AccountId, release_id: &str, version: u64, rules_hash: &str, document_hash: &str) -> String { format!(r#"{{"agreementVersion":"{}","application":"royaltydesk","contractId":"{}","documentHash":"{}","networkId":"testnet","releaseId":"{}","rulesHash":"{}","schema":"agreement-approval/v1"}}"#, version, contract_id, document_hash, release_id, rules_hash) }
fn hash_hex(bytes: impl AsRef<[u8]>) -> String { env::sha256(bytes.as_ref()).iter().map(|b| format!("{:02x}", b)).collect() }
fn release_view(release: &ReleaseState) -> ReleaseView { ReleaseView { release_id: release.release_id.clone(), recording_id: release.recording_id.clone(), administrator_id: release.administrator_id.clone(), funder_id: release.funder_id.clone(), invited_owner_ids: release.invited_owner_ids.clone(), accepted_owner_ids: release.accepted_owner_ids.clone(), active_agreement_version: release.active_agreement_version.map(U64), agreements: release.agreements.iter().map(|a| AgreementView { version: U64(a.version), recording_id: a.recording_id.clone(), rules_hash: a.rules_hash.clone(), approval_digest: a.approval_digest.clone(), document_hash: a.document_hash.clone(), active: a.active, superseded: a.superseded, participants: a.participants.clone() }).collect() } }
fn settlement_view(settlement: &SettlementState) -> SettlementView { SettlementView { period: settlement.period.clone(), revision: U64(settlement.revision), agreement_version: U64(settlement.agreement_version), normalized_statement_hash: settlement.normalized_statement_hash.clone(), gross_yocto: near_sdk::json_types::U128(settlement.gross_yocto), deduction_evidence_hash: settlement.deduction_evidence_hash.clone(), allocation_preview_hash: settlement.allocation_preview_hash.clone(), status: settlement.status.clone(), total_deposited_yocto: near_sdk::json_types::U128(settlement.total_deposited_yocto), unallocated_yocto: near_sdk::json_types::U128(settlement.unallocated_yocto), refundable_yocto: near_sdk::json_types::U128(settlement.refundable_yocto), unpaid_entitlements_yocto: near_sdk::json_types::U128(settlement.unpaid_entitlements_yocto), in_flight_yocto: near_sdk::json_types::U128(settlement.in_flight_yocto), successful_payouts_yocto: near_sdk::json_types::U128(settlement.successful_payouts_yocto), successful_refunds_yocto: near_sdk::json_types::U128(settlement.successful_refunds_yocto), entitlements: settlement.entitlements.iter().map(|e| EntitlementView { owner_id: e.owner_id.clone(), amount_yocto: near_sdk::json_types::U128(e.amount_yocto), status: e.status.clone(), attempt_id: U64(e.attempt_id) }).collect() } }

#[cfg(test)]
mod tests { use super::accounting::allocate; use super::models::{EntitlementStatus, ParticipantShare}; use near_sdk::AccountId; #[test] fn allocation_conserves_and_recoups() { let participants = vec![ParticipantShare { owner_id: "a.testnet".parse::<AccountId>().unwrap(), basis_points: 5000 }, ParticipantShare { owner_id: "b.testnet".parse::<AccountId>().unwrap(), basis_points: 5000 }]; let beneficiary = "a.testnet".parse::<AccountId>().unwrap(); let rows = allocate(101, 10, &participants, Some(&beneficiary)); assert_eq!(rows.iter().map(|r| r.amount_yocto).sum::<u128>(), 101); assert!(rows.iter().all(|r| r.status == EntitlementStatus::Available)); } #[test] fn zero_entitlements_are_retained_for_resolution() { let participants = vec![ParticipantShare { owner_id: "a.testnet".parse::<AccountId>().unwrap(), basis_points: 5000 }, ParticipantShare { owner_id: "b.testnet".parse::<AccountId>().unwrap(), basis_points: 5000 }]; let beneficiary = "a.testnet".parse::<AccountId>().unwrap(); let rows = allocate(10, 10, &participants, Some(&beneficiary)); assert_eq!(rows.len(), 2); assert_eq!(rows[1].amount_yocto, 0); } }
