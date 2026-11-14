import { JsonRpcProvider } from "near-api-js";
import { verifyMessage } from "near-api-js/nep413";
import { randomBytes } from "node:crypto";
import { consumeChallenge, createChallenge, createSession, upsertUser, type AuthChallenge } from "@studio/persistence";
import { authOrigin, configuredNetwork, getAppDatabase } from "./runtime";

const ACCOUNT_ID = /^[a-z0-9][a-z0-9._-]{1,63}$/;

export function issueWalletChallenge(request: Request, accountId?: string): AuthChallenge & { readonly nonceBytes: string } {
  if (accountId !== undefined && !ACCOUNT_ID.test(accountId)) throw new Error("ERR_ACCOUNT_ID");
  const networkId = configuredNetwork();
  const domain = authOrigin(request);
  const nonceBytes = randomBytes(32).toString("base64url");
  const message = `Accord login | domain=${domain} | network=${networkId} | nonce=${nonceBytes}`;
  const challenge = createChallenge(getAppDatabase(), { ...(accountId ? { accountId } : {}), nonce: nonceBytes, domain, networkId, message });
  return { ...challenge, nonceBytes };
}

export async function verifyWalletChallenge(input: { readonly nonce: string; readonly accountId: string; readonly publicKey: string; readonly signature: string }, request: Request): Promise<{ readonly token: string; readonly expiresAtMs: number; readonly account: string }> {
  if (!ACCOUNT_ID.test(input.accountId) || !input.publicKey.startsWith("ed25519:") || input.signature.length < 40) throw new Error("ERR_AUTH_INPUT");
  const database = getAppDatabase();
  const challenge = consumeChallenge(database, input.nonce);
  if (!challenge || challenge.domain !== authOrigin(request) || challenge.networkId !== configuredNetwork() || (challenge.accountId !== null && challenge.accountId !== input.accountId)) throw new Error("ERR_CHALLENGE");
  const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs" });
  const nonce = new Uint8Array(Buffer.from(challenge.nonce, "base64url"));
  if (nonce.byteLength !== 32) throw new Error("ERR_CHALLENGE");
  await verifyMessage({ signerAccountId: input.accountId, signerPublicKey: input.publicKey, signature: new Uint8Array(Buffer.from(input.signature, "base64")), payload: { message: challenge.message, recipient: challenge.domain, nonce }, provider });
  const user = upsertUser(database, { networkId: challenge.networkId, accountId: input.accountId, publicKey: input.publicKey });
  return { ...createSession(database, user.id), account: user.accountId };
}
