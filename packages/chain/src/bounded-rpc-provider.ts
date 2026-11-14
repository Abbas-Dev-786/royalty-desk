import { JsonRpcProvider } from "near-api-js";
import { rpcRateLimitDelayMs } from "./rpc-rate-limit.ts";

type RpcMethod = Parameters<JsonRpcProvider["sendJsonRpc"]>[0];

/** Bound the SDK wait. A timed-out submission remains uncertain and must be reconciled. */
export class BoundedRpcProvider extends JsonRpcProvider {
  readonly timeoutMs: number;
  readonly deadlineAtMs: number | undefined;
  constructor(url: string, timeoutMs = 20_000, deadlineAtMs?: number) {
    super({ url }, { retries: 1 });
    this.timeoutMs = timeoutMs;
    this.deadlineAtMs = deadlineAtMs;
  }

  override async sendJsonRpc<Method extends RpcMethod, Params = unknown, Result = unknown>(method: Method, params: Params): Promise<Result> {
    const remainingMs = this.deadlineAtMs === undefined ? this.timeoutMs : Math.min(this.timeoutMs, this.deadlineAtMs - Date.now());
    if (remainingMs <= 0) throw new Error("ERR_NEAR_RPC_TIMEOUT");
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        super.sendJsonRpc<Method, Params, Result>(method, params),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("ERR_NEAR_RPC_TIMEOUT")), remainingMs); })
      ]);
    } catch (error) {
      // Page reads must not sleep through a provider cooldown beyond their total request budget.
      if (this.deadlineAtMs !== undefined && rpcRateLimitDelayMs(error) !== null) throw new Error("ERR_NEAR_RPC_UNAVAILABLE", { cause: error });
      throw error;
    } finally { if (timer) clearTimeout(timer); }
  }
}
