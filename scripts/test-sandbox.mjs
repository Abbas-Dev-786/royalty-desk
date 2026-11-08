import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runSandboxCommand, startSandbox, stopSandbox } from "./sandbox/process.mjs";
import { runScenario } from "./sandbox/scenario.mjs";

const wasmPath = resolve("contracts/royaltydesk/target/near/royaltydesk_contract.wasm");
const home = await mkdtemp(join(tmpdir(), "royaltydesk-near-sandbox-"));
let sandbox;

try {
  await runSandboxCommand(home, "init");
  sandbox = await startSandbox(home);
  const result = await runScenario({ home, wasmPath });
  console.log(JSON.stringify({ status: "ok", ...result }, null, 2));
} catch (error) {
  console.error(`Sandbox integration failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  stopSandbox(sandbox);
  await rm(home, { recursive: true, force: true });
}
