import { resolve } from "node:path";

export interface WorkerConfig {
  readonly host: string;
  readonly port: number;
  readonly networkId: "testnet";
  readonly contractId: string;
  readonly databasePath: string;
  readonly studioDatabasePath: string;
  readonly storageSecret: string | null;
  readonly workerApiToken: string | null;
  readonly nearAiBaseUrl: string;
  readonly nearAiApiKey: string | null;
  readonly nearAiModel: string | null;
  readonly agentKeystorePath: string | null;
}

export function readWorkerConfig(environment: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const networkId = environment.NEXT_PUBLIC_NEAR_NETWORK ?? "testnet";
  if (networkId !== "testnet") throw new Error("Worker supports testnet only");

  const contractId = environment.NEXT_PUBLIC_CONTRACT_ID;
  if (!contractId || !contractId.endsWith(".testnet")) {
    throw new Error("NEXT_PUBLIC_CONTRACT_ID must name a testnet account");
  }

  const port = Number.parseInt(environment.ROYALTYDESK_WORKER_PORT ?? "3101", 10);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("Invalid worker port");

  const storageSecret = environment.ROYALTYDESK_STORAGE_SECRET ?? environment.ROYALTYDESK_ENCRYPTION_KEY ?? null;
  if (environment.NODE_ENV === "production" && (!storageSecret || storageSecret.length < 32)) throw new Error("ROYALTYDESK_STORAGE_SECRET must be configured with at least 32 characters in production");
  const workerApiToken = environment.ROYALTYDESK_WORKER_TOKEN ?? null;
  if (environment.NODE_ENV === "production" && (!workerApiToken || workerApiToken.length < 32)) throw new Error("ROYALTYDESK_WORKER_TOKEN must be configured in production");
  if (environment.ROYALTYDESK_AGENT_KEYSTORE_PATH && (!workerApiToken || workerApiToken.length < 32)) throw new Error("Agent signing requires a private worker API token of at least 32 characters");
  return { host: environment.ROYALTYDESK_WORKER_HOST ?? "127.0.0.1", port, networkId, contractId, databasePath: resolve(process.cwd(), "../..", environment.ROYALTYDESK_DB_PATH ?? environment.ROYALTYDESK_DATABASE_PATH ?? ".royaltydesk/royaltydesk.sqlite"), studioDatabasePath: resolve(process.cwd(), "../..", environment.STUDIO_CATALOGUE_DB_PATH ?? "private/studio-v2/phase05/studio.sqlite"), storageSecret, workerApiToken, nearAiBaseUrl: environment.NEAR_AI_BASE_URL ?? "https://cloud-api.near.ai/v1", nearAiApiKey: environment.NEAR_AI_API_KEY ?? null, nearAiModel: environment.NEAR_AI_MODEL ?? null, agentKeystorePath: environment.ROYALTYDESK_AGENT_KEYSTORE_PATH ? resolve(process.cwd(), "../..", environment.ROYALTYDESK_AGENT_KEYSTORE_PATH) : null };
}
