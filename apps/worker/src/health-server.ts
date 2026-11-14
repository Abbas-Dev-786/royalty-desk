import { createServer, type IncomingMessage, type Server } from "node:http";
import type { WorkerConfig } from "./config.ts";
import type { StudioCreativeRequest, StudioCreativeService } from "./studio/creative-service.ts";
import type { SongProductionRequest, StudioSongProductionService } from "./studio/song-production.ts";
import type { StudioReleaseAgentService } from "./studio/release-agents.ts";
import { ReleaseTasks } from "./studio/release-tasks.ts";

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

export function createWorkerHealthServer(config: WorkerConfig, studioService?: StudioCreativeService, songService?: StudioSongProductionService, releaseService?: StudioReleaseAgentService): Server {
  const releases = new ReleaseTasks<Awaited<ReturnType<StudioReleaseAgentService["finalize"]>>>();
  return createServer((request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok", networkId: config.networkId }));
      return;
    }
    if ((studioService || songService || releaseService) && request.url?.startsWith("/studio/")) {
      void (async () => {
        if (!config.workerApiToken || request.headers.authorization !== `Bearer ${config.workerApiToken}`) { response.writeHead(401, { "content-type": "application/json" }); response.end(JSON.stringify({ error: "ERR_WORKER_AUTH" })); return; }
        try {
          const acceptance = /^\/studio\/releases\/([a-z0-9][a-z0-9._-]{0,63})\/accept$/.exec(request.url ?? "");
          if (request.method === "POST" && acceptance && releaseService) {
            const body = await readJson(request) as { version?: number };
            const result = await releaseService.accept(acceptance[1]!, body.version ?? 0);
            response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); response.end(JSON.stringify(result)); return;
          }
          const finalization = /^\/studio\/releases\/([a-z0-9][a-z0-9._-]{0,63})\/finalize$/.exec(request.url ?? "");
          if (request.method === "POST" && finalization && releaseService) {
            const body = await readJson(request) as { version?: number; reviewerId?: string };
            const task = releases.poll(JSON.stringify([finalization[1], body.version, body.reviewerId]), () => releaseService.finalize(finalization[1]!, body.version ?? 0, body.reviewerId ?? ""));
            const status = task.pending ? 202 : "error" in task ? 409 : 200;
            response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
            response.end(JSON.stringify(task.pending ? { pending: true } : "error" in task ? { error: task.error } : task.result)); return;
          }
          if (request.method === "POST" && request.url === "/studio/songs/generate" && songService) {
            const body = await readJson(request) as SongProductionRequest;
            const result = await songService.generate(body);
            response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" }); response.end(JSON.stringify(result)); return;
          }
          if (request.method === "POST" && request.url === "/studio/sessions" && studioService) {
            const body = await readJson(request) as StudioCreativeRequest;
            const sessionId = studioService.create(body);
            response.writeHead(201, { "content-type": "application/json" }); response.end(JSON.stringify({ sessionId })); return;
          }
          const match = /^\/studio\/sessions\/([a-f0-9]{64})\/run$/.exec(request.url ?? "");
          if (request.method === "POST" && match && studioService) {
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
