import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const roots = ["apps", "packages", "scripts"];
const ignored = new Set(["node_modules", ".next", "dist", "target"]);
const problems = [];

function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.name === "check-workspace.mjs") continue;
    if (entry.isDirectory()) {
      visit(path);
      continue;
    }
    if (![".ts", ".tsx", ".mts", ".mjs"].includes(extname(path))) continue;
    const source = readFileSync(path, "utf8");
    const label = relative(root, path);
    if (/\t/.test(source)) problems.push(`${label}: tab indentation`);
    if (/[ \t]+$/m.test(source)) problems.push(`${label}: trailing whitespace`);
    if (/(?:\bas\s+any\b|:\s*any\b|<any>)/.test(source)) problems.push(`${label}: forbidden broad type`);
  }
}

for (const directory of roots) visit(join(root, directory));

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Workspace source policy checks passed.");
}
