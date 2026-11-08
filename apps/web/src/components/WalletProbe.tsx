"use client";

import { NearConnector } from "@hot-labs/near-connect";
import { useState } from "react";

type ProbeState = "idle" | "opening" | "requested" | "failed";

export function WalletProbe() {
  const [state, setState] = useState<ProbeState>("idle");

  async function requestSignedChallenge(): Promise<void> {
    setState("opening");
    try {
      const connector = new NearConnector({
        network: "testnet",
        features: {
          signMessage: true,
          signTransaction: true,
          signInWithoutAddKey: true,
          signAndSendTransaction: true,
          signAndSendTransactions: true
        }
      });
      const nonce = crypto.getRandomValues(new Uint8Array(32));
      const wallet = await connector.connect();
      await wallet.signMessage({
        message: "RoyaltyDesk compatibility probe. This does not approve an agreement or payment.",
        recipient: window.location.origin,
        nonce,
        network: "testnet"
      });
      setState("requested");
    } catch {
      setState("failed");
    }
  }

  return (
    <div className="wallet-probe">
      <button type="button" onClick={requestSignedChallenge} disabled={state === "opening"}>
        {state === "opening" ? "Opening testnet wallet…" : "Run wallet signature probe"}
      </button>
      <span aria-live="polite">
        {state === "requested" && "Wallet request completed; server verification is implemented in Phase 5."}
        {state === "failed" && "The wallet request was unavailable or declined."}
      </span>
    </div>
  );
}
