import { BoundedRpcProvider } from "./bounded-rpc-provider.ts";
import { rpcRateLimitDelayMs } from "./rpc-rate-limit.ts";

type RpcMethod = Parameters<BoundedRpcProvider["sendJsonRpc"]>[0];

export function isRpcUnavailable(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /ERR_NEAR_RPC_/.test(error.message)
    || rpcRateLimitDelayMs(error) !== null
    || (typeof error.cause === "number" && [408, 500, 502, 503, 504].includes(error.cause))
    || (error instanceof TypeError && /fetch failed|failed to fetch/i.test(error.message))
    || error.name === "TimeoutError";
}

/** Retry public reads across same-network endpoints within one shared deadline. */
export class ReadFallbackRpcProvider extends BoundedRpcProvider {
  private readonly providers: readonly BoundedRpcProvider[];
  private preferredIndex = 0;

  constructor(urls: readonly [string, ...string[]], timeoutMs = 2_500, deadlineAtMs = Date.now() + 8_000) {
    super(urls[0], timeoutMs, deadlineAtMs);
    this.providers = [...new Set(urls)].map((url) => new BoundedRpcProvider(url, timeoutMs, deadlineAtMs));
  }

  override async sendJsonRpc<Method extends RpcMethod, Params = unknown, Result = unknown>(method: Method, params: Params): Promise<Result> {
    // Submission must retain its original retry/reconciliation semantics.
    if (method !== "query" && method !== "status") return super.sendJsonRpc<Method, Params, Result>(method, params);
    let lastError: unknown;
    for (let attempt = 0; attempt < this.providers.length; attempt += 1) {
      if (Date.now() >= this.deadlineAtMs!) throw new Error("ERR_NEAR_RPC_TIMEOUT", { cause: lastError });
      const index = (this.preferredIndex + attempt) % this.providers.length;
      try {
        const result = await this.providers[index]!.sendJsonRpc<Method, Params, Result>(method, params);
        this.preferredIndex = index;
        return result;
      } catch (error) {
        if (!isRpcUnavailable(error)) throw error;
        lastError = error;
      }
    }
    throw new Error("ERR_NEAR_RPC_UNAVAILABLE", { cause: lastError });
  }
}
