import { readWorkerConfig } from "./config.ts";
import { createWorkerHealthServer } from "./health-server.ts";
import { openDatabase } from "@royaltydesk/persistence";
import { WorkerAgentService } from "./agents/service.ts";
import { reconcileSignedOperations } from "./reconciliation/signed-operations.ts";
import { createCreativeNearAiModel } from "./studio/creative-model.ts";
import { StudioCreativeService } from "./studio/creative-service.ts";
import { StudioSongProductionService } from "./studio/song-production.ts";
import { StudioReleaseAgentService } from "./studio/release-agents.ts";

const config = readWorkerConfig();
const database = openDatabase(config.databasePath);
const agentService = new WorkerAgentService(database, config);
const studioService = config.nearAiApiKey && config.nearAiModel ? new StudioCreativeService(config.studioDatabasePath, `${config.studioDatabasePath}.studio-graph.sqlite`, createCreativeNearAiModel({ baseUrl: config.nearAiBaseUrl, apiKey: config.nearAiApiKey, model: config.nearAiModel })) : undefined;
const songService = StudioSongProductionService.fromEnvironment(config.studioDatabasePath);
const releaseService = StudioReleaseAgentService.fromEnvironment(config.studioDatabasePath);
const server = createWorkerHealthServer(config, agentService, studioService, songService ?? undefined, releaseService ?? undefined);
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

server.listen(config.port, config.host, () => {
  console.log(`RoyaltyDesk worker listening on http://${config.host}:${config.port}`);
});

function shutdown(signal: string): void {
  clearInterval(reconciliationTimer);
  console.log(`Received ${signal}; closing worker health server`);
  server.close((error) => {
    agentService.close();
    studioService?.close();
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
