import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = process.cwd();
const npmCommand = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
const suites = [
  "check",
  "build",
  "test:domain",
  "test:contract",
  "test:server",
  "test:agents",
  "test:recovery",
  "test:e2e",
  "test:sandbox",
  "test:fault-injection"
];

function sourceRevision() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  } catch {
    return process.env.RELEASE_SOURCE_REVISION ?? "working-tree";
  }
}

function sourceTreeHash() {
  const paths = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: root })
    .toString("utf8").split("\0")
    .filter((path) => path && path !== "apps/web/next-env.d.ts" && !path.endsWith("/tsconfig.tsbuildinfo"))
    .sort();
  const hash = createHash("sha256");
  for (const path of paths) {
    hash.update(path).update("\0").update(createHash("sha256").update(readFileSync(resolve(root, path))).digest()).update("\0");
  }
  return hash.digest("hex");
}

function runSuite(name) {
  const startedAt = new Date().toISOString();
  const args = process.platform === "win32" ? ["/d", "/s", "/c", "npm", "run", name] : ["run", name];
  const result = spawnSync(npmCommand, args, { cwd: root, stdio: "inherit", shell: false });
  const passed = !result.error && result.status === 0;
  return { name, status: passed ? "pass" : "fail", exitCode: result.status ?? 1, startedAt, finishedAt: new Date().toISOString() };
}

if (!process.env.npm_config_user_agent && !process.env.npm_execpath) {
  console.error("Release verification must run from the repository's npm environment.");
  process.exit(2);
}

const startedAt = new Date().toISOString();
const testedSourceTreeHash = sourceTreeHash();
const results = [];
for (const suite of suites) {
  const result = runSuite(suite);
  results.push(result);
  if (result.status === "fail") break;
}

const sourceTreeStable = testedSourceTreeHash === sourceTreeHash();
const report = {
  schema: "royaltydesk-release-suite/v1",
  sourceRevision: sourceRevision(),
  sourceTreeHash: testedSourceTreeHash,
  sourceTreeStable,
  networkId: process.env.NEXT_PUBLIC_NEAR_NETWORK ?? "testnet",
  contractId: process.env.NEXT_PUBLIC_CONTRACT_ID ?? null,
  startedAt,
  finishedAt: new Date().toISOString(),
  suites: results,
  status: results.length === suites.length && results.every((result) => result.status === "pass") && sourceTreeStable ? "pass" : "blocked"
};
const outputPath = resolve(process.env.RELEASE_EVIDENCE_PATH ?? "plans/evidence/artifacts/release-suite.json");
mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ status: report.status, report: outputPath, suites: results.map((result) => `${result.name}:${result.status}`) }));
process.exitCode = report.status === "pass" ? 0 : 1;
