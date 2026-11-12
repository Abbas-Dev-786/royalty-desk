import "server-only";
import { getAppDatabase } from "./runtime";
import { listCatalogue, studioContractClient } from "./studio-catalogue";

export async function hasStudioDownloadEntitlement(accountId: string, songId: string, songVersion: number): Promise<boolean> {
  const catalogue = await listCatalogue();
  const song = catalogue.find((item) => item.kind === "song" && item.workId === songId && item.version === songVersion);
  if (!song) return false;
  const eligible = new Set([`${songId}:${songVersion}`]);
  for (const album of catalogue.filter((item) => item.kind === "album" && item.tracks.some((track) => track.workId === songId && track.version === songVersion))) eligible.add(`${album.workId}:${album.version}`);
  const orders = getAppDatabase().prepare("SELECT payment_id, work_id, work_version, amount_yocto, commitment FROM studio_orders WHERE buyer_account_id = ? AND kind = 'purchase' AND status IN ('submitted','unknown','finalized') ORDER BY created_at_ms DESC LIMIT 100").all(accountId) as { payment_id: string; work_id: string; work_version: number; amount_yocto: string; commitment: string }[];
  const chain = studioContractClient();
  for (const order of orders) {
    if (!eligible.has(`${order.work_id}:${order.work_version}`)) continue;
    const payment = await chain.payment(order.payment_id);
    if (payment?.status === "finalized" && payment.buyer_id === accountId && payment.kind === "purchase" && payment.work_id === order.work_id && payment.version === order.work_version && payment.gross_yocto === order.amount_yocto && payment.commitment === order.commitment) return true;
  }
  return false;
}
