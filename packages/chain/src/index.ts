export const REQUIRED_NETWORK_ID = "testnet" as const;

export interface ContractIdentity {
  readonly networkId: typeof REQUIRED_NETWORK_ID;
  readonly contractId: string;
}

export function assertContractIdentity(identity: ContractIdentity): void {
  if (identity.networkId !== REQUIRED_NETWORK_ID) throw new Error("Studio supports testnet only");
  if (!identity.contractId.endsWith(".testnet")) throw new Error("Contract account must belong to testnet");
}

export * from "./studio.ts";
export * from "./bounded-rpc-provider.ts";
export * from "./read-fallback-rpc-provider.ts";
export * from "./rpc-rate-limit.ts";
export * from "./studio-release-input.ts";
export * from "./restricted-signer.ts";
export * from "./transfer-outcome.ts";
