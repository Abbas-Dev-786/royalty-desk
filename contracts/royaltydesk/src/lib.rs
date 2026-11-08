use near_sdk::{env, near, AccountId, PanicOnDefault};

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct RoyaltyDeskContract {
    application: String,
    network_id: String,
    operator_id: AccountId,
    last_agent_caller: Option<AccountId>,
}

#[near]
impl RoyaltyDeskContract {
    #[init]
    pub fn new(network_id: String, operator_id: AccountId) -> Self {
        if network_id != "testnet" {
            env::panic_str("ERR_CONFIG_NETWORK");
        }
        Self {
            application: "royaltydesk".to_string(),
            network_id,
            operator_id,
            last_agent_caller: None,
        }
    }

    pub fn health(&self) -> ContractHealth {
        ContractHealth {
            application: self.application.clone(),
            network_id: self.network_id.clone(),
            operator_id: self.operator_id.clone(),
            last_agent_caller: self.last_agent_caller.clone(),
        }
    }

    pub fn agent_probe(&mut self) -> AccountId {
        if env::attached_deposit().as_yoctonear() != 0 {
            env::panic_str("ERR_AGENT_DEPOSIT");
        }
        let predecessor = env::predecessor_account_id();
        self.last_agent_caller = Some(predecessor.clone());
        predecessor
    }

    pub fn owner_probe(&self) -> AccountId {
        let predecessor = env::predecessor_account_id();
        if predecessor != self.operator_id {
            env::panic_str("ERR_OWNER_CALLER");
        }
        predecessor
    }
}

#[near(serializers = [json])]
pub struct ContractHealth {
    pub application: String,
    pub network_id: String,
    pub operator_id: AccountId,
    pub last_agent_caller: Option<AccountId>,
}
