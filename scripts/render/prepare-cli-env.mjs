import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve, sep } from "node:path";
import { loadEnvFile } from "node:process";
import { readStudioPermissionReference } from "../../packages/persistence/src/studio-permission.ts";

const root = resolve(import.meta.dirname, "../..");
const target = resolve(process.argv[2] ?? "");
if (!target.startsWith(resolve(root, "private/render-cli") + sep) || !existsSync(target)) throw new Error("Expected an existing Render CLI manual env file in private/render-cli");
const localEnv = resolve(root, ".env");
if (existsSync(localEnv)) loadEnvFile(localEnv);
const contractId = process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID ?? "";
const permissionPath = resolve(root, "private/studio-v2/rights/elevenlabs-permission.json");
const values = {
  NEAR_AI_MODEL: process.env.NEAR_AI_MODEL ?? "",
  NEAR_AI_API_KEY: process.env.NEAR_AI_API_KEY ?? "",
  ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY ?? "",
  ELEVENLABS_PERMISSION_REF: process.env.ELEVENLABS_PERMISSION_REF ?? (existsSync(permissionPath) ? readStudioPermissionReference(permissionPath, contractId) : "")
};
if (Object.values(values).some((value) => !value)) throw new Error("Required local Render provider configuration is missing");
const entries = JSON.parse(readFileSync(target, "utf8"));
if (!Array.isArray(entries) || entries.length !== Object.keys(values).length || entries.some((entry) => typeof entry !== "object" || entry === null || !(entry.key in values))) throw new Error("Unexpected Render manual env file contents");
for (const entry of entries) entry.value = values[entry.key];
writeFileSync(target, JSON.stringify(entries, null, 2) + "\n", { encoding: "utf8", mode: 0o600 });
console.log(`Prepared ${entries.length} Render environment values without printing secrets`);
