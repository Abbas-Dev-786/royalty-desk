export interface WorkerConfig {
  readonly host: string;
  readonly port: number;
  readonly networkId: "testnet";
  readonly contractId: string;
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

  return { host: environment.ROYALTYDESK_WORKER_HOST ?? "127.0.0.1", port, networkId, contractId };
}
