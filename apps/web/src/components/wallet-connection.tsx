"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { notifyWalletSession, walletConnector } from "./wallet-session";
import { notifyStudio } from "./studio/studio-notifications";

function walletErrorMessage(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : "Wallet connection failed.";
  return /^ERR_[A-Z0-9_]+$/.test(message) ? "We could not verify your wallet. Please reconnect and sign the login message again." : message;
}

export function WalletConnection() {
  const [accountId, setAccountId] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const refresh = () => {
      void fetch("/api/auth/me", { cache: "no-store" }).then(async (response) => {
        setAccountId(response.ok ? (await response.json() as { accountId?: string }).accountId ?? null : null);
      }).catch(() => setAccountId(null));
    };
    refresh();
    window.addEventListener("studio-session-changed", refresh);
    return () => window.removeEventListener("studio-session-changed", refresh);
  }, []);

  async function connect(): Promise<void> {
    setWorking(true);
    setError("");
    notifyStudio({ id: "wallet-session", tone: "progress", title: "Connecting wallet", description: "Choose your NEAR testnet wallet and sign the login message. No payment is made." });
    try {
      const connector = walletConnector();
      await connector.whenManifestLoaded;
      if (connector.availableWallets.length === 0) throw new Error("No NEAR testnet wallet is available in this browser.");
      const wallet = await connector.connect();
      const challengeResponse = await fetch("/api/auth/challenge", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
      const challenge = await challengeResponse.json() as { nonce?: string; message?: string; recipient?: string; error?: string };
      if (!challengeResponse.ok || !challenge.nonce || !challenge.message || !challenge.recipient) throw new Error(challenge.error ?? "Could not start wallet verification.");
      const encodedNonce = challenge.nonce.replace(/-/g, "+").replace(/_/g, "/");
      const nonce = Uint8Array.from(atob(encodedNonce + "=".repeat((4 - encodedNonce.length % 4) % 4)), (character) => character.charCodeAt(0));
      const signed = await wallet.signMessage({ message: challenge.message, recipient: challenge.recipient, nonce, network: "testnet" });
      if (!signed.signature || !signed.accountId) throw new Error("The wallet did not return a signed identity proof.");
      const verifiedResponse = await fetch("/api/auth/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nonce: challenge.nonce, accountId: signed.accountId, publicKey: signed.publicKey, signature: signed.signature }) });
      const verified = await verifiedResponse.json() as { accountId?: string; error?: string };
      if (!verifiedResponse.ok || !verified.accountId) throw new Error(verified.error ?? "The server could not verify this wallet.");
      setAccountId(verified.accountId);
      notifyWalletSession();
      notifyStudio({ id: "wallet-session", tone: "success", title: "Wallet connected", description: `Signed in as ${verified.accountId}. You can now create a song, buy a download, or send a tip.` });
    } catch (cause) {
      const description = walletErrorMessage(cause);
      setError(description);
      notifyStudio({ id: "wallet-session", tone: "error", title: "Wallet connection failed", description });
    } finally {
      setWorking(false);
    }
  }

  async function disconnect(): Promise<void> {
    setWorking(true);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error("Could not sign out. Please try again.");
      setAccountId(null);
      notifyWalletSession();
      notifyStudio({ id: "wallet-session", tone: "success", title: "Signed out", description: "Your studio session has ended on this browser." });
    } catch (cause) {
      const description = walletErrorMessage(cause);
      setError(description);
      notifyStudio({ id: "wallet-session", tone: "error", title: "Sign out failed", description });
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="wallet-control">
      {accountId ? <><span className="wallet-account" title={accountId}>{accountId}</span><Button variant="outline" size="sm" onClick={disconnect} disabled={working}>Sign out</Button></> : <Button size="sm" onClick={connect} disabled={working}>{working ? "Connecting…" : "Connect wallet"}</Button>}
      {error && <p className="wallet-error" role="alert">{error}</p>}
    </div>
  );
}
