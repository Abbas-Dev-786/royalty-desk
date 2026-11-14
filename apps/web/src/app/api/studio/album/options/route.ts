import { guestAccountId } from "@/server/studio-guest";
import { openStudioCatalogueDatabase, studioContractClient } from "@/server/studio-catalogue";

export async function GET(): Promise<Response> {
  const headers = { "cache-control": "private, no-store" };
  try {
    const accountId = await guestAccountId();
    const database = openStudioCatalogueDatabase();
    try {
      const studio = database.prepare("SELECT id FROM studios WHERE admin_account_id = ? LIMIT 1").get(studioContractClient().contractId) as { id: string } | undefined;
      if (!studio) throw new Error("ERR_GUEST_STUDIO_UNAVAILABLE");
      const agents = database.prepare("SELECT id, role, account_id FROM studio_agents WHERE studio_id = ? AND role IN ('lyricist','composer','reviewer') AND active = 1 AND revoked_at_ms IS NULL AND (expires_at_ms IS NULL OR expires_at_ms > ?) ORDER BY role, id").all(studio.id, Date.now()) as { id: string; role: string; account_id: string }[];
      return Response.json({ accountId, agents: agents.map((agent) => ({ id: agent.id, role: agent.role, accountId: agent.account_id })) }, { headers });
    } finally { database.close(); }
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERR_ALBUM_OPTIONS";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : 503, headers });
  }
}
