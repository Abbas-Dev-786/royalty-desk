import type { AlbumTrack, ContributionShare, RevenueEvent } from "./types.ts";
import { parseYocto, validateAlbumTracks, validateRevenueEvent, validateShares } from "./validation.ts";

export interface Allocation { readonly id: string; readonly amountYocto: string }

export function allocateWeighted(totalYocto: string, weights: readonly { readonly id: string; readonly basisPoints: number }[]): readonly Allocation[] {
  const total = parseYocto(totalYocto);
  if (weights.length < 1 || weights.length > 100 || new Set(weights.map((item) => item.id)).size !== weights.length) throw new Error("Invalid allocation recipients");
  if (weights.some((item) => !Number.isInteger(item.basisPoints) || item.basisPoints < 0)) throw new Error("Invalid allocation weight");
  if (weights.reduce((sum, item) => sum + item.basisPoints, 0) !== 10_000) throw new Error("Allocation weights must total 10000");
  const rows = weights.map((item) => ({ id: item.id, amount: total * BigInt(item.basisPoints) / 10_000n, remainder: total * BigInt(item.basisPoints) % 10_000n }));
  let remaining = total - rows.reduce((sum, row) => sum + row.amount, 0n);
  const order = [...rows].sort((a, b) => a.remainder === b.remainder ? a.id < b.id ? -1 : a.id > b.id ? 1 : 0 : a.remainder > b.remainder ? -1 : 1);
  for (const row of order) {
    if (remaining === 0n) break;
    row.amount += 1n;
    remaining -= 1n;
  }
  return rows.map((row) => ({ id: row.id, amountYocto: row.amount.toString() }));
}

export function allocateSong(netYocto: string, shares: readonly ContributionShare[]): readonly Allocation[] {
  validateShares(shares);
  return allocateWeighted(netYocto, shares.map((share) => ({ id: share.agentId, basisPoints: share.basisPoints })));
}

export function allocateAlbum(netYocto: string, tracks: readonly AlbumTrack[]): readonly Allocation[] {
  validateAlbumTracks(tracks);
  return allocateWeighted(netYocto, tracks.map((track) => ({ id: track.songId, basisPoints: track.basisPoints })));
}

export function netRevenue(event: RevenueEvent): string {
  validateRevenueEvent(event);
  if (event.state !== "finalized") return "0";
  return (parseYocto(event.grossYocto) - parseYocto(event.feeYocto) - parseYocto(event.refundableYocto)).toString();
}

export type RevenueTarget =
  | { readonly kind: "song"; readonly workId: string; readonly shares: readonly ContributionShare[] }
  | { readonly kind: "album"; readonly workId: string; readonly tracks: readonly AlbumTrack[]; readonly songShares: Readonly<Record<string, readonly ContributionShare[]>> };

/** Allocates one finalized purchase or tip through the bound work's split. */
export function allocateRevenue(event: RevenueEvent, target: RevenueTarget): readonly Allocation[] {
  if (event.workId !== target.workId) throw new Error("Revenue targets another work");
  const net = netRevenue(event);
  if (target.kind === "song") return allocateSong(net, target.shares);
  const totals = new Map<string, bigint>();
  for (const song of allocateAlbum(net, target.tracks)) {
    const shares = target.songShares[song.id];
    if (!shares) throw new Error("Album song split is missing");
    for (const part of allocateSong(song.amountYocto, shares)) totals.set(part.id, (totals.get(part.id) ?? 0n) + BigInt(part.amountYocto));
  }
  return [...totals].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([id, amount]) => ({ id, amountYocto: amount.toString() }));
}
