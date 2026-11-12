mod models;
mod payments;
mod payouts;
mod releases;
#[cfg(test)] mod tests;

use near_sdk::store::LookupMap;
use near_sdk::{AccountId, PanicOnDefault, env, near, require};
pub use models::{AgentView, EarningsView, PaymentView, PayoutView, PolicyInput, PolicyView, ReleaseInput, ReleaseView};
use models::{Agent, Payment, Payout, Policy, Release};

#[near(serializers = [borsh])]
struct LegacyStudioContract {
    schema_version: u8,
    admin_id: AccountId,
    policy: Policy,
    agents: LookupMap<AccountId, Agent>,
    releases: LookupMap<String, Release>,
    latest: LookupMap<String, u32>,
    acceptances: LookupMap<String, bool>,
    approvals: LookupMap<String, bool>,
    payments: LookupMap<String, Payment>,
    agent_count: u32,
    release_count: u32,
    payment_count: u32,
    escrow_yocto: u128,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct StudioContract {
    schema_version: u8,
    admin_id: AccountId,
    policy: Policy,
    agents: LookupMap<AccountId, Agent>,
    releases: LookupMap<String, Release>,
    latest: LookupMap<String, u32>,
    acceptances: LookupMap<String, bool>,
    approvals: LookupMap<String, bool>,
    payments: LookupMap<String, Payment>,
    agent_count: u32,
    release_count: u32,
    payment_count: u32,
    escrow_yocto: u128,
    owed: LookupMap<AccountId, u128>,
    pending: LookupMap<AccountId, u128>,
    paid: LookupMap<AccountId, u128>,
    payouts: LookupMap<String, Payout>,
    pending_payout_yocto: u128,
    paid_payout_yocto: u128,
    payout_count: u32,
}

#[near]
impl StudioContract {
    #[init]
    pub fn new(admin_id: AccountId) -> Self {
        require!(env::predecessor_account_id() == env::current_account_id(), "INIT_CONTRACT_ONLY");
        Self { schema_version: 2, admin_id, policy: Policy { epoch: 1, human_review: true, paused: false, max_price_yocto: 100_000_000_000_000_000_000_000, max_tip_yocto: 1_000_000_000_000_000_000_000_000 }, agents: LookupMap::new(b"a"), releases: LookupMap::new(b"r"), latest: LookupMap::new(b"v"), acceptances: LookupMap::new(b"s"), approvals: LookupMap::new(b"p"), payments: LookupMap::new(b"m"), agent_count: 0, release_count: 0, payment_count: 0, escrow_yocto: 0, owed: LookupMap::new(b"o"), pending: LookupMap::new(b"n"), paid: LookupMap::new(b"d"), payouts: LookupMap::new(b"y"), pending_payout_yocto: 0, paid_payout_yocto: 0, payout_count: 0 }
    }
    pub fn get_policy(&self) -> PolicyView { self.policy.view() }
    pub fn get_admin(&self) -> AccountId { self.admin_id.clone() }
    pub fn get_schema_version(&self) -> u8 { self.schema_version }
    pub fn get_agent(&self, account_id: AccountId) -> Option<AgentView> { self.agents.get(&account_id).map(|a| a.view(account_id)) }
    pub fn get_release(&self, work_id: String, version: u32) -> Option<ReleaseView> { self.releases.get(&Self::release_key(&work_id, version)).map(|r| r.view()) }
    pub fn has_accepted_split(&self, work_id: String, version: u32, account_id: AccountId) -> bool { self.acceptances.get(&Self::acceptance_key(&work_id, version, &account_id)).is_some() }
    pub fn has_approved_release(&self, work_id: String, version: u32, policy_epoch: u32) -> bool { self.approvals.get(&Self::approval_key(&work_id, version, policy_epoch)).is_some() }
    pub fn get_latest_version(&self, work_id: String) -> Option<u32> { self.latest.get(&work_id).copied() }
    pub fn get_payment(&self, payment_id: String) -> Option<PaymentView> { self.payments.get(&payment_id).map(|p| p.view(payment_id)) }
    pub fn get_escrow_yocto(&self) -> near_sdk::json_types::U128 { near_sdk::json_types::U128(self.escrow_yocto) }
    pub fn get_pending_payout_yocto(&self) -> near_sdk::json_types::U128 { near_sdk::json_types::U128(self.pending_payout_yocto) }
    pub fn get_paid_payout_yocto(&self) -> near_sdk::json_types::U128 { near_sdk::json_types::U128(self.paid_payout_yocto) }
    pub fn get_earnings(&self, account_id: AccountId) -> EarningsView { EarningsView { account_id: account_id.clone(), owed_yocto: near_sdk::json_types::U128(self.owed.get(&account_id).copied().unwrap_or(0)), pending_yocto: near_sdk::json_types::U128(self.pending.get(&account_id).copied().unwrap_or(0)), paid_yocto: near_sdk::json_types::U128(self.paid.get(&account_id).copied().unwrap_or(0)) } }
    pub fn get_payout(&self, payout_id: String) -> Option<PayoutView> { self.payouts.get(&payout_id).map(|p| p.view(payout_id)) }

    /// Called by this contract account immediately after a compatible code upgrade.
    #[init(ignore_state)]
    #[private]
    pub fn migrate() -> Self {
        let previous: LegacyStudioContract = env::state_read().expect("PREVIOUS_STATE_MISSING");
        require!(previous.schema_version == 1, "UNSUPPORTED_STATE_VERSION");
        Self { schema_version: 2, admin_id: previous.admin_id, policy: previous.policy, agents: previous.agents, releases: previous.releases, latest: previous.latest, acceptances: previous.acceptances, approvals: previous.approvals, payments: previous.payments, agent_count: previous.agent_count, release_count: previous.release_count, payment_count: previous.payment_count, escrow_yocto: previous.escrow_yocto, owed: LookupMap::new(b"o"), pending: LookupMap::new(b"n"), paid: LookupMap::new(b"d"), payouts: LookupMap::new(b"y"), pending_payout_yocto: 0, paid_payout_yocto: 0, payout_count: 0 }
    }

    #[payable]
    pub fn set_policy(&mut self, input: PolicyInput) {
        self.require_admin_one_yocto();
        require!(input.epoch == self.policy.epoch + 1, "POLICY_EPOCH_STALE");
        require!(input.max_price_yocto.0 > 0 && input.max_price_yocto.0 <= 10_u128.pow(25), "PRICE_CAP_INVALID");
        require!(input.max_tip_yocto.0 >= 10_u128.pow(21) && input.max_tip_yocto.0 <= 10_u128.pow(24), "TIP_CAP_INVALID");
        self.policy = Policy { epoch: input.epoch, human_review: input.human_review, paused: input.paused, max_price_yocto: input.max_price_yocto.0, max_tip_yocto: input.max_tip_yocto.0 };
        Self::event("policy_updated", near_sdk::serde_json::json!({"epoch": self.policy.epoch, "human_review": self.policy.human_review, "paused": self.policy.paused}));
    }
    #[payable]
    pub fn register_agent(&mut self, account_id: AccountId, role: String, expires_at_ms: u64, max_actions: u32) {
        self.require_admin();
        require!(env::attached_deposit().as_yoctonear() > 0, "STORAGE_DEPOSIT_REQUIRED");
        require!(self.agents.get(&account_id).is_none() && self.agent_count < 32, "AGENT_LIMIT_OR_DUPLICATE");
        require!(matches!(role.as_str(), "lyricist" | "composer" | "producer" | "reviewer"), "ROLE_INVALID");
        require!(expires_at_ms > env::block_timestamp_ms(), "AGENT_EXPIRED");
        require!((1..=1000).contains(&max_actions), "AGENT_ACTION_BUDGET_INVALID");
        self.agents.insert(account_id.clone(), Agent { role, active: true, expires_at_ms, max_actions, actions_used: 0 });
        self.agent_count += 1;
        self.require_storage_reserve();
        Self::event("agent_registered", near_sdk::serde_json::json!({"account_id": account_id}));
    }
    #[payable]
    pub fn revoke_agent(&mut self, account_id: AccountId) {
        self.require_admin_one_yocto();
        let mut agent = self.agents.get(&account_id).cloned().expect("AGENT_MISSING");
        agent.active = false;
        self.agents.insert(account_id.clone(), agent);
        Self::event("agent_revoked", near_sdk::serde_json::json!({"account_id": account_id}));
    }
    fn require_admin(&self) { require!(env::predecessor_account_id() == self.admin_id, "ADMIN_REQUIRED"); }
    fn require_admin_one_yocto(&self) { self.require_admin(); require!(env::attached_deposit().as_yoctonear() == 1, "ONE_YOCTO_REQUIRED"); }
    fn require_agent_role(&mut self, roles: &[&str]) -> AccountId {
        require!(env::attached_deposit().as_yoctonear() == 0, "AGENT_DEPOSIT_FORBIDDEN");
        let caller = env::predecessor_account_id();
        let mut agent = self.agents.get(&caller).cloned().expect("AGENT_REQUIRED");
        require!(agent.active && agent.expires_at_ms > env::block_timestamp_ms(), "AGENT_REVOKED_OR_EXPIRED");
        require!(roles.iter().any(|role| *role == agent.role), "AGENT_ROLE_FORBIDDEN");
        require!(agent.actions_used < agent.max_actions, "AGENT_ACTION_BUDGET_EXHAUSTED");
        require!(!self.policy.paused, "STUDIO_PAUSED");
        agent.actions_used += 1;
        self.agents.insert(caller.clone(), agent);
        caller
    }
    fn require_storage_reserve(&mut self) {
        self.agents.flush();
        self.releases.flush();
        self.latest.flush();
        self.acceptances.flush();
        self.approvals.flush();
        self.payments.flush();
        self.owed.flush();
        self.pending.flush();
        self.paid.flush();
        self.payouts.flush();
        let storage = u128::from(env::storage_usage()).checked_mul(env::storage_byte_cost().as_yoctonear()).expect("STORAGE_OVERFLOW");
        let retained_escrow = self.escrow_yocto.checked_sub(self.pending_payout_yocto).expect("PENDING_EXCEEDS_ESCROW");
        require!(env::account_balance().as_yoctonear() >= retained_escrow.checked_add(storage).expect("BALANCE_OVERFLOW"), "STORAGE_UNDERFUNDED");
    }
    fn release_key(work_id: &str, version: u32) -> String { format!("{work_id}:{version}") }
    fn acceptance_key(work_id: &str, version: u32, account_id: &AccountId) -> String { format!("{work_id}:{version}:{account_id}") }
    fn approval_key(work_id: &str, version: u32, epoch: u32) -> String { format!("{work_id}:{version}:{epoch}") }
    fn event(name: &str, data: near_sdk::serde_json::Value) { env::log_str(&format!("EVENT_JSON:{}", near_sdk::serde_json::json!({"standard":"studio","version":"1.0.0","event":name,"data":[data]}))); }
}
