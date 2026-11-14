import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, baseEncode, type KeyPairString } from "near-api-js";
import { acceptedStudioReleaseInputFromDatabase, studioDigest, StudioContractClient, type StudioReleaseView } from "@studio/chain";
import { acceptStudioSplit, addStudioPublication, openDatabase, recordStudioPublicationReceipt, StudioMediaStore } from "@studio/persistence";
import type { DatabaseSync } from "node:sqlite";
import type { WorkVersion } from "@studio/domain";
import { prepareAgentReviewedSong } from "./release-preparation.ts";

interface ScopedKey { readonly accountId: string; readonly publicKey: string; readonly secretKey: string; readonly methods: readonly string[]; }
interface AgentRow { readonly id: string; readonly role: string; readonly account_id: string; readonly active: number; }
interface WorkRow { readonly studio_id: string; readonly kind: "song" | "album"; readonly state: string; readonly title: string; readonly asset_hash: string; readonly metadata_hash: string; readonly price_yocto: string; readonly split_json: string; }
const digest = (value: string): string => createHash("sha256").update(value).digest("hex");

export class StudioReleaseAgentService {
  readonly #databasePath: string;
  readonly #contractId: string;
  readonly #provider: JsonRpcProvider;
  readonly #journeyPath: string;
  readonly #mediaPath: string;

  constructor(databasePath: string, contractId: string, rpcUrl: string, journeyPath: string, mediaPath = resolve(process.cwd(), "../..", process.env.STUDIO_MEDIA_PATH ?? "private/studio-media")) {
    this.#databasePath = databasePath;
    this.#contractId = contractId;
    this.#provider = new JsonRpcProvider({ url: rpcUrl });
    this.#journeyPath = journeyPath;
    this.#mediaPath = mediaPath;
  }

  static fromEnvironment(databasePath: string): StudioReleaseAgentService | null {
    const contractId = process.env.NEXT_PUBLIC_STUDIO_CONTRACT_ID;
    if (!contractId) return null;
    return new StudioReleaseAgentService(databasePath, contractId, process.env.NEAR_RPC_URL ?? "https://testnet-rpc.intea.rs", process.env.STUDIO_JOURNEY_PATH ?? resolve(process.cwd(), "../..", "private/studio-v2/testnet/journey.json"));
  }

  #scopedKey(role: string, accountId: string, method: "accept_split" | "create_release" | "publish_release"): ScopedKey {
    const parsed = JSON.parse(readFileSync(this.#journeyPath, "utf8")) as unknown;
    if (!parsed || typeof parsed !== "object") throw new Error("ERR_AGENT_KEYSTORE");
    const accounts = (parsed as { accounts?: unknown }).accounts;
    if (!accounts || typeof accounts !== "object") throw new Error("ERR_AGENT_KEYSTORE");
    const key = (accounts as Record<string, unknown>)[method === "create_release" ? "producerCreateScoped" : `${role}Scoped`];
    if (!key || typeof key !== "object") throw new Error("ERR_AGENT_SCOPED_KEY_MISSING");
    const record = key as Record<string, unknown>;
    if (record.accountId !== accountId || typeof record.publicKey !== "string" || typeof record.secretKey !== "string" || !Array.isArray(record.methods) || record.methods.length !== 1 || record.methods[0] !== method) throw new Error("ERR_AGENT_SCOPED_KEY_MISMATCH");
    return { accountId, publicKey: record.publicKey, secretKey: record.secretKey, methods: [method] };
  }

  async #verifyKey(key: ScopedKey, role: string, method: "accept_split" | "create_release" | "publish_release"): Promise<void> {
    const publicKey = KeyPair.fromString(key.secretKey as KeyPairString).getPublicKey().toString();
    if (publicKey !== key.publicKey) throw new Error("ERR_AGENT_KEY_MISMATCH");
    const access = await this.#provider.viewAccessKey({ accountId: key.accountId, publicKey, finalityQuery: { finality: "final" } });
    if (access.permission === "FullAccess" || access.permission.FunctionCall.receiver_id !== this.#contractId || JSON.stringify(access.permission.FunctionCall.method_names) !== JSON.stringify([method])) throw new Error("ERR_AGENT_KEY_PERMISSION");
    const agent = await this.#provider.callFunction<{ role: string; active: boolean; expires_at_ms: number; actions_used: number; max_actions: number }>({ contractId: this.#contractId, method: "get_agent", args: { account_id: key.accountId } }) ?? null;
    if (!agent || agent.role !== role || !agent.active || agent.expires_at_ms <= Date.now() || agent.actions_used >= agent.max_actions) throw new Error("ERR_AGENT_CHAIN_SCOPE");
  }

  async finalize(workId: string, version: number, reviewerId: string): Promise<{ readonly workId: string; readonly version: number; readonly acceptedAccounts: readonly string[]; readonly published: boolean }> {
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(workId) || !Number.isSafeInteger(version) || version < 1 || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(reviewerId)) throw new Error("ERR_RELEASE_AGENT_INPUT");
    const database = openDatabase(this.#databasePath);
    try {
      prepareAgentReviewedSong(database, new StudioMediaStore(this.#mediaPath), this.#contractId, workId, version, reviewerId);
    } finally { database.close(); }
    await this.commit(workId, version);
    return this.accept(workId, version);
  }

  async commit(workId: string, version: number): Promise<StudioReleaseView> {
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(workId) || !Number.isSafeInteger(version) || version < 1) throw new Error("ERR_RELEASE_AGENT_INPUT");
    const database = openDatabase(this.#databasePath);
    try {
      const studio = database.prepare("SELECT w.studio_id FROM studio_works w JOIN studio_work_versions v ON v.work_id = w.id WHERE w.id = ? AND v.version = ? AND v.state = 'accepted'").get(workId, version) as { studio_id: string } | undefined;
      if (!studio) throw new Error("ERR_RELEASE_NOT_ACCEPTED");
      const client = new StudioContractClient(this.#contractId, this.#provider, this.#contractId.endsWith(".test.near") ? "sandbox" : "testnet");
      const policy = await client.policy();
      if (policy.paused) throw new Error("ERR_RELEASE_POLICY_PAUSED");
      const existing = await client.release(workId, version);
      const input = acceptedStudioReleaseInputFromDatabase(database, new StudioMediaStore(this.#mediaPath), studio.studio_id, workId, version, existing?.policy_epoch ?? policy.epoch);
      if (existing) {
        const matches = (Object.keys(input) as (keyof typeof input)[]).every((key) => JSON.stringify(existing[key]) === JSON.stringify(input[key]));
        if (!matches) throw new Error("ERR_RELEASE_CHAIN_MISMATCH");
        if (!existing.published && existing.policy_epoch !== policy.epoch) throw new Error("ERR_RELEASE_POLICY_STALE");
        return existing;
      }
      const logicalKey = `release-commit:${workId}:${version}`;
      const operationId = digest(logicalKey);
      if (database.prepare("SELECT 1 FROM studio_external_operations WHERE id = ?").get(operationId)) throw new Error("ERR_RELEASE_COMMIT_OUTCOME_UNKNOWN");
      const producer = database.prepare("SELECT role, account_id FROM studio_agents WHERE studio_id = ? AND role = 'producer' AND active = 1 AND revoked_at_ms IS NULL LIMIT 1").get(studio.studio_id) as { role: string; account_id: string } | undefined;
      if (!producer) throw new Error("ERR_PRODUCER_MISSING");
      const key = this.#scopedKey("producer", producer.account_id, "create_release");
      await this.#verifyKey(key, "producer", "create_release");
      const signer = KeyPairSigner.fromSecretKey(key.secretKey as KeyPairString);
      const account = new Account(producer.account_id, this.#provider);
      const transaction = await account.createTransaction({ receiverId: this.#contractId, actions: [actions.functionCall("create_release", { input }, 100_000_000_000_000n, 0n)], publicKey: await signer.getPublicKey() });
      const { txHash, signedTransaction } = await signer.signTransaction(transaction);
      const transactionHash = baseEncode(txHash);
      database.prepare("INSERT INTO studio_external_operations(id, logical_key, operation_type, status, provider_request_id, created_at_ms, updated_at_ms) VALUES (?, ?, 'chain_release_commitment', 'requested', ?, ?, ?)").run(operationId, logicalKey, transactionHash, Date.now(), Date.now());
      try {
        const result = await this.#provider.sendTransactionUntil(signedTransaction, "FINAL");
        if (typeof result.status === "object" && "Failure" in result.status) throw new Error("ERR_RELEASE_COMMIT_CHAIN_FAILURE");
        const final = await client.release(workId, version);
        if (!final || final.commitment !== studioDigest(input) || result.transaction.hash !== transactionHash) throw new Error("ERR_RELEASE_COMMIT_NOT_FINAL");
        database.prepare("UPDATE studio_external_operations SET status = 'finalized', result_hash = ?, updated_at_ms = ? WHERE id = ?").run(final.commitment, Date.now(), operationId);
        return final;
      } catch (error) {
        database.prepare("UPDATE studio_external_operations SET status = 'unknown', updated_at_ms = ? WHERE id = ? AND status = 'requested'").run(Date.now(), operationId);
        throw error;
      }
    } finally { database.close(); }
  }

  async accept(workId: string, version: number): Promise<{ readonly workId: string; readonly version: number; readonly acceptedAccounts: readonly string[]; readonly published: boolean }> {
    if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(workId) || !Number.isSafeInteger(version) || version < 1) throw new Error("ERR_RELEASE_AGENT_INPUT");
    const database = openDatabase(this.#databasePath);
    try {
      const row = database.prepare("SELECT w.studio_id, w.kind, v.state, v.title, v.asset_hash, v.metadata_hash, v.price_yocto, v.split_json FROM studio_work_versions v JOIN studio_works w ON w.id = v.work_id WHERE v.work_id = ? AND v.version = ?").get(workId, version) as WorkRow | undefined;
      if (!row || row.state !== "accepted") throw new Error("ERR_RELEASE_NOT_ACCEPTED");
      const split = JSON.parse(row.split_json) as { agentId: string; basisPoints: number }[];
      const agents = split.map((share) => {
        const agent = database.prepare("SELECT id, role, account_id, active FROM studio_agents WHERE id = ? AND studio_id = ?").get(share.agentId, row.studio_id) as AgentRow | undefined;
        if (!agent || !agent.active || !["lyricist", "composer"].includes(agent.role)) throw new Error("ERR_RELEASE_AGENT_SCOPE");
        return agent;
      });
      const client = new StudioContractClient(this.#contractId, this.#provider, this.#contractId.endsWith(".test.near") ? "sandbox" : "testnet");
      const chain = await client.release(workId, version);
      if (!chain || chain.kind !== row.kind || chain.media_hash !== row.asset_hash || chain.metadata_hash !== row.metadata_hash || chain.price_yocto !== row.price_yocto) throw new Error("ERR_RELEASE_CHAIN_MISMATCH");
      const shares = split.map((share, index) => ({ account_id: agents[index]!.account_id, basis_points: share.basisPoints }));
      if (JSON.stringify(chain.shares) !== JSON.stringify(shares) || chain.split_hash !== studioDigest(shares)) throw new Error("ERR_RELEASE_SPLIT_MISMATCH");
      const policy = await client.policy();
      if (!chain.published && (policy.paused || chain.policy_epoch !== policy.epoch)) throw new Error("ERR_RELEASE_POLICY_STALE");
      const work: WorkVersion = { workId, studioId: row.studio_id, version, kind: row.kind, state: "accepted", title: row.title, assetHash: row.asset_hash, metadataHash: row.metadata_hash, priceYocto: row.price_yocto, split };
      for (const agent of agents) await this.#acceptOne(database, client, chain, work, agent);
      if (!policy.human_review || await client.hasApprovedRelease(workId, version, chain.policy_epoch)) await this.#publish(database, client, chain, work);
      return { workId, version, acceptedAccounts: agents.map((agent) => agent.account_id), published: (await client.release(workId, version))?.published === true };
    } finally { database.close(); }
  }

  async #acceptOne(database: DatabaseSync, client: StudioContractClient, chain: StudioReleaseView, work: WorkVersion, agent: AgentRow): Promise<void> {
    const logicalKey = `split:${work.workId}:${work.version}:${agent.account_id}`;
    const operationId = digest(logicalKey);
    const accepted = await client.hasAcceptedSplit(work.workId, work.version, agent.account_id);
    if (accepted) {
      database.prepare("UPDATE studio_external_operations SET status = 'finalized', updated_at_ms = ? WHERE id = ?").run(Date.now(), operationId);
      if (!database.prepare("SELECT 1 FROM studio_split_acceptances WHERE work_id = ? AND work_version = ? AND agent_id = ?").get(work.workId, work.version, agent.id)) acceptStudioSplit(database, work, agent.id, agent.account_id);
      return;
    }
    const prior = database.prepare("SELECT status FROM studio_external_operations WHERE id = ?").get(operationId) as { status: string } | undefined;
    if (prior) throw new Error(`ERR_SPLIT_OUTCOME_UNKNOWN:${agent.account_id}`);
    const key = this.#scopedKey(agent.role, agent.account_id, "accept_split");
    await this.#verifyKey(key, agent.role, "accept_split");
    database.prepare("INSERT INTO studio_external_operations(id, logical_key, operation_type, status, created_at_ms, updated_at_ms) VALUES (?, ?, 'chain_split_acceptance', 'requested', ?, ?)").run(operationId, logicalKey, Date.now(), Date.now());
    try {
      const account = new Account(agent.account_id, this.#provider, key.secretKey as KeyPairString);
      const result = await account.signAndSendTransaction({ receiverId: this.#contractId, actions: [actions.functionCall("accept_split", { work_id: work.workId, version: work.version, split_hash: chain.split_hash, policy_epoch: chain.policy_epoch }, 100_000_000_000_000n, 0n)], waitUntil: "FINAL", throwOnFailure: false });
      if (typeof result.status === "object" && "Failure" in result.status) throw new Error("ERR_SPLIT_CHAIN_FAILURE");
      if (!(await client.hasAcceptedSplit(work.workId, work.version, agent.account_id))) throw new Error("ERR_SPLIT_NOT_FINAL");
      database.prepare("UPDATE studio_external_operations SET status = 'finalized', result_hash = ?, provider_request_id = ?, updated_at_ms = ? WHERE id = ?").run(chain.split_hash, result.transaction.hash, Date.now(), operationId);
      acceptStudioSplit(database, work, agent.id, agent.account_id);
    } catch (error) {
      database.prepare("UPDATE studio_external_operations SET status = 'unknown', updated_at_ms = ? WHERE id = ? AND status = 'requested'").run(Date.now(), operationId);
      throw error;
    }
  }

  async #publish(database: DatabaseSync, client: StudioContractClient, release: StudioReleaseView, work: WorkVersion): Promise<void> {
    const producer = database.prepare("SELECT id, role, account_id, active FROM studio_agents WHERE studio_id = ? AND role = 'producer' AND active = 1 AND revoked_at_ms IS NULL LIMIT 1").get(work.studioId) as AgentRow | undefined;
    if (!producer) throw new Error("ERR_PRODUCER_MISSING");
    const logicalKey = `publication:${work.workId}:${work.version}`;
    const operationId = digest(logicalKey);
    const existing = database.prepare("SELECT status, provider_request_id FROM studio_external_operations WHERE id = ?").get(operationId) as { status: string; provider_request_id: string | null } | undefined;
    const final = await client.release(work.workId, work.version);
    if (final?.published) {
      if (database.prepare("SELECT 1 FROM studio_publications WHERE work_id = ? AND work_version = ? AND chain_tx_hash IS NOT NULL").get(work.workId, work.version)) return;
      if (!existing?.provider_request_id) throw new Error("ERR_PUBLICATION_RECEIPT_REQUIRED");
      const receipt = await this.#provider.viewTransactionStatusWithReceipts({ txHash: existing.provider_request_id, accountId: producer.account_id, waitUntil: "FINAL" });
      if (receipt.transaction.hash !== existing.provider_request_id || typeof receipt.status !== "object" || !("SuccessValue" in receipt.status) || receipt.transaction.receiver_id !== this.#contractId) throw new Error("ERR_PUBLICATION_RECEIPT_INVALID");
      if (!database.prepare("SELECT 1 FROM studio_publications WHERE work_id = ? AND work_version = ?").get(work.workId, work.version)) addStudioPublication(database, { workId: work.workId, workVersion: work.version, chainCommitment: final.commitment, policyVersion: final.policy_epoch });
      recordStudioPublicationReceipt(database, { workId: work.workId, workVersion: work.version, chainCommitment: final.commitment, transactionHash: existing.provider_request_id, signerAccountId: producer.account_id });
      database.prepare("UPDATE studio_external_operations SET status = 'finalized', result_hash = ?, updated_at_ms = ? WHERE id = ?").run(final.commitment, Date.now(), operationId);
      return;
    }
    if (existing) throw new Error("ERR_PUBLICATION_OUTCOME_UNKNOWN");
    if (!final || final.commitment !== release.commitment || final.policy_epoch !== release.policy_epoch) throw new Error("ERR_PUBLICATION_CHAIN_MISMATCH");
    const key = this.#scopedKey("producer", producer.account_id, "publish_release");
    await this.#verifyKey(key, "producer", "publish_release");
    const signer = KeyPairSigner.fromSecretKey(key.secretKey as KeyPairString);
    const account = new Account(producer.account_id, this.#provider);
    const transaction = await account.createTransaction({ receiverId: this.#contractId, actions: [actions.functionCall("publish_release", { work_id: work.workId, version: work.version, commitment: release.commitment, policy_epoch: release.policy_epoch }, 100_000_000_000_000n, 0n)], publicKey: await signer.getPublicKey() });
    const { txHash, signedTransaction } = await signer.signTransaction(transaction);
    const transactionHash = baseEncode(txHash);
    database.prepare("INSERT INTO studio_external_operations(id, logical_key, operation_type, status, provider_request_id, created_at_ms, updated_at_ms) VALUES (?, ?, 'chain_publication', 'requested', ?, ?, ?)").run(operationId, logicalKey, transactionHash, Date.now(), Date.now());
    try {
      const result = await this.#provider.sendTransactionUntil(signedTransaction, "FINAL");
      if (typeof result.status === "object" && "Failure" in result.status) throw new Error("ERR_PUBLICATION_CHAIN_FAILURE");
      if (!(await client.release(work.workId, work.version))?.published) throw new Error("ERR_PUBLICATION_NOT_FINAL");
      if (result.transaction.hash !== transactionHash) throw new Error("ERR_PUBLICATION_HASH_MISMATCH");
      database.prepare("UPDATE studio_external_operations SET status = 'finalized', result_hash = ?, updated_at_ms = ? WHERE id = ?").run(release.commitment, Date.now(), operationId);
      addStudioPublication(database, { workId: work.workId, workVersion: work.version, chainCommitment: release.commitment, policyVersion: release.policy_epoch });
      recordStudioPublicationReceipt(database, { workId: work.workId, workVersion: work.version, chainCommitment: release.commitment, transactionHash, signerAccountId: producer.account_id });
    } catch (error) {
      database.prepare("UPDATE studio_external_operations SET status = 'unknown', updated_at_ms = ? WHERE id = ? AND status = 'requested'").run(Date.now(), operationId);
      throw error;
    }
  }
}
