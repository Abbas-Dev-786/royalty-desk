import { parseAgentAction } from "@royaltydesk/domain";
import { requireMembership } from "@/server/authorization";
import { getAppDatabase } from "@/server/runtime";

export async function GET(_: Request, context: { params: Promise<{ releaseId: string }> }): Promise<Response> {
  try {
    const { releaseId } = await context.params;
    await requireMembership(releaseId, ["owner", "administrator"]);
    const rows = getAppDatabase().prepare("SELECT p.id, p.parent_id, p.owner_account_id, p.action_json, p.created_at_ms FROM agent_proposals p JOIN agent_sessions s ON s.id = p.session_id WHERE s.release_id = ? AND p.status = 'validated' ORDER BY p.created_at_ms DESC LIMIT 20").all(releaseId) as unknown as readonly { id: string; parent_id: string | null; owner_account_id: string; action_json: string; created_at_ms: number }[];
    const proposals = rows.flatMap((row) => {
      try {
        const action = parseAgentAction(JSON.parse(row.action_json) as unknown);
        return action.type === "propose_terms" || action.type === "counter_terms" ? [{ id: row.id, parentId: row.parent_id, ownerAccountId: row.owner_account_id, action, createdAtMs: row.created_at_ms }] : [];
      } catch { return []; }
    }).reverse();
    return Response.json(proposals);
  } catch (error) {
    const message = error instanceof Error ? error.message : "proposal_read_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 400 });
  }
}
