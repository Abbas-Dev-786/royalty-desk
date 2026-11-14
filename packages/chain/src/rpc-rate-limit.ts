/** Retry read-only RPC calls after an upstream HTTP 429 cooldown. */
export async function retryRpcRead<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try { return await read(); }
    catch (error) {
      const detail = error instanceof Error ? error.message : "";
      const cause = error instanceof Error && "cause" in error ? error.cause : undefined;
      if (attempt >= 1 || cause !== 429 && !/(?:\b429\b|rate.?limit)/i.test(detail)) throw error;
      const seconds = /retry after\s+(\d+)\s*seconds?/i.exec(detail);
      const delayMs = seconds ? Math.min(Number(seconds[1]) + 1, 60) * 1000 : 5_000 * (attempt + 1);
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
