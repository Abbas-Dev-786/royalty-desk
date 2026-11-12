import { createHash } from "node:crypto";
import type { ContributionShare } from "./types.ts";
import { validateShares } from "./validation.ts";

/** Stable digest of an accepted contributor allocation, independent of input order. */
export function studioSplitDigest(shares: readonly ContributionShare[]): string {
  validateShares(shares);
  const ordered = [...shares].sort((a, b) => a.agentId < b.agentId ? -1 : a.agentId > b.agentId ? 1 : 0);
  return createHash("sha256").update(JSON.stringify({ domain: "studio-split-v1", shares: ordered }), "utf8").digest("hex");
}
