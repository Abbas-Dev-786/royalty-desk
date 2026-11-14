export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  try {
    const response = await fetch(`${process.env.STUDIO_WORKER_URL ?? "http://127.0.0.1:3101"}/health`, { signal: AbortSignal.timeout(2_000), cache: "no-store" });
    if (!response.ok) throw new Error("Worker unavailable");
    return Response.json({ status: "ok" }, { headers: { "cache-control": "no-store" } });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
