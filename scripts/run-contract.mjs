import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const operation = process.argv[2] ?? "test";
const contractName = process.argv[3] ?? "studio";
const root = process.cwd();
const image = process.env.STUDIO_CONTRACT_IMAGE ?? "studio-contract-toolchain:dev";
if (contractName !== "studio") throw new Error("Unsupported contract name");
const lockfile = resolve(root, `contracts/${contractName}/Cargo.lock`);

if (!new Set(["test", "build"]).has(operation)) {
  console.error(`Unsupported contract operation: ${operation}. Use test or build.`);
  process.exit(2);
}

function run(command, args, options = {}) {
  return spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    ...options
  });
}

const daemonCheck = run("docker", ["info", "--format", "{{.ServerVersion}}"], { stdio: "ignore" });
if (daemonCheck.error || daemonCheck.status !== 0) {
  console.error("Docker daemon is unavailable. Start Docker Desktop with Linux containers enabled.");
  process.exit(2);
}

const imageCheck = run("docker", ["image", "inspect", image], { stdio: "ignore" });
if (imageCheck.status !== 0) {
  console.log(`Building ${image} ...`);
  const build = run("docker", [
    "build",
    "--file",
    "docker/contract-toolchain.Dockerfile",
    "--tag",
    image,
    "."
  ]);
  if (build.error || build.status !== 0) {
    console.error("Contract toolchain image build failed.");
    process.exit(build.status ?? 2);
  }
}

const cargoArgs = operation === "test"
  ? ["test"]
  : ["near", "build", "non-reproducible-wasm"];

if (operation === "test" && existsSync(lockfile)) cargoArgs.push("--locked");
if (operation === "test" && !existsSync(lockfile)) {
  console.warn("Cargo.lock is absent; running the first contract test without --locked to generate it.");
}

const result = run("docker", [
  "run",
  "--rm",
  "--mount",
  `type=bind,source=${root},target=/workspace`,
  "--mount",
  "type=volume,source=studio-cargo-registry,target=/usr/local/cargo/registry",
  "--mount",
  "type=volume,source=studio-cargo-git,target=/usr/local/cargo/git",
  "--workdir",
  `/workspace/contracts/${contractName}`,
  "--env",
  "CARGO_TERM_COLOR=always",
  image,
  "cargo",
  ...cargoArgs
]);

if (result.error || result.status !== 0) {
  console.error(`Contract ${operation} failed inside Docker.`);
  process.exit(result.status ?? 2);
}
