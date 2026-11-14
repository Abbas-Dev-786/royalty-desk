import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { importRenderSeed } from "./import-seed.mjs";

const root = resolve(import.meta.dirname, "../..");
const dataDir = process.env.RENDER_DISK_PATH ?? resolve(root, "runtime-data");
const port = Number(process.env.PORT ?? "10000");
if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("Invalid PORT");
for (const key of ["STUDIO_APP_DB_PATH", "STUDIO_CATALOGUE_DB_PATH", "STUDIO_MEDIA_PATH", "STUDIO_JOURNEY_PATH"]) {
  const path = process.env[key];
  if (!path || !resolve(path).startsWith(resolve(dataDir) + "/")) throw new Error(`${key} must be inside the persistent disk`);
}
if (!process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID || process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID === "studio.example.testnet") throw new Error("Configure the deployed studio contract ID");
if (!process.env.STUDIO_WORKER_TOKEN || process.env.STUDIO_WORKER_TOKEN.length < 32) throw new Error("Configure STUDIO_WORKER_TOKEN");
mkdirSync(dataDir, { recursive: true });
importRenderSeed(dataDir, process.env.STUDIO_APP_DB_PATH, process.env.STUDIO_CATALOGUE_DB_PATH, process.env.STUDIO_MEDIA_PATH, process.env.STUDIO_ARCHIVE_PATH ?? resolve(dataDir, "archive"), process.env.STUDIO_JOURNEY_PATH ?? resolve(dataDir, "keys/journey.json"));
mkdirSync(process.env.STUDIO_MEDIA_PATH, { recursive: true });
mkdirSync(resolve(dataDir, "backups"), { recursive: true });
if (process.env.STUDIO_JOURNEY_PATH && !existsSync(process.env.STUDIO_JOURNEY_PATH)) console.warn("Scoped agent key file is missing; automated on-chain release and payouts need the Render secret file.");

const children = new Set();
let shuttingDown = false;
function launch(name, executable, args, cwd) {
  const child = spawn(executable, args, { cwd, env: process.env, stdio: "inherit", shell: false });
  children.add(child);
  child.on("error", (error) => { console.error(`${name} failed to start:`, error); shutdown(1); });
  child.on("exit", (code, signal) => {
    children.delete(child);
    if (!shuttingDown) { console.error(`${name} exited (${code ?? signal}); stopping service`); shutdown(code || 1); }
    else if (children.size === 0) process.exit();
  });
}
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = code;
  for (const child of children) child.kill("SIGTERM");
  if (children.size === 0) process.exit();
  setTimeout(() => process.exit(), 20_000).unref();
}
process.on("SIGTERM", () => shutdown());
process.on("SIGINT", () => shutdown());

launch("worker", process.execPath, ["--experimental-strip-types", "src/main.ts"], resolve(root, "apps/worker"));
launch("web", process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "start", "-H", "0.0.0.0", "-p", String(port)], resolve(root, "apps/web"));
