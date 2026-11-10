import { randomBytes } from "node:crypto";
import { EncryptedFileStore } from "@royaltydesk/persistence";
import { requireMembership } from "@/server/authorization";
import { getAppDatabase, requireOrigin } from "@/server/runtime";

function store(): EncryptedFileStore {
  const secret = process.env.ROYALTYDESK_STORAGE_SECRET ?? process.env.ROYALTYDESK_ENCRYPTION_KEY;
  if (!secret) throw new Error("ERR_STORAGE_CONFIG");
  return new EncryptedFileStore(process.env.ROYALTYDESK_FILES_PATH ?? process.env.ROYALTYDESK_PRIVATE_FILES_PATH ?? ".royaltydesk/private", secret);
}

export async function GET(_: Request, context: { params: Promise<{ releaseId: string }> }): Promise<Response> {
  try {
    const { releaseId } = await context.params;
    const { accountId } = await requireMembership(releaseId, ["owner"]);
    const row = getAppDatabase().prepare(`SELECT agent_account_id, key_reference FROM agent_profiles WHERE release_id = ? AND owner_account_id = ?`).get(releaseId, accountId) as { agent_account_id?: unknown; key_reference?: unknown } | undefined;
    if (!row) return Response.json({ releaseId, ownerAccountId: accountId, agentAccountId: null, instructions: null });
    const instructions = typeof row.key_reference === "string" ? new TextDecoder().decode(store().get(row.key_reference)) : null;
    return Response.json({ releaseId, ownerAccountId: accountId, agentAccountId: typeof row.agent_account_id === "string" ? row.agent_account_id : null, instructions });
  } catch (error) {
    const message = error instanceof Error ? error.message : "agent_profile_read_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : 403 });
  }
}

export async function PUT(request: Request, context: { params: Promise<{ releaseId: string }> }): Promise<Response> {
  try {
    requireOrigin(request);
    const { releaseId } = await context.params;
    const { accountId } = await requireMembership(releaseId, ["owner"]);
    const body = await request.json() as { agentAccountId?: unknown; instructions?: unknown };
    if ((body.agentAccountId !== undefined && (typeof body.agentAccountId !== "string" || !/^[a-z0-9][a-z0-9._-]{1,63}$/.test(body.agentAccountId))) || (body.instructions !== undefined && typeof body.instructions !== "string")) return Response.json({ error: "ERR_INPUT" }, { status: 400 });
    const instructions = body.instructions ?? "";
    if (instructions.length > 16_384) return Response.json({ error: "ERR_INSTRUCTIONS_SIZE" }, { status: 413 });
    const key = randomBytes(24).toString("hex");
    store().put(key, new TextEncoder().encode(instructions));
    getAppDatabase().prepare(`INSERT INTO agent_profiles(release_id, owner_account_id, agent_account_id, key_reference, updated_at_ms) VALUES (?, ?, ?, ?, ?) ON CONFLICT(release_id, owner_account_id) DO UPDATE SET agent_account_id = excluded.agent_account_id, key_reference = excluded.key_reference, updated_at_ms = excluded.updated_at_ms`).run(releaseId, accountId, body.agentAccountId ?? null, key, Date.now());
    return Response.json({ releaseId, ownerAccountId: accountId, agentAccountId: body.agentAccountId ?? null, updated: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "agent_profile_write_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 400 });
  }
}
