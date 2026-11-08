import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const image = process.env.ROYALTYDESK_CONTRACT_IMAGE ?? "royaltydesk-contract-toolchain:dev";
const output = resolve(root, "contracts/royaltydesk/target/wasm32-unknown-unknown/release/royaltydesk_contract.wasm");

function run(args, options = {}) {
  return spawnSync("docker", args, { cwd: root, stdio: "inherit", shell: false, ...options });
}

const daemon = run(["info", "--format", "{{.ServerVersion}}"], { stdio: "ignore" });
if (daemon.error || daemon.status !== 0) {
  console.error("Docker daemon is unavailable. Start Docker Desktop with Linux containers enabled.");
  process.exit(2);
}

const imageCheck = run(["image", "inspect", image], { stdio: "ignore" });
if (imageCheck.status !== 0) {
  const build = run(["build", "--file", "docker/contract-toolchain.Dockerfile", "--tag", image, "."]);
  if (build.error || build.status !== 0) process.exit(build.status ?? 2);
}

const result = run([
  "run", "--rm",
  "--mount", `type=bind,source=${root},target=/workspace`,
  "--mount", "type=volume,source=royaltydesk-cargo-registry,target=/usr/local/cargo/registry",
  "--mount", "type=volume,source=royaltydesk-cargo-git,target=/usr/local/cargo/git",
  "--workdir", "/workspace/contracts/royaltydesk",
  "--env", "CARGO_TERM_COLOR=always",
  image,
  "cargo", "build", "--release", "--target", "wasm32-unknown-unknown", "--features", "fault-injection",
]);
if (result.error || result.status !== 0 || !existsSync(output)) {
  console.error("Fault-injection contract build failed.");
  process.exit(result.status ?? 2);
}
console.log(`Fault-injection WASM: ${output}`);
