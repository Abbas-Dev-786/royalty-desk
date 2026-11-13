import { createHash, randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { basename, resolve } from "node:path";
import { backup } from "node:sqlite";
import { createStudioProject, openDatabase } from "@studio/persistence";

const argument = (name) => process.argv.find((value) => value.startsWith(`${name}=`))?.slice(name.length + 1);
const accountId = argument("--account-id");
const expectedProjectId = argument("--expected-project-id");
const execute = process.argv.includes("--execute");
const riskAccepted = process.argv.includes("--acknowledge-possible-duplicate-ai-charge");
if (!accountId || !/^[a-z0-9._-]+\.testnet$/.test(accountId)) throw new Error("Pass --account-id=<testnet account>");
if (execute && (!expectedProjectId || !riskAccepted)) throw new Error("Recovery requires --expected-project-id and --acknowledge-possible-duplicate-ai-charge");

const databasePath = resolve(process.env.STUDIO_CATALOGUE_DB_PATH ?? "private/studio-v2/phase05/studio.sqlite");
if (!existsSync(databasePath)) throw new Error("Studio database is missing");
const database = openDatabase(databasePath);
try {
  const guest = expectedProjectId
    ? database.prepare("SELECT account_id,studio_id,project_id,title,brief,session_id,work_id FROM studio_guest_songs WHERE account_id = ? AND project_id = ?").get(accountId, expectedProjectId)
    : database.prepare("SELECT account_id,studio_id,project_id,title,brief,session_id,work_id FROM studio_guest_songs WHERE account_id = ? ORDER BY created_at_ms DESC, project_id DESC LIMIT 1").get(accountId);
  if (!guest) throw new Error("Guest reservation is missing");
  const job = guest.session_id ? database.prepare("SELECT state,attempts,error_code FROM jobs WHERE id = ?").get(guest.session_id) : null;
  const operations = database.prepare("SELECT status,provider_request_id FROM studio_external_operations WHERE operation_type = 'near_ai_creative' AND logical_key LIKE ?").all(`creative:${guest.project_id}:%`);
  const outputs = database.prepare("SELECT COUNT(*) AS n FROM studio_model_outputs WHERE project_id = ?").get(guest.project_id).n;
  const audio = database.prepare("SELECT COUNT(*) AS n FROM studio_audio_generations WHERE project_id = ?").get(guest.project_id).n;
  const summary = { accountId, projectId: guest.project_id, sessionId: guest.session_id, jobState: job?.state ?? null, attempts: job?.attempts ?? 0, savedModelOutputs: outputs, audioGenerations: audio, operationStatuses: operations.map((operation) => operation.status), operationResponseIdsRecorded: operations.filter((operation) => operation.provider_request_id).length, workId: guest.work_id };
  if (!execute) {
    console.log(JSON.stringify({ status: "inspection_only", ...summary }));
  } else {
  if (guest.project_id !== expectedProjectId) throw new Error("Expected project ID changed; inspect again");
  if (guest.work_id || job?.state !== "failed" || outputs !== 0 || audio !== 0 || operations.length === 0 || operations.some((operation) => operation.status === "finalized" || (operation.provider_request_id && operation.status !== "failed"))) throw new Error("This reservation cannot be reset safely by the guest recovery tool");
  const recoveryRoot = resolve(process.env.STUDIO_GUEST_RECOVERY_DIR ?? "private/studio-v2/recovery");
  mkdirSync(recoveryRoot, { recursive: true });
  const backupPath = resolve(recoveryRoot, `guest-${Date.now()}-${randomUUID()}.sqlite`);
  await backup(database, backupPath);
  const newProjectId = `project-guest-${randomUUID()}`;
  database.exec("BEGIN IMMEDIATE");
  try {
    const current = database.prepare("SELECT project_id,work_id FROM studio_guest_songs WHERE account_id = ? AND project_id = ?").get(accountId, expectedProjectId);
    if (current?.project_id !== expectedProjectId || current.work_id) throw new Error("Guest reservation changed during recovery");
    createStudioProject(database, { id: newProjectId, studioId: guest.studio_id, title: guest.title });
    database.prepare("UPDATE studio_projects SET status = 'cancelled' WHERE id = ?").run(expectedProjectId);
    database.prepare("UPDATE studio_guest_songs SET project_id = ?, session_id = NULL, work_id = NULL, deadline_at_ms = ? WHERE account_id = ? AND project_id = ?").run(newProjectId, Date.now() + 600_000, accountId, expectedProjectId);
    const logicalKey = `guest-recovery:${accountId}:${expectedProjectId}`;
    database.prepare("INSERT INTO studio_external_operations(id,logical_key,operation_type,status,result_hash,created_at_ms,updated_at_ms) VALUES (?,?, 'guest_recovery','finalized',?,?,?)").run(createHash("sha256").update(logicalKey).digest("hex"), logicalKey, createHash("sha256").update(newProjectId).digest("hex"), Date.now(), Date.now());
    database.exec("COMMIT");
  } catch (error) { database.exec("ROLLBACK"); throw error; }
  console.log(JSON.stringify({ status: "reset_for_explicit_retry", previousProjectId: expectedProjectId, newProjectId, backup: basename(backupPath), possibleDuplicateAiCharge: true }));
  }
} finally { database.close(); }
