import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (!existsSync("node_modules/next/package.json")) {
  console.error("Build blocked: npm dependencies are not installed.");
  process.exit(2);
}

const npmCommand = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
const npmArgs = process.platform === "win32"
  ? ["/d", "/s", "/c", "npm", "run", "build", "--workspaces", "--if-present"]
  : ["run", "build", "--workspaces", "--if-present"];
const npmResult = spawnSync(npmCommand, npmArgs, {
  shell: false,
  stdio: "inherit"
});
if (npmResult.error || npmResult.status !== 0) process.exit(npmResult.status ?? 1);

const studioResult = spawnSync(process.execPath, ["scripts/run-contract.mjs", "build", "studio"], { shell: false, stdio: "inherit" });
if (studioResult.error || studioResult.status !== 0) {
  console.error("Build blocked: studio contract build failed or is unavailable.");
  process.exit(studioResult.status ?? 2);
}
