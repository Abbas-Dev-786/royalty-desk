import { catalogueSnapshot } from "@/server/studio-catalogue";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
    if (query.length > 80) return Response.json({ error: "ERR_QUERY_TOO_LONG" }, { status: 400 });
    return Response.json(await catalogueSnapshot(query), { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "CATALOGUE_UNAVAILABLE" }, { status: 503 });
  }
}
