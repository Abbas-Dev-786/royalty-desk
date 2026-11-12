import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const suite = process.argv[2];
const paths = {
  domain: ["packages/domain/tests/studio.test.ts", "packages/persistence/tests/studio.test.ts"],
  agents: ["apps/worker/tests/studio-agents.test.ts"],
  media: ["apps/worker/tests/studio-media.test.ts"],
  sandbox: ["tests/studio/sandbox"],
  server: ["apps/web/tests/studio-web.test.ts", "tests/studio/server"],
  e2e: ["tests/studio/e2e"]
};
if (!Object.hasOwn(paths, suite)) throw new Error(`Unknown studio suite: ${suite}`);
const files = paths[suite].flatMap((path) => {
  if (path.endsWith(".test.ts")) return [path];
  try { return readdirSync(path).filter((name) => name.endsWith(".test.ts")).map((name) => join(path, name)); }
  catch { return []; }
});
if (files.length === 0) {
  process.stderr.write(`Studio ${suite} suite is missing or empty.\n`);
  process.exit(1);
}
const run = spawnSync(process.execPath, ["--experimental-strip-types", "--test", ...files], { stdio: "inherit" });
process.exit(run.status ?? 1);
