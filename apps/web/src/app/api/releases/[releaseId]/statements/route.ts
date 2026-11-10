import { EncryptedFileStore, importStatement } from "@royaltydesk/persistence";
import { resolve } from "node:path";
import { requireMembership } from "@/server/authorization";
import { getAppDatabase, requireOrigin } from "@/server/runtime";

function store(): EncryptedFileStore {
  const secret = process.env.ROYALTYDESK_STORAGE_SECRET ?? process.env.ROYALTYDESK_ENCRYPTION_KEY;
  if (!secret) throw new Error("ERR_STORAGE_CONFIG");
  return new EncryptedFileStore(resolve(/* turbopackIgnore: true */ process.cwd(), "../..", process.env.ROYALTYDESK_FILES_PATH ?? process.env.ROYALTYDESK_PRIVATE_FILES_PATH ?? ".royaltydesk/private"), secret);
}

export async function POST(request: Request, context: { params: Promise<{ releaseId: string }> }): Promise<Response> {
  try {
    requireOrigin(request);
    const { releaseId } = await context.params;
    const { accountId } = await requireMembership(releaseId, ["administrator"]);
    const contentLength = Number(request.headers.get("content-length") ?? "0");
    if (contentLength > 1_048_576) return Response.json({ error: "ERR_CSV_SIZE" }, { status: 413 });
    const bytes = new Uint8Array(await request.arrayBuffer());
    const contentType = request.headers.get("content-type") ?? "text/csv";
    if (!contentType.includes("csv") && !contentType.includes("text/plain")) return Response.json({ error: "ERR_CONTENT_TYPE" }, { status: 415 });
    const database = getAppDatabase();
    const result = importStatement(database, { releaseId, csv: bytes, importedBy: accountId, persistOriginal: (storageKey, original) => store().put(storageKey, original) });
    database.prepare(`INSERT OR IGNORE INTO documents(id, release_id, owner_account_id, storage_key, content_hash, content_type, size_bytes, created_at_ms) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(`statement-${result.storageKey}`, releaseId, accountId, result.storageKey, result.rawHash, "text/csv", bytes.byteLength, Date.now());
    return Response.json({ releaseId, period: result.period, revision: result.revision, rawHash: result.rawHash, normalizedHash: result.normalizedHash, grossYocto: result.grossYocto, unsupportedClaimLineIds: result.unsupportedClaimLineIds, payable: result.payable }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "statement_import_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : message === "ERR_FORBIDDEN" ? 403 : 400 });
  }
}

export async function GET(request: Request, context: { params: Promise<{ releaseId: string }> }): Promise<Response> {
  try {
    const { releaseId } = await context.params;
    await requireMembership(releaseId, ["administrator", "owner"]);
    const period = new URL(request.url).searchParams.get("period");
    const rows = getAppDatabase().prepare(`SELECT period, revision, statement_id, recording_id, raw_hash, normalized_hash, gross_yocto, validation_json, imported_by, created_at_ms FROM statement_imports WHERE release_id = ? AND (? IS NULL OR period = ?) ORDER BY period, CAST(revision AS INTEGER)`).all(releaseId, period, period) as readonly Record<string, unknown>[];
    return Response.json(rows.map((row) => ({ period: row.period, revision: row.revision, statementId: row.statement_id, recordingId: row.recording_id, rawHash: row.raw_hash, normalizedHash: row.normalized_hash, grossYocto: row.gross_yocto, validation: row.validation_json, importedBy: row.imported_by, createdAtMs: row.created_at_ms })));
  } catch (error) {
    const message = error instanceof Error ? error.message : "statement_read_failed";
    return Response.json({ error: message }, { status: message === "ERR_UNAUTHORIZED" ? 401 : 403 });
  }
}
