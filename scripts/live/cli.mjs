import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";

const nearBinary = process.env.NEAR_CLI_BINARY ?? (process.platform === "win32"
  ? join(dirname(process.execPath), "node_modules", "near-cli-rs", "node_modules", ".bin_real", "near.exe")
  : "near");

export function sendContractCall({ contractId, signerId, method, args, depositYocto = "0", accessKeyFile = null }) {
  const signing = accessKeyFile ? ["sign-with-access-key-file", accessKeyFile] : ["sign-with-keychain"];
  const cliArgs = [
    "contract", "call-function", "as-transaction", contractId, method,
    "base64-args", Buffer.from(JSON.stringify(args)).toString("base64"),
    "prepaid-gas", "100 Tgas", "attached-deposit", `${depositYocto} yoctoNEAR`,
    "sign-as", signerId, "network-config", "testnet", ...signing, "send"
  ];
  const result = spawnSync(nearBinary, cliArgs, { encoding: "utf8", windowsHide: true, maxBuffer: 2_000_000 });
  const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
  const transactionHash = output.match(/Transaction ID:\s*([1-9A-HJ-NP-Za-km-z]+)/)?.[1] ?? null;
  if (result.error || result.status !== 0 || !transactionHash) {
    throw new Error(`NEAR CLI ${method} did not confirm success: ${result.error?.message ?? output.slice(-1500)}`);
  }
  return transactionHash;
}
