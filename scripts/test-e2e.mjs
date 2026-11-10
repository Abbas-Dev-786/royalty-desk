import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = 3192;
const child = spawn(process.execPath, [join(process.cwd(), "node_modules", "next", "dist", "bin", "next"), "dev", "--hostname", "127.0.0.1", "--port", String(port)], { cwd: join(process.cwd(), "apps", "web"), stdio: "ignore", shell: false, env: { ...process.env, PORT: String(port), NEXT_DIST_DIR: ".next-e2e", NEXT_PUBLIC_NEAR_NETWORK: "testnet", NEXT_PUBLIC_CONTRACT_ID: "contract.testnet", ROYALTYDESK_DB_PATH: join(mkdtempSync(join(tmpdir(), "royaltydesk-e2e-")), "app.sqlite"), ROYALTYDESK_STORAGE_SECRET: "e2e-secret-that-is-longer-than-32-characters" } });

try {
  let ready = false;
  for (let attempt = 0; attempt < 60 && !ready; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    try { ready = (await fetch(`http://127.0.0.1:${port}/`)).status === 200; } catch { /* server is still starting */ }
  }
  if (!ready) throw new Error("web server did not become ready");
  const home = await fetch(`http://127.0.0.1:${port}/`);
  const challenge = await fetch(`http://127.0.0.1:${port}/api/auth/challenge`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  const releases = await fetch(`http://127.0.0.1:${port}/api/releases`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ releaseId: "unauthorized", funderId: "funder.testnet" }) });
  const agentRun = await fetch(`http://127.0.0.1:${port}/api/releases/release-1/agents/run`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "fixture" }) });
  if (home.status !== 200 || challenge.status !== 200 || releases.status !== 401 || agentRun.status !== 401) throw new Error(`unexpected statuses home=${home.status} challenge=${challenge.status} releases=${releases.status} agent=${agentRun.status}`);
  console.log(JSON.stringify({ status: "ok", checks: { home: "pass", challenge: "pass", unauthorizedMutation: "pass", unauthorizedAgent: "pass" } }));
} finally {
  await new Promise((resolve) => {
    let childClosed = child.exitCode !== null;
    let killerClosed = process.platform !== "win32";
    const finish = () => { if (childClosed && killerClosed) resolve(); };
    if (!childClosed) child.once("close", () => { childClosed = true; finish(); });
    if (process.platform === "win32" && child.pid) {
      const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
      killer.once("close", () => { killerClosed = true; finish(); });
      try { process.kill(child.pid); } catch { /* taskkill handles an already-exited process */ }
    } else {
      child.kill();
    }
  });
  await new Promise((resolve) => setTimeout(resolve, 500));

  const generatedPaths = [join(process.cwd(), "apps", "web", ".next-e2e"), join(process.cwd(), "apps", "web", "AGENTS.md")];
  for (let attempt = 0; attempt < 10; attempt += 1) {
    for (const generatedPath of generatedPaths) rmSync(generatedPath, { recursive: true, force: true });
    if (generatedPaths.every((generatedPath) => !existsSync(generatedPath))) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
