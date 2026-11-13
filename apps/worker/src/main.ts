import { readWorkerConfig } from "./config.ts";
import { createWorkerHealthServer } from "./health-server.ts";
import { openDatabase } from "@studio/persistence";
import { reconcileSignedOperations } from "./reconciliation/signed-operations.ts";
import { createCreativeNearAiModel } from "./studio/creative-model.ts";
import { StudioCreativeService } from "./studio/creative-service.ts";
import { StudioSongProductionService } from "./studio/song-production.ts";
import { StudioReleaseAgentService } from "./studio/release-agents.ts";
import { StudioRevenueAgentService } from "./studio/revenue-agents.ts";

const config = readWorkerConfig();
const database = openDatabase(config.databasePath);
const studioService = config.nearAiApiKey && config.nearAiModel ? new StudioCreativeService(config.studioDatabasePath, `${config.studioDatabasePath}.studio-graph.sqlite`, createCreativeNearAiModel({ baseUrl: config.nearAiBaseUrl, apiKey: config.nearAiApiKey, model: config.nearAiModel })) : undefined;
const songService = StudioSongProductionService.fromEnvironment(config.studioDatabasePath);
const releaseService = StudioReleaseAgentService.fromEnvironment(config.studioDatabasePath);
const revenueService = StudioRevenueAgentService.fromEnvironment(config.databasePath, config.studioDatabasePath);
const server = createWorkerHealthServer(config, studioService, songService ?? undefined, releaseService ?? undefined);
let reconciling = false;
async function reconcile(): Promise<void> {
  if (reconciling) return;
  reconciling = true;
  try { await reconcileSignedOperations(database, process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com"); }
  catch (error) { console.error("Chain reconciliation failed", error instanceof Error ? error.message : String(error)); }
  finally { reconciling = false; }
}
const reconciliationTimer = setInterval(() => { void reconcile(); }, 15_000);
void reconcile();
let revenueRunning = false;
async function processStudioRevenue(): Promise<void> {
  if (!revenueService || revenueRunning) return;
  revenueRunning = true;
  try {
    const result = await revenueService.runOnce();
    if (result.errors.length) console.error("Studio revenue requires reconciliation", result.errors);
  } catch (error) { console.error("Studio revenue agent failed", error instanceof Error ? error.message : String(error)); }
  finally { revenueRunning = false; }
}
const revenueTimer = setInterval(() => { void processStudioRevenue(); }, 30_000);
void processStudioRevenue();
let releaseRunning = false;
const blockedGuestReleases = new Set<string>();
async function processPendingGuestReleases(): Promise<void> {
  if (!releaseService || releaseRunning) return;
  releaseRunning = true;
  const studioDatabase = openDatabase(config.studioDatabasePath);
  try {
    const pending = studioDatabase.prepare("SELECT g.work_id, v.version FROM studio_guest_songs g JOIN studio_works w ON w.id = g.work_id JOIN studio_work_versions v ON v.work_id = w.id AND v.version = w.current_version WHERE g.work_id IS NOT NULL AND v.state = 'accepted' AND NOT EXISTS (SELECT 1 FROM studio_publications p WHERE p.work_id = v.work_id AND p.work_version = v.version AND p.unpublished_at_ms IS NULL) ORDER BY v.created_at_ms LIMIT 20").all() as { work_id: string; version: number }[];
    for (const item of pending) {
      const releaseKey = `${item.work_id}:${item.version}`;
      if (blockedGuestReleases.has(releaseKey)) continue;
      try { await releaseService.commit(item.work_id, item.version); await releaseService.accept(item.work_id, item.version); }
      catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message === "ERR_RELEASE_POLICY_STALE" || message === "ERR_RELEASE_CHAIN_MISMATCH") blockedGuestReleases.add(releaseKey);
        console.error("Guest release requires reconciliation", item.work_id, message);
      }
    }
  } catch (error) { console.error("Guest release scan failed", error instanceof Error ? error.message : String(error)); }
  finally { studioDatabase.close(); releaseRunning = false; }
}
const releaseTimer = setInterval(() => { void processPendingGuestReleases(); }, 30_000);
void processPendingGuestReleases();

server.listen(config.port, config.host, () => {
  console.log(`Studio worker listening on http://${config.host}:${config.port}`);
});

function shutdown(signal: string): void {
  clearInterval(reconciliationTimer);
  clearInterval(revenueTimer);
  clearInterval(releaseTimer);
  console.log(`Received ${signal}; closing worker health server`);
  server.close((error) => {
    studioService?.close();
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
