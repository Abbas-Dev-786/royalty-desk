import { existsSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { spawn } from "node:child_process";
import { resolve } from "node:path";

const environmentFile = resolve(process.cwd(), "../..", ".env");
if (existsSync(environmentFile)) loadEnvFile(environmentFile);
const command = process.argv[2];
if (!new Set(["dev", "build", "start"]).has(command)) throw new Error("Unsupported web command");
const child = spawn(process.execPath, [resolve(process.cwd(), "../..", "node_modules/next/dist/bin/next"), command], { cwd: process.cwd(), env: process.env, stdio: "inherit", shell: false });
child.on("exit", (code) => { process.exitCode = code ?? 1; });
