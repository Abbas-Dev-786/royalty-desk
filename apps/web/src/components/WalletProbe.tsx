"use client";

import { NearConnector } from "@hot-labs/near-connect";
import { useRef, useState } from "react";

type ProbeState = "idle" | "opening" | "requested" | "failed";

export function WalletProbe() {
  const [state, setState] = useState<ProbeState>("idle");
  const [accountId, setAccountId] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");
  const connectorRef = useRef<NearConnector | null>(null);

  async function requestSignedChallenge(): Promise<void> {
    setState("opening");
    setErrorMessage("");
    try {
      const connector = connectorRef.current ?? new NearConnector({
        network: "testnet",
        autoConnect: false
      });
      connectorRef.current = connector;
      await connector.whenManifestLoaded;
      if (connector.availableWallets.length === 0) {
        throw new Error("No testnet wallets were loaded. Check browser network access to the NEAR wallet manifest.");
      }
      const nonce = crypto.getRandomValues(new Uint8Array(32));
      const wallet = await connector.connect();
      const signedMessage = await wallet.signMessage({
        message: "RoyaltyDesk compatibility probe. This does not approve an agreement or payment.",
        recipient: window.location.origin,
        nonce,
        network: "testnet"
      });
      if (!signedMessage.signature || !signedMessage.accountId) {
        throw new Error("The selected wallet did not return a NEP-413 signature.");
      }
      setAccountId(signedMessage.accountId);
      setState("requested");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Wallet connection failed.");
      setState("failed");
    }
  }

  return (
    <div className="wallet-probe">
      <button type="button" onClick={requestSignedChallenge} disabled={state === "opening"}>
        {state === "opening" ? "Opening testnet wallet…" : "Run wallet signature probe"}
      </button>
      <span aria-live="polite">
        {state === "requested" && `Wallet signature received from ${accountId}. Server verification is implemented in Phase 5.`}
        {state === "failed" && errorMessage}
      </span>
    </div>
  );
}
