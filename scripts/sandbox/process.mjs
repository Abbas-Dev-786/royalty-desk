import { spawn, spawnSync } from "node:child_process";

const useDocker = process.platform === "win32" || process.env.STUDIO_SANDBOX_DOCKER === "1" || process.env.ROYALTYDESK_SANDBOX_DOCKER === "1";
const command = useDocker ? (process.platform === "win32" ? "docker.exe" : "docker") : "npx";
const sandboxImage = "nearprotocol/sandbox:2.13.1";

function dockerArgs(home, subcommand, containerName) {
  const runArgs = subcommand === "run" ? "run --rpc-addr 0.0.0.0:3030" : "init --fast";
  const commandText = [
    "set -eu",
    'BIN="$(command -v near-sandbox || true)"',
    'if [ -z "$BIN" ]; then BIN="$(find / -type f -name near-sandbox -perm -111 2>/dev/null | head -n 1)"; fi',
    'if [ -z "$BIN" ]; then echo "near-sandbox binary not found in official image" >&2; exit 127; fi',
    `exec "$BIN" --home /sandbox ${runArgs}`,
  ].join("; ");
  const args = ["run", "--rm", "--pull=missing"];
  if (containerName) {
    args.push("--name", containerName, "-p", "3030:3030");
  }
  args.push("--mount", `type=bind,source=${home},target=/sandbox`, "--entrypoint", "/bin/sh", sandboxImage, "-lc", commandText);
  return args;
}

function sandboxArgs(home, subcommand) {
  if (useDocker) {
    return dockerArgs(home, subcommand);
  }
  if (process.platform !== "win32") {
    return ["--yes", "near-sandbox", "--home", home, subcommand];
  }
}

export function runSandboxCommand(home, subcommand) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, sandboxArgs(home, subcommand), {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.once("error", reject);
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`near-sandbox ${subcommand} timed out while invoking npx`));
    }, 120_000);
    child.once("exit", (code) => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`near-sandbox ${subcommand} failed (${code}): ${stderr || stdout}`));
    });
  });
}

export async function startSandbox(home) {
  const containerName = useDocker ? `studio-sandbox-${Date.now()}` : undefined;
  const child = spawn(command, useDocker ? dockerArgs(home, "run", containerName) : sandboxArgs(home, "run"), {
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
  });
  const handle = { child, containerName };
  let output = "";
  const timeout = setTimeout(() => stopSandbox(handle), 120_000);
  child.stdout.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.stderr.on("data", (chunk) => {
    output += chunk.toString();
  });
  child.once("error", (error) => {
    output += `\n${error.message}`;
  });

  try {
    await waitForRpc(child, () => output);
  } finally {
    clearTimeout(timeout);
  }
  return handle;
}

async function waitForRpc(child, getOutput) {
  const deadline = Date.now() + 90_000;
  let lastError = "";
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`near-sandbox exited before RPC became ready: ${getOutput()}`);
    }
    try {
      const response = await fetch("http://127.0.0.1:3030/status");
      if (response.ok) {
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`timed out waiting for sandbox RPC (${lastError}): ${getOutput()}`);
}

export function stopSandbox(child) {
  if (child?.containerName) {
    spawnSync("docker.exe", ["stop", child.containerName], {
      stdio: "ignore",
      windowsHide: true,
    });
  }
  if (child?.child && child.child.exitCode === null) {
    if (process.platform === "win32" && child.child.pid) {
      spawnSync("taskkill", ["/pid", String(child.child.pid), "/t", "/f"], {
        stdio: "ignore",
        windowsHide: true,
      });
    } else {
      child.child.kill();
    }
  }
}
