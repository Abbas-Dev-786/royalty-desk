import type { Account } from "near-api-js";
import { createHash } from "node:crypto";
import { actions, baseEncode } from "near-api-js";
import { createChainOperation, getChainOperation, updateChainOperation } from "@royaltydesk/persistence";
import type { DatabaseSync } from "node:sqlite";

export interface RestrictedSignerOptions { readonly account: Account; readonly contractId: string; readonly allowedMethods: readonly string[]; readonly database: DatabaseSync; readonly keyId: string; }
export interface RestrictedCall { readonly operationId: string; readonly logicalKey: string; readonly releaseId: string; readonly methodName: string; readonly args: Record<string, unknown>; readonly depositYocto?: bigint; }

const queues = new Map<string, Promise<void>>();

export class RestrictedSigner {
  readonly #options: RestrictedSignerOptions;
  constructor(options: RestrictedSignerOptions) {
    if (!options.contractId.endsWith(".testnet") || options.allowedMethods.length === 0) throw new Error("Invalid restricted signer configuration");
    this.#options = options;
  }

  async call(input: RestrictedCall): Promise<{ readonly operationId: string; readonly transactionHash: string | null; readonly status: "success" | "failure" | "unknown" }> {
    if (!this.#options.allowedMethods.includes(input.methodName)) throw new Error("ERR_AGENT_METHOD");
    const depositYocto = input.depositYocto ?? 0n;
    if (depositYocto !== 0n) throw new Error("ERR_AGENT_DEPOSIT");
    const previous = queues.get(this.#options.keyId) ?? Promise.resolve();
    let releaseQueue: () => void = () => undefined;
    const current = new Promise<void>((resolve) => { releaseQueue = resolve; });
    const queued = previous.then(() => current);
    queues.set(this.#options.keyId, queued);
    await previous;
    try {
      const existing = getChainOperation(this.#options.database, input.operationId);
      if (existing) {
        if (existing.logicalKey !== input.logicalKey || existing.releaseId !== input.releaseId || existing.operationType !== input.methodName || existing.intentJson !== JSON.stringify(input.args)) throw new Error("ERR_OPERATION_ID_REUSE");
        return { operationId: input.operationId, transactionHash: existing.transactionHash, status: existing.status === "success" ? "success" : existing.status === "failure" ? "failure" : "unknown" };
      }
      createChainOperation(this.#options.database, { id: input.operationId, logicalKey: input.logicalKey, releaseId: input.releaseId, operationType: input.methodName, intentJson: JSON.stringify(input.args) });
      const signer = this.#options.account.getSigner();
      if (!signer) throw new Error("ERR_AGENT_SIGNER");
      const signed = await this.#options.account.createSignedTransaction({ receiverId: this.#options.contractId, actions: [actions.functionCall(input.methodName, input.args, 100_000_000_000_000n, depositYocto)], signer });
      const transactionHash = baseEncode(createHash("sha256").update(signed.transaction.encode()).digest());
      updateChainOperation(this.#options.database, input.operationId, { status: "signed", signedIdentity: Buffer.from(signed.encode()).toString("base64"), transactionHash });
      const response = await this.#options.account.provider.sendTransactionUntil(signed, "FINAL");
      const failed = typeof response.status === "object" && response.status !== null && "Failure" in response.status;
      const transfer = input.methodName === "execute_payout" || input.methodName === "withdraw_refundable";
      updateChainOperation(this.#options.database, input.operationId, { status: transfer ? "reconciling" : failed ? "failure" : "success", transactionHash });
      return { operationId: input.operationId, transactionHash, status: transfer ? "unknown" : failed ? "failure" : "success" };
    } catch (error) {
      updateChainOperation(this.#options.database, input.operationId, { status: "unknown", lastError: error instanceof Error ? error.message.slice(0, 256) : "ERR_RPC_UNKNOWN" });
      return { operationId: input.operationId, transactionHash: getChainOperation(this.#options.database, input.operationId)?.transactionHash ?? null, status: "unknown" };
    } finally {
      releaseQueue();
      if (queues.get(this.#options.keyId) === queued) queues.delete(this.#options.keyId);
    }
  }
}
