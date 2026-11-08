export const REQUIRED_NETWORK_ID = "testnet" as const;

export interface ContractIdentity {
  readonly networkId: typeof REQUIRED_NETWORK_ID;
  readonly contractId: string;
}

export function assertContractIdentity(identity: ContractIdentity): void {
  if (identity.networkId !== REQUIRED_NETWORK_ID) throw new Error("RoyaltyDesk supports testnet only");
  if (!identity.contractId.endsWith(".testnet")) throw new Error("Contract account must belong to testnet");
}
