import { requireMembership } from "@/server/authorization";
import { buildAuthorizedAgentContext } from "@/server/agent-context";
import { getAppDatabase, requireOrigin } from "@/server/runtime";

export async function POST(request: Request, context: { params: Promise<{ releaseId: string }> }): Promise<Response> {
  try {
    requireOrigin(request);
    const { releaseId } = await context.params;
    const { accountId } = await requireMembership(releaseId, ["owner"]);
    const body = await request.json() as { mode?: unknown; period?: unknown };
    const mode = body.mode === "live" || body.mode === "fixture" ? body.mode : "fixture";
    const period = typeof body.period === "string" ? body.period : null;
    const agentContext = await buildAuthorizedAgentContext(getAppDatabase(), releaseId, accountId, period);
    const workerUrl = process.env.ROYALTYDESK_WORKER_URL ?? "http://127.0.0.1:3101";
    const headers = { "content-type": "application/json", ...(process.env.ROYALTYDESK_WORKER_TOKEN ? { authorization: `Bearer ${process.env.ROYALTYDESK_WORKER_TOKEN}` } : {}) };
    const createResponse = await fetch(`${workerUrl}/agents/sessions`, { method: "POST", headers, body: JSON.stringify({ releaseId, ownerAccountId: accountId, mode, context: agentContext }) });
    const created = await createResponse.json() as { sessionId?: string; error?: string };
    if (!createResponse.ok || !created.sessionId) return Response.json({ error: created.error ?? "ERR_AGENT_SESSION" }, { status: 502 });
    const runResponse = await fetch(`${workerUrl}/agents/sessions/${encodeURIComponent(created.sessionId)}/run`, { method: "POST", headers, body: JSON.stringify({ mode, context: agentContext }) });
    const result = await runResponse.json() as Record<string, unknown>;
    return Response.json({ ...result, sessionId: created.sessionId }, { status: runResponse.ok ? 200 : 502 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "agent_run_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 400 });
  }
}
