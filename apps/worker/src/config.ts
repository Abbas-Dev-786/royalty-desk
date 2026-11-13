import { resolve } from "node:path";

export interface WorkerConfig {
  readonly host: string;
  readonly port: number;
  readonly networkId: "testnet";
  readonly databasePath: string;
  readonly studioDatabasePath: string;
  readonly workerApiToken: string | null;
  readonly nearAiBaseUrl: string;
  readonly nearAiApiKey: string | null;
  readonly nearAiModel: string | null;
}

export function readWorkerConfig(environment: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const networkId = environment.NEXT_PUBLIC_NEAR_NETWORK ?? "testnet";
  if (networkId !== "testnet") throw new Error("Worker supports testnet only");

  const port = Number.parseInt(environment.STUDIO_WORKER_PORT ?? environment.ROYALTYDESK_WORKER_PORT ?? "3101", 10);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) throw new Error("Invalid worker port");

  const workerApiToken = environment.STUDIO_WORKER_TOKEN ?? environment.ROYALTYDESK_WORKER_TOKEN ?? null;
  if (environment.NODE_ENV === "production" && (!workerApiToken || workerApiToken.length < 32)) throw new Error("STUDIO_WORKER_TOKEN must be configured with at least 32 characters in production");
  return { host: environment.STUDIO_WORKER_HOST ?? environment.ROYALTYDESK_WORKER_HOST ?? "127.0.0.1", port, networkId, databasePath: resolve(process.cwd(), "../..", environment.STUDIO_APP_DB_PATH ?? environment.ROYALTYDESK_DB_PATH ?? environment.ROYALTYDESK_DATABASE_PATH ?? "data/studio-app.sqlite"), studioDatabasePath: resolve(process.cwd(), "../..", environment.STUDIO_CATALOGUE_DB_PATH ?? "private/studio-v2/phase05/studio.sqlite"), workerApiToken, nearAiBaseUrl: environment.NEAR_AI_BASE_URL ?? "https://cloud-api.near.ai/v1", nearAiApiKey: environment.NEAR_AI_API_KEY ?? null, nearAiModel: environment.NEAR_AI_MODEL ?? null };
}
