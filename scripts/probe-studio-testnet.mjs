const rpcUrl = process.env.NEAR_RPC_URL ?? "https://rpc.testnet.near.org";
const response = await fetch(rpcUrl, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: "studio-v2-probe", method: "status", params: [] }),
  signal: AbortSignal.timeout(10_000)
});
if (!response.ok) throw new Error(`NEAR RPC returned HTTP ${response.status}`);
const result = await response.json();
if (result?.result?.chain_id !== "testnet") throw new Error("NEAR RPC did not identify testnet");
process.stdout.write(JSON.stringify({ status: "ok", chainId: "testnet", latestBlockHeight: result.result.sync_info?.latest_block_height ?? null }) + "\n");
