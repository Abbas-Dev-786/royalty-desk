import type { SignedTransaction } from "near-api-js";

export function rpcRateLimitDelayMs(error: unknown): number | null {
  const detail = error instanceof Error ? error.message : "";
  const cause = error instanceof Error && "cause" in error ? error.cause : undefined;
  if (cause !== 429 && !/(?:\b429\b|rate.?limit)/i.test(detail)) return null;
  const seconds = /retry after\s+(\d+)\s*seconds?/i.exec(detail);
  return seconds ? Math.min(Number(seconds[1]) + 1, 60) * 1000 : 5_000;
}

/** Retry read-only RPC calls after an upstream HTTP 429 cooldown. */
export async function retryRpcRead<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try { return await read(); }
    catch (error) {
      const delayMs = rpcRateLimitDelayMs(error);
      if (attempt >= 1 || delayMs === null) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
}

/** A retry may rebroadcast only the identical signed bytes and transaction hash. */
export async function retrySignedTransactionAfterRateLimit<T>(signed: SignedTransaction, send: (transaction: SignedTransaction) => Promise<T>): Promise<T> {
  try { return await send(signed); }
  catch (error) {
    const delayMs = rpcRateLimitDelayMs(error);
    if (delayMs === null) throw error;
    await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    return send(signed);
  }
}
