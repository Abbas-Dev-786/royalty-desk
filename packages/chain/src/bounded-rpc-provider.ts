import { JsonRpcProvider } from "near-api-js";

type RpcMethod = Parameters<JsonRpcProvider["sendJsonRpc"]>[0];

/** Bound the SDK wait. A timed-out submission remains uncertain and must be reconciled. */
export class BoundedRpcProvider extends JsonRpcProvider {
  readonly timeoutMs: number;
  constructor(url: string, timeoutMs = 20_000) {
    super({ url }, { retries: 1 });
    this.timeoutMs = timeoutMs;
  }

  override async sendJsonRpc<Method extends RpcMethod, Params = unknown, Result = unknown>(method: Method, params: Params): Promise<Result> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        super.sendJsonRpc<Method, Params, Result>(method, params),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("ERR_NEAR_RPC_TIMEOUT")), this.timeoutMs); })
      ]);
    } finally { if (timer) clearTimeout(timer); }
  }
}
