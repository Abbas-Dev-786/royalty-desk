import { spawnSync } from "node:child_process";

const steps = ["check", "build", "test:studio-domain", "test:studio-agents", "test:studio-media", "test:studio-contract", "test:studio-sandbox", "test:studio-server", "test:studio-e2e", "test:server"];
for (const step of steps) {
  const run = spawnSync("npm", ["run", step], { stdio: "inherit", shell: process.platform === "win32" });
  if (run.status !== 0) process.exit(run.status ?? 1);
}
