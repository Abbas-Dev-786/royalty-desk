export async function responseWithDeadline(response: Promise<Response>, timeoutMs = 15_000): Promise<Response> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([response, new Promise<Response>((resolve) => {
      timer = setTimeout(() => resolve(Response.json({ error: "ERR_NEAR_RPC_TIMEOUT" }, { status: 503, headers: { "cache-control": "private, no-store", "retry-after": "10" } })), timeoutMs);
    })]);
  } finally { if (timer) clearTimeout(timer); }
}
