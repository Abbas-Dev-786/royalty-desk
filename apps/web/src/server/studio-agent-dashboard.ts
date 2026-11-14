import "server-only";
import { getAppDatabase } from "./runtime";
import { openStudioCatalogueDatabase, studioContractClient } from "./studio-catalogue";
import { allocateContractShares } from "@/lib/studio-agent-allocation";

interface AgentRow { readonly id: string; readonly role: string; readonly account_id: string; readonly active: number; }
interface WorkRow { readonly work_id: string; readonly version: number; readonly title: string; }
interface OrderRow { readonly payment_id: string; readonly work_id: string; readonly work_version: number; readonly kind: "purchase" | "tip"; readonly amount_yocto: string; readonly commitment: string; readonly transaction_hash: string | null; readonly created_at_ms: number; }
interface PayoutRow { readonly logical_key: string; readonly provider_request_id: string | null; readonly created_at_ms: number; }
interface AllocationRow { readonly logical_key: string; readonly provider_request_id: string | null; }

export interface AgentEarning { readonly paymentId: string; readonly kind: "purchase" | "tip"; readonly sourceTitle: string; readonly workTitle: string; readonly workId: string; readonly amountYocto: string; readonly transactionHash: string | null; readonly allocationHash: string | null; readonly occurredAtMs: number; }
export interface AgentTransfer { readonly payoutId: string; readonly amountYocto: string; readonly status: string; readonly transactionHash: string | null; readonly occurredAtMs: number; }
export interface AgentDashboardRow { readonly id: string; readonly role: string; readonly accountId: string; readonly active: boolean; readonly walletBalanceYocto: string | null; readonly owedYocto: string | null; readonly pendingYocto: string | null; readonly paidYocto: string | null; readonly earnings: readonly AgentEarning[]; readonly transfers: readonly AgentTransfer[]; }
export interface AgentDashboard { readonly agents: readonly AgentDashboardRow[]; readonly historyIncomplete: boolean; readonly historyLimit: number; }

const historyLimit = 100;
const workKey = (id: string, version: number): string => `${id}:${version}`;

async function batches<T>(items: readonly T[], size: number, work: (item: T) => Promise<void>): Promise<void> {
  for (let index = 0; index < items.length; index += size) await Promise.all(items.slice(index, index + size).map(work));
}

export async function loadAgentDashboard(): Promise<AgentDashboard> {
  const chain = studioContractClient();
  const database = openStudioCatalogueDatabase();
  let agents: AgentRow[], works: WorkRow[], payouts: PayoutRow[], allocations: AllocationRow[];
  try {
    const studio = database.prepare("SELECT id FROM studios WHERE admin_account_id = ? LIMIT 1").get(chain.contractId) as { id: string } | undefined;
    if (!studio) throw new Error("STUDIO_LOCAL_ADMIN_MISSING");
    agents = database.prepare("SELECT id, role, account_id, active FROM studio_agents WHERE studio_id = ? ORDER BY role, account_id").all(studio.id) as unknown as AgentRow[];
    works = database.prepare("SELECT v.work_id, v.version, v.title FROM studio_work_versions v JOIN studio_works w ON w.id = v.work_id WHERE w.studio_id = ?").all(studio.id) as unknown as WorkRow[];
    payouts = database.prepare("SELECT logical_key, provider_request_id, created_at_ms FROM studio_external_operations WHERE operation_type = 'chain_auto_payout' ORDER BY created_at_ms DESC LIMIT ?").all(historyLimit) as unknown as PayoutRow[];
    allocations = database.prepare("SELECT logical_key, provider_request_id FROM studio_external_operations WHERE operation_type = 'chain_allocation' ORDER BY created_at_ms DESC LIMIT ?").all(historyLimit) as unknown as AllocationRow[];
  } finally { database.close(); }
  const orders = getAppDatabase().prepare("SELECT payment_id, work_id, work_version, kind, amount_yocto, commitment, transaction_hash, created_at_ms FROM studio_orders WHERE status = 'finalized' ORDER BY created_at_ms DESC LIMIT ?").all(historyLimit) as unknown as OrderRow[];
  const titles = new Map(works.map((work) => [workKey(work.work_id, work.version), work.title]));
  const allocationHashes = new Map(allocations.map((operation) => [operation.logical_key, operation.provider_request_id]));
  const earnings = new Map<string, AgentEarning[]>();
  const transfers = new Map<string, AgentTransfer[]>();
  const accounts = new Set(agents.map((agent) => agent.account_id));
  let historyIncomplete = false;

  await batches(orders, 6, async (order) => {
    try {
      const payment = await chain.payment(order.payment_id);
      if (!payment || payment.status !== "finalized" || payment.allocated_yocto !== payment.gross_yocto || payment.gross_yocto !== order.amount_yocto || payment.work_id !== order.work_id || payment.version !== order.work_version || payment.kind !== order.kind || payment.commitment !== order.commitment) { historyIncomplete = true; return; }
      const release = await chain.release(order.work_id, order.work_version);
      if (!release || release.commitment !== order.commitment) { historyIncomplete = true; return; }
      const sourceTitle = titles.get(workKey(order.work_id, order.work_version)) ?? order.work_id;
      const portions = release.kind === "album"
        ? allocateContractShares(payment.gross_yocto, release.tracks.map((track) => ({ id: workKey(track.song_id, track.song_version), basisPoints: track.basis_points })))
        : [{ id: workKey(order.work_id, order.work_version), amountYocto: payment.gross_yocto }];
      for (const portion of portions) {
        const [workId, versionText] = portion.id.split(":");
        const version = Number(versionText);
        if (!workId || !Number.isSafeInteger(version)) throw new Error("ERR_AGENT_WORK_ID");
        const song = release.kind === "album" ? await chain.release(workId, version) : release;
        if (!song || song.kind !== "song") throw new Error("ERR_AGENT_SONG_RELEASE");
        for (const part of allocateContractShares(portion.amountYocto, song.shares.map((share) => ({ id: share.account_id, basisPoints: share.basis_points })))) {
          if (!accounts.has(part.id) || part.amountYocto === "0") continue;
          const row: AgentEarning = { paymentId: order.payment_id, kind: order.kind, sourceTitle, workTitle: titles.get(portion.id) ?? workId, workId, amountYocto: part.amountYocto, transactionHash: order.transaction_hash, allocationHash: allocationHashes.get(`allocation-auto:${order.payment_id}`) ?? null, occurredAtMs: order.created_at_ms };
          earnings.set(part.id, [...(earnings.get(part.id) ?? []), row]);
        }
      }
    } catch { historyIncomplete = true; }
  });

  await batches(payouts, 6, async (operation) => {
    const pieces = operation.logical_key.split(":");
    const accountId = pieces[1], payoutId = pieces[2];
    if (!accountId || !payoutId || !accounts.has(accountId)) return;
    try {
      const payout = await chain.payout(payoutId);
      if (!payout || payout.recipient_id !== accountId) { historyIncomplete = true; return; }
      const row: AgentTransfer = { payoutId, amountYocto: payout.amount_yocto, status: payout.status, transactionHash: operation.provider_request_id, occurredAtMs: operation.created_at_ms };
      transfers.set(accountId, [...(transfers.get(accountId) ?? []), row]);
    } catch { historyIncomplete = true; }
  });

  const rows = await Promise.all(agents.map(async (agent): Promise<AgentDashboardRow> => {
    const [account, balance] = await Promise.allSettled([chain.provider.viewAccount({ accountId: agent.account_id, blockQuery: { finality: "final" } }), chain.earnings(agent.account_id)]);
    return {
      id: agent.id, role: agent.role, accountId: agent.account_id, active: agent.active === 1,
      walletBalanceYocto: account.status === "fulfilled" ? account.value.amount.toString() : null,
      owedYocto: balance.status === "fulfilled" ? balance.value.owed_yocto : null,
      pendingYocto: balance.status === "fulfilled" ? balance.value.pending_yocto : null,
      paidYocto: balance.status === "fulfilled" ? balance.value.paid_yocto : null,
      earnings: earnings.get(agent.account_id) ?? [], transfers: transfers.get(agent.account_id) ?? []
    };
  }));
  return { agents: rows, historyIncomplete, historyLimit };
}
