import { DatabaseSync } from "node:sqlite";
import { resolve } from "node:path";

const app = new DatabaseSync(resolve(process.env.ROYALTYDESK_DB_PATH ?? "data/royaltydesk.sqlite"), { readOnly: true });
const studio = new DatabaseSync(resolve(process.env.STUDIO_CATALOGUE_DB_PATH ?? "private/studio-v2/phase05/studio.sqlite"), { readOnly: true });
try {
  const orders = app.prepare("SELECT status, COUNT(1) AS count FROM studio_orders GROUP BY status ORDER BY status").all();
  const studios = studio.prepare("SELECT id, admin_account_id FROM studios ORDER BY id").all();
  const guestReservations = studio.prepare("SELECT COUNT(1) AS count FROM studio_guest_songs").get().count;
  const operations = studio.prepare("SELECT operation_type, status, COUNT(1) AS count FROM studio_external_operations WHERE operation_type IN ('chain_allocation','chain_auto_payout') GROUP BY operation_type, status ORDER BY operation_type, status").all();
  console.log(JSON.stringify({ autonomousRevenueEnabled: process.env.STUDIO_AUTONOMOUS_REVENUE === "true", guestReservations, studios, orders, operations }));
} finally { app.close(); studio.close(); }
