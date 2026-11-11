import { JsonRpcProvider } from "near-api-js";
import { walletConnector } from "@/components/wallet-session";
import type { ChainRelease, ChainSettlement } from "./chain-types";

interface TransactionRequest {
  readonly networkId: string;
  readonly receiverId: string;
  readonly methodName: string;
  readonly args: Record<string, unknown>;
  readonly depositYocto: string;
}

export interface ActionResult {
  readonly data: Record<string, unknown>;
  readonly transactionHash?: string;
}

const messages: Record<string, string> = {
  ERR_UNAUTHORIZED: "Connect and verify a testnet wallet to continue.",
  ERR_FORBIDDEN: "This wallet does not have permission for this release action.",
  ERR_RELEASE_NOT_ON_CHAIN: "This release is not on testnet yet. Create it or check the release ID.",
  ERR_RELEASE_NOT_FOUND: "This release ID was not found on testnet.",
  ERR_INVITATION: "This wallet is not in the release's invited owner list.",
  ERR_CHAIN_MEMBERSHIP_PENDING: "Accept the invitation in your wallet first, then confirm it here.",
  ERR_EVIDENCE_MISSING: "Import a payable statement and confirm an active agreement before opening a settlement.",
  ERR_EVIDENCE_MISMATCH: "The statement does not match the active agreement or is not payable.",
  ERR_CHAIN_AUTHORITY: "The contract does not show the required agreement or administrator authority yet.",
  ERR_STALE_AGREEMENT: "This agreement changed. Refresh the release and review the latest version.",
  ERR_AGREEMENT_VERSION_STALE: "A newer agreement version exists. Refresh before preparing another one.",
  ERR_STORAGE_CONFIG: "Private file storage is not configured on the server.",
  ERR_CSV_SIZE: "The statement is too large. Use a CSV smaller than 1 MB."
};

function readableError(value: unknown): string {
  const raw = typeof value === "string" ? value : "The request could not be completed.";
  const code = Object.keys(messages).find((entry) => raw.includes(entry));
  return code ? messages[code] ?? raw : raw;
}

export function errorMessage(error: unknown): string {
  return readableError(error instanceof Error ? error.message : error);
}

export async function readApi<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  const data = await response.json() as T & { error?: unknown };
  if (!response.ok) throw new Error(readableError(data.error));
  return data;
}

export async function sendApi(url: string, init: RequestInit): Promise<ActionResult> {
  const response = await fetch(url, init);
  const data = await response.json() as Record<string, unknown>;
  if (!response.ok) throw new Error(readableError(data.error));
  const transaction = data.transactionRequest as TransactionRequest | undefined;
  if (!transaction) return { data };
  if (transaction.networkId !== "testnet" || !transaction.receiverId.endsWith(".testnet") || !/^\d+$/.test(transaction.depositYocto)) throw new Error("The server returned an invalid testnet wallet request.");
  const wallet = await walletConnector().wallet();
  const session = await readApi<{ accountId: string }>("/api/auth/me");
  const accounts = await wallet.getAccounts({ network: "testnet" });
  if (!accounts.some((account) => account.accountId === session.accountId)) throw new Error("Your connected wallet differs from this session. Reconnect it before signing.");
  const outcome = await wallet.signAndSendTransaction({
    signerId: session.accountId,
    receiverId: transaction.receiverId,
    network: "testnet",
    actions: [{ type: "FunctionCall", params: { methodName: transaction.methodName, args: transaction.args, gas: "100000000000000", deposit: transaction.depositYocto } }]
  });
  if (typeof outcome.status === "object" && outcome.status !== null && "Failure" in outcome.status) throw new Error(`The wallet transaction failed: ${outcome.transaction.hash}`);
  return { data, transactionHash: outcome.transaction.hash };
}

export function jsonRequest(body: unknown, method = "POST"): RequestInit {
  return { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) };
}

function provider(): JsonRpcProvider {
  return new JsonRpcProvider({ url: process.env.NEXT_PUBLIC_NEAR_RPC_URL ?? "https://test.rpc.fastnear.com" });
}

function contractId(): string {
  const id = process.env.NEXT_PUBLIC_CONTRACT_ID;
  if (!id?.endsWith(".testnet")) throw new Error("A testnet contract ID is not configured.");
  return id;
}

export async function viewRelease(releaseId: string): Promise<ChainRelease> {
  const release = await provider().callFunction<ChainRelease>({ contractId: contractId(), method: "get_release", args: { release_id: releaseId } });
  if (!release) throw new Error("This release ID was not found on testnet.");
  return release;
}

export async function viewSettlement(releaseId: string, period: string): Promise<ChainSettlement> {
  const settlement = await provider().callFunction<ChainSettlement>({ contractId: contractId(), method: "get_settlement", args: { release_id: releaseId, period } });
  if (!settlement) throw new Error("No settlement exists for this month yet.");
  return settlement;
}

export function nearToYocto(value: string): string {
  if (!/^\d+(?:\.\d{1,24})?$/.test(value)) throw new Error("Enter a NEAR amount with no more than 24 decimal places.");
  const [inputWhole, fraction = ""] = value.split(".");
  const whole = inputWhole ?? "0";
  return (BigInt(whole) * 10n ** 24n + BigInt(fraction.padEnd(24, "0"))).toString();
}

export function yoctoToNear(value: string): string {
  const amount = BigInt(value);
  const whole = amount / 10n ** 24n;
  const fraction = (amount % 10n ** 24n).toString().padStart(24, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}
