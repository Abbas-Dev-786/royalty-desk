import { readWorkerConfig } from "./config.ts";
import { createWorkerHealthServer } from "./health-server.ts";

const config = readWorkerConfig();
const server = createWorkerHealthServer(config);

server.listen(config.port, config.host, () => {
  console.log(`RoyaltyDesk worker listening on http://${config.host}:${config.port}`);
});

function shutdown(signal: string): void {
  console.log(`Received ${signal}; closing worker health server`);
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
