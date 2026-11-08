import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { runSandboxCommand, startSandbox, stopSandbox } from "./sandbox/process.mjs";
import { runFaultScenario } from "./sandbox/fault-scenario.mjs";

const build = spawnSync(process.execPath, ["scripts/build-fault-contract.mjs"], { stdio: "inherit", shell: false });
if (build.error || build.status !== 0) process.exit(build.status ?? 2);

const wasmPath = resolve("contracts/royaltydesk/target/wasm32-unknown-unknown/release/royaltydesk_contract.wasm");
const home = await mkdtemp(join(tmpdir(), "royaltydesk-near-fault-sandbox-"));
let sandbox;
try {
  await runSandboxCommand(home, "init");
  sandbox = await startSandbox(home);
  const result = await runFaultScenario({ home, wasmPath });
  console.log(JSON.stringify({ status: "ok", ...result }, null, 2));
} catch (error) {
  console.error(`Fault-injection sandbox failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  stopSandbox(sandbox);
  await rm(home, { recursive: true, force: true });
}
