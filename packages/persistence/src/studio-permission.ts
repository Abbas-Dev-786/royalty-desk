import { readFileSync } from "node:fs";

export function readStudioPermissionReference(path: string, studioAccountId: string): string {
  const parsed = JSON.parse(readFileSync(path, "utf8")) as unknown;
  if (!parsed || typeof parsed !== "object") throw new Error("ERR_PROVIDER_PERMISSION_RECORD");
  const record = parsed as Record<string, unknown>;
  if (record.basis !== "owner-confirmed-private-permission" && record.basis !== "provider-written-reference" || typeof record.reference !== "string" || record.reference.length < 8 || record.reference.length > 512 || record.testnetOnly !== true) throw new Error("ERR_PROVIDER_PERMISSION_RECORD");
  const uses = record.coveredUses;
  if (!uses || typeof uses !== "object" || ["musicLibrary", "musicStreamingDistribution", "publicPlayback", "paidPurchases", "tips", "downloads"].some((use) => (uses as Record<string, unknown>)[use] !== true)) throw new Error("ERR_PROVIDER_PERMISSION_SCOPE");
  if (record.studioAccountId !== studioAccountId) throw new Error("ERR_PROVIDER_PERMISSION_STUDIO");
  if (record.basis === "owner-confirmed-private-permission" && !/^owner-confirmation-\d{4}-\d{2}-\d{2}$/.test(record.reference)) throw new Error("ERR_PROVIDER_PERMISSION_REFERENCE");
  return record.reference;
}
