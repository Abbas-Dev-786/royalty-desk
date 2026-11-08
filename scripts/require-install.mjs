import { existsSync } from "node:fs";

if (!existsSync(new URL("../node_modules/typescript/bin/tsc", import.meta.url))) {
  console.error("Dependencies are not installed. Run npm install to create the lockfile, then npm ci on clean environments.");
  process.exitCode = 2;
}
