import { NearConnector } from "@hot-labs/near-connect";

let connector: NearConnector | undefined;

export function walletConnector(): NearConnector {
  connector ??= new NearConnector({ network: "testnet", autoConnect: false });
  return connector;
}

export function notifyWalletSession(): void {
  window.dispatchEvent(new Event("studio-session-changed"));
}
