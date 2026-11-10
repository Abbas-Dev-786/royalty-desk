import { createServer, type IncomingMessage, type Server } from "node:http";
import type { WorkerConfig } from "./config.ts";
import type { AgentSessionRequest, WorkerAgentService } from "./agents/service.ts";
import type { AgentMode, PersonalAgentContext } from "./agents/types.ts";

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createWorkerHealthServer(config: WorkerConfig, agentService?: WorkerAgentService): Server {
  return createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok", networkId: config.networkId }));
      return;
    }
    if (agentService && request.url?.startsWith("/agents/")) {
      void (async () => {
        if (config.workerApiToken && request.headers.authorization !== `Bearer ${config.workerApiToken}`) { response.writeHead(401, { "content-type": "application/json" }); response.end(JSON.stringify({ error: "ERR_WORKER_AUTH" })); return; }
        try {
          if (request.method === "POST" && request.url === "/agents/sessions") {
            const body = await readJson(request) as AgentSessionRequest;
            const result = agentService.createSession(body);
            response.writeHead(201, { "content-type": "application/json" }); response.end(JSON.stringify(result)); return;
          }
          const match = /^\/agents\/sessions\/([^/]+)\/run$/.exec(request.url ?? "");
          if (request.method === "POST" && match) {
            const body = await readJson(request) as { context: PersonalAgentContext; mode: AgentMode };
            const result = await agentService.run(match[1]!, body.context, body.mode);
            response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(result)); return;
          }
          response.writeHead(404, { "content-type": "application/json" }); response.end(JSON.stringify({ error: "not_found" }));
        } catch (error) { response.writeHead(400, { "content-type": "application/json" }); response.end(JSON.stringify({ error: error instanceof Error ? error.message : "agent_request_failed" })); }
      })();
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  });
}
