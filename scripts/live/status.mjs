import { JsonRpcProvider } from "near-api-js";

const provider = new JsonRpcProvider({ url: process.env.NEAR_RPC_URL ?? "https://test.rpc.fastnear.com" });
const settlement = await provider.callFunction({
  contractId: "sickhat6192.testnet",
  method: "get_settlement",
  args: { release_id: "live-261110-01", period: "2026-11" },
  finality: "final"
});
if (!settlement) throw new Error("Settlement not found");
console.log(JSON.stringify({
  status: settlement.status,
  approvals: settlement.approvals,
  totalDepositedYocto: settlement.total_deposited_yocto,
  successfulPayoutsYocto: settlement.successful_payouts_yocto,
  entitlements: settlement.entitlements
}, null, 2));
