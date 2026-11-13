import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, baseEncode, type KeyPairString } from "near-api-js";
import { StudioContractClient } from "@royaltydesk/chain";
import { openDatabase } from "@royaltydesk/persistence";
import type { DatabaseSync } from "node:sqlite";

interface ScopedKey { readonly accountId: string; readonly publicKey: string; readonly secretKey: string; readonly methods: readonly string[]; }
interface OrderRow { readonly payment_id: string; readonly work_id: string; readonly work_version: number; readonly buyer_account_id: string; readonly kind: string; readonly amount_yocto: string; readonly commitment: string; readonly created_at_ms: number; }
interface AgentRow { readonly role: string; readonly account_id: string; readonly active: number; }
interface OperationRow { readonly id: string; readonly status: string; readonly provider_request_id: string | null; }
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");

export class StudioRevenueAgentService {
  readonly #appDatabasePath: string;
  readonly #studioDatabasePath: string;
  readonly #contractId: string;
  readonly #provider: JsonRpcProvider;
  readonly #keyPath: string;
  #orderCursor: { readonly createdAtMs: number; readonly paymentId: string } = { createdAtMs: 0, paymentId: "" };

  constructor(appDatabasePath: string, studioDatabasePath: string, contractId: string, rpcUrl: string, keyPath: string) {
    this.#appDatabasePath = appDatabasePath;
    this.#studioDatabasePath = studioDatabasePath;
    this.#contractId = contractId;
    this.#provider = new JsonRpcProvider({ url: rpcUrl });
    this.#keyPath = keyPath;
  }

  static fromEnvironment(appDatabasePath: string, studioDatabasePath: string): StudioRevenueAgentService | null {
    if (process.env.STUDIO_AUTONOMOUS_REVENUE !== "true" || !process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID) return null;
    return new StudioRevenueAgentService(appDatabasePath, studioDatabasePath, process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID, process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs", resolve(process.cwd(), "../..", "private/studio-v2/testnet/journey.json"));
  }

  async runOnce(): Promise<{ readonly allocations: number; readonly payouts: number; readonly errors: readonly string[] }> {
    const app = openDatabase(this.#appDatabasePath);
    const studio = openDatabase(this.#studioDatabasePath);
    let allocations = 0;
    let payouts = 0;
    const errors: string[] = [];
    try {
      const client = new StudioContractClient(this.#contractId, this.#provider);
      const policy = await client.policy();
      if (policy.paused) return { allocations, payouts, errors: ["STUDIO_PAUSED"] };
      const orders = app.prepare("SELECT payment_id, work_id, work_version, buyer_account_id, kind, amount_yocto, commitment, created_at_ms FROM studio_orders WHERE status = 'finalized' AND (created_at_ms > ? OR (created_at_ms = ? AND payment_id > ?)) ORDER BY created_at_ms, payment_id LIMIT 20").all(this.#orderCursor.createdAtMs, this.#orderCursor.createdAtMs, this.#orderCursor.paymentId) as unknown as OrderRow[];
      if (!orders.length) this.#orderCursor = { createdAtMs: 0, paymentId: "" };
      for (const order of orders) {
        try { if (await this.#allocate(studio, client, order)) allocations += 1; }
        catch (error) { errors.push(`${order.payment_id}:${error instanceof Error ? error.message : "ERR_ALLOCATION"}`); }
        finally { this.#orderCursor = { createdAtMs: order.created_at_ms, paymentId: order.payment_id }; }
      }
      const agents = studio.prepare("SELECT role, account_id, active FROM studio_agents WHERE role IN ('producer','lyricist','composer','reviewer') AND active = 1 AND revoked_at_ms IS NULL ORDER BY account_id LIMIT 32").all() as unknown as AgentRow[];
      for (const agent of agents) {
        try { if (await this.#pay(studio, client, agent)) payouts += 1; }
        catch (error) { errors.push(`${agent.account_id}:${error instanceof Error ? error.message : "ERR_PAYOUT"}`); }
      }
      return { allocations, payouts, errors };
    } finally { app.close(); studio.close(); }
  }

  async #allocate(database: DatabaseSync, client: StudioContractClient, order: OrderRow): Promise<boolean> {
    const payment = await client.payment(order.payment_id);
    if (!payment || payment.status !== "finalized" || payment.work_id !== order.work_id || payment.version !== order.work_version || payment.buyer_id !== order.buyer_account_id || payment.kind !== order.kind || payment.gross_yocto !== order.amount_yocto || payment.commitment !== order.commitment) throw new Error("ERR_ALLOCATION_PAYMENT_MISMATCH");
    const logicalKey = `allocation-auto:${order.payment_id}`;
    const operationId = digest(logicalKey);
    const prior = database.prepare("SELECT id, status, provider_request_id FROM studio_external_operations WHERE id = ?").get(operationId) as OperationRow | undefined;
    if (payment.allocated_yocto === payment.gross_yocto) {
      if (prior) database.prepare("UPDATE studio_external_operations SET status = 'finalized', result_hash = ?, updated_at_ms = ? WHERE id = ?").run(digest(order.commitment), Date.now(), operationId);
      return false;
    }
    if (payment.allocated_yocto !== "0") throw new Error("ERR_ALLOCATION_PARTIAL_CHAIN_STATE");
    if (prior) throw new Error("ERR_ALLOCATION_OUTCOME_UNKNOWN");
    const key = await this.#key("producerAllocateScoped", "allocate_payment");
    await this.#send(database, key, logicalKey, "chain_allocation", "allocate_payment", { payment_id: order.payment_id });
    const final = await client.payment(order.payment_id);
    if (final?.allocated_yocto !== final?.gross_yocto) throw new Error("ERR_ALLOCATION_NOT_FINAL");
    database.prepare("UPDATE studio_external_operations SET status = 'finalized', result_hash = ?, updated_at_ms = ? WHERE id = ?").run(digest(order.commitment), Date.now(), operationId);
    return true;
  }

  async #pay(database: DatabaseSync, client: StudioContractClient, agent: AgentRow): Promise<boolean> {
    const keyName = `${agent.role}PayoutScoped`;
    const pending = database.prepare("SELECT id, logical_key, status FROM studio_external_operations WHERE operation_type = 'chain_auto_payout' AND logical_key LIKE ? AND status IN ('requested','submitted','unknown') ORDER BY created_at_ms LIMIT 1").get(`payout-auto:${agent.account_id}:%`) as { id: string; logical_key: string; status: string } | undefined;
    if (pending) {
      const payoutId = pending.logical_key.split(":").at(-1)!;
      const payout = await client.payout(payoutId);
      if (!payout || payout.status === "pending") throw new Error("ERR_PAYOUT_OUTCOME_UNKNOWN");
      database.prepare("UPDATE studio_external_operations SET status = ?, updated_at_ms = ? WHERE id = ?").run(payout.status === "paid" ? "finalized" : "failed", Date.now(), pending.id);
      return false;
    }
    const earnings = await client.earnings(agent.account_id);
    if (BigInt(earnings.owed_yocto) === 0n) return false;
    const count = database.prepare("SELECT COUNT(*) AS n FROM studio_external_operations WHERE operation_type = 'chain_auto_payout' AND logical_key LIKE ?").get(`payout-auto:${agent.account_id}:%`) as { n: number };
    const payoutId = `auto-${digest(agent.account_id).slice(0,20)}-${count.n + 1}`;
    const key = await this.#key(keyName, "request_payout");
    if (key.accountId !== agent.account_id) throw new Error("ERR_PAYOUT_KEY_ACCOUNT");
    const logicalKey = `payout-auto:${agent.account_id}:${payoutId}`;
    await this.#send(database, key, logicalKey, "chain_auto_payout", "request_payout", { payout_id: payoutId, recipient_id: agent.account_id });
    const payout = await client.payout(payoutId);
    if (!payout) throw new Error("ERR_PAYOUT_NOT_FOUND");
    database.prepare("UPDATE studio_external_operations SET status = ?, updated_at_ms = ? WHERE id = ?").run(payout.status === "paid" ? "finalized" : payout.status === "failed" ? "failed" : "submitted", Date.now(), digest(logicalKey));
    return payout.status === "paid";
  }

  async #key(name: string, method: string): Promise<ScopedKey> {
    const journey = JSON.parse(readFileSync(this.#keyPath, "utf8")) as { accounts?: Record<string, ScopedKey> };
    const key = journey.accounts?.[name];
    if (!key || key.methods.length !== 1 || key.methods[0] !== method || KeyPair.fromString(key.secretKey as KeyPairString).getPublicKey().toString() !== key.publicKey) throw new Error(`ERR_REVENUE_KEY:${name}`);
    const access = await this.#provider.viewAccessKey({ accountId: key.accountId, publicKey: key.publicKey, finalityQuery: { finality: "final" } });
    if (access.permission === "FullAccess" || access.permission.FunctionCall.receiver_id !== this.#contractId || JSON.stringify(access.permission.FunctionCall.method_names) !== JSON.stringify([method])) throw new Error(`ERR_REVENUE_KEY_SCOPE:${name}`);
    return key;
  }

  async #send(database: DatabaseSync, key: ScopedKey, logicalKey: string, operationType: string, method: string, args: Record<string, unknown>): Promise<void> {
    const signer = KeyPairSigner.fromSecretKey(key.secretKey as KeyPairString);
    const account = new Account(key.accountId, this.#provider);
    const transaction = await account.createTransaction({ receiverId: this.#contractId, actions: [actions.functionCall(method, args, 100_000_000_000_000n, 0n)], publicKey: await signer.getPublicKey() });
    const { txHash, signedTransaction } = await signer.signTransaction(transaction);
    const transactionHash = baseEncode(txHash);
    const operationId = digest(logicalKey);
    database.prepare("INSERT INTO studio_external_operations(id,logical_key,operation_type,status,provider_request_id,created_at_ms,updated_at_ms) VALUES (?,?,?,'requested',?,?,?)").run(operationId, logicalKey, operationType, transactionHash, Date.now(), Date.now());
    try {
      const result = await this.#provider.sendTransactionUntil(signedTransaction, "FINAL");
      if (result.transaction.hash !== transactionHash || typeof result.status === "object" && "Failure" in result.status) throw new Error("ERR_REVENUE_CHAIN_FAILURE");
    } catch (error) {
      database.prepare("UPDATE studio_external_operations SET status = 'unknown', updated_at_ms = ? WHERE id = ? AND status = 'requested'").run(Date.now(), operationId);
      throw error;
    }
  }
}
