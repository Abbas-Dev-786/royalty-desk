import { readWorkerConfig } from "./config.ts";
import { createWorkerHealthServer } from "./health-server.ts";
import { openDatabase } from "@royaltydesk/persistence";
import { WorkerAgentService } from "./agents/service.ts";

const config = readWorkerConfig();
const database = openDatabase(config.databasePath);
const agentService = new WorkerAgentService(database, config);
const server = createWorkerHealthServer(config, agentService);

server.listen(config.port, config.host, () => {
  console.log(`RoyaltyDesk worker listening on http://${config.host}:${config.port}`);
});

function shutdown(signal: string): void {
  console.log(`Received ${signal}; closing worker health server`);
  server.close((error) => {
    agentService.close();
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
