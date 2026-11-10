import { spawn } from "node:child_process";

const child = spawn(process.execPath, ["--experimental-strip-types", "--test", "apps/worker/tests/agents.test.ts"], { stdio: "inherit", shell: false });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
