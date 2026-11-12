import { createServer, type IncomingMessage, type Server } from "node:http";
import type { WorkerConfig } from "./config.ts";
import type { AgentSessionRequest, WorkerAgentService } from "./agents/service.ts";
import type { AgentMode, PersonalAgentContext } from "./agents/types.ts";
import type { StudioCreativeRequest, StudioCreativeService } from "./studio/creative-service.ts";

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.byteLength;
    if (size > 1_048_576) throw new Error("ERR_REQUEST_TOO_LARGE");
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createWorkerHealthServer(config: WorkerConfig, agentService?: WorkerAgentService, studioService?: StudioCreativeService): Server {
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
    if (studioService && request.url?.startsWith("/studio/")) {
      void (async () => {
        if (!config.workerApiToken || request.headers.authorization !== `Bearer ${config.workerApiToken}`) { response.writeHead(401, { "content-type": "application/json" }); response.end(JSON.stringify({ error: "ERR_WORKER_AUTH" })); return; }
        try {
          if (request.method === "POST" && request.url === "/studio/sessions") {
            const body = await readJson(request) as StudioCreativeRequest;
            const sessionId = studioService.create(body);
            response.writeHead(201, { "content-type": "application/json" }); response.end(JSON.stringify({ sessionId })); return;
          }
          const match = /^\/studio\/sessions\/([a-f0-9]{64})\/run$/.exec(request.url ?? "");
          if (request.method === "POST" && match) {
            const body = await readJson(request) as StudioCreativeRequest;
            const result = await studioService.run(match[1]!, body);
            response.writeHead(200, { "content-type": "application/json" }); response.end(JSON.stringify(result)); return;
          }
          response.writeHead(404, { "content-type": "application/json" }); response.end(JSON.stringify({ error: "not_found" }));
        } catch (error) { response.writeHead(400, { "content-type": "application/json" }); response.end(JSON.stringify({ error: error instanceof Error ? error.message : "studio_request_failed" })); }
      })();
      return;
    }
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
  });
}
