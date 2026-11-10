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
      const wallet = await connector.connect();
      const challengeResponse = await fetch("/api/auth/challenge", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}) });
      const challenge = await challengeResponse.json() as { nonce?: string; message?: string; recipient?: string; error?: string };
      if (!challengeResponse.ok || !challenge.nonce || !challenge.message || !challenge.recipient) throw new Error(challenge.error ?? "Could not create wallet challenge.");
      const encodedNonce = challenge.nonce.replace(/-/g, "+").replace(/_/g, "/");
      const nonce = Uint8Array.from(atob(encodedNonce + "=".repeat((4 - encodedNonce.length % 4) % 4)), (character) => character.charCodeAt(0));
      const signedMessage = await wallet.signMessage({
        message: challenge.message,
        recipient: challenge.recipient,
        nonce,
        network: "testnet"
      });
      if (!signedMessage.signature || !signedMessage.accountId) {
        throw new Error("The selected wallet did not return a NEP-413 signature.");
      }
      const verifyResponse = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nonce: challenge.nonce, accountId: signedMessage.accountId, publicKey: signedMessage.publicKey, signature: signedMessage.signature }) });
      const verification = await verifyResponse.json() as { accountId?: string; error?: string };
      if (!verifyResponse.ok) throw new Error(verification.error ?? "Server rejected the wallet signature.");
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
        {state === "requested" && `Wallet signature verified for ${accountId}.`}
        {state === "failed" && errorMessage}
      </span>
    </div>
  );
}
