# RoyaltyDesk Setup

This project is currently testnet-only. The recommended Windows workflow is to run the Rust/NEAR toolchain inside WSL2 Ubuntu and keep Node.js commands in either WSL2 or PowerShell. Do not use mainnet accounts or real funds during development.

## 1. Prerequisites

- Node.js 24 or newer. The repository uses built-in SQLite and direct TypeScript execution.
- npm 11 and network access to npmjs.org, crates.io, GitHub, the NEAR RPC, and `cloud-api.near.ai`.
- WSL2 Ubuntu on Windows. Native PowerShell is fine for Node-only checks, but WSL2 avoids Rust, sandbox, and keychain issues.

If WSL2 is not installed, an administrator can run `wsl --install -d Ubuntu`, then restart Windows and open Ubuntu.

### Hybrid Docker setup (Node on host, Rust in Docker)

This is the recommended option when Node.js is already installed but Rust must not be installed on Windows. Keep all JavaScript commands on the host. Use Docker only for Rust, `cargo-near`, NEAR CLI, contract compilation, and contract tests. Install Docker Desktop with Linux containers enabled and make sure the Docker daemon is running. The repository includes `docker/contract-toolchain.Dockerfile` for Rust builds; the sandbox uses an official image:

```powershell
# Node checks remain on the host
npm install
npm run check:offline
npm run test:domain
npm run test:server
```

For contract work, the repository wrapper now builds the Rust image automatically and runs the contract command inside it:

```powershell
npm run test:contract
```

The first run downloads the toolchain image and dependencies. Subsequent runs reuse the image and named Cargo cache volumes. To build the contract WASM through the same Docker path:

```powershell
npm run build
```

If you need to enter the container manually, use:

```bash
docker run --rm -it -v "$PWD:/workspace" -w /workspace rust:latest bash
apt-get update && apt-get install -y pkg-config libssl-dev clang curl
rustup target add wasm32-unknown-unknown
cargo install cargo-near --version 0.21.1 --locked
curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/near-cli-rs/releases/latest/download/near-cli-rs-installer.sh | sh
cd /workspace/contracts/royaltydesk
cargo test
cargo near build non-reproducible-wasm
```

The mounted repository keeps the generated WASM under `contracts/royaltydesk/target`. Expose port `3030` when running the sandbox. Mount a persistent credentials directory if using the CLI, and pass `.env` values at runtime; never bake wallet keys or API keys into an image.

The TypeScript workspace build steps intentionally run strict no-emit compilation because the worker and packages execute their `.ts` sources directly during this early phase. The web workspace still produces the Next.js production output, and the contract workspace produces the WASM artifact.

## 2. Install JavaScript dependencies

From the repository root:

```powershell
Copy-Item .env.example .env
npm install
```

The first `npm install` creates the lockfile. Use `npm ci` for subsequent clean installs. Populate `.env` with local values only; never commit it.

Run the currently available offline checks:

```powershell
npm run check:offline
npm run test:domain
npm run test:server
```

## 3. Install Rust and NEAR tooling (WSL2)

Inside Ubuntu, from `/mnt/c/Users/abbas/Desktop/NEAR`:

```bash
sudo apt update
sudo apt install -y build-essential pkg-config libssl-dev curl git clang

curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"
rustup target add wasm32-unknown-unknown

curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/near/near-cli-rs/releases/latest/download/near-cli-rs-installer.sh | sh
cargo install cargo-near --version 0.21.1 --locked

near --version
cargo near --version
```

These commands follow the NEAR smart-contract quickstart. The existing contract is already in `contracts/royaltydesk`; do not scaffold a second project over it.

## 4. Build and test the contract

```bash
cd contracts/royaltydesk
cargo test
cargo near build non-reproducible-wasm
find target/near -name '*.wasm' -maxdepth 1 -print
cd ../..
```

`npm run test:contract` runs Cargo through the Docker wrapper. `npm run test:sandbox` starts a disposable official `near-sandbox` node, deploys the compiled probe contract, and exercises the restricted agent-key matrix. On Linux it invokes `near-sandbox` directly. On Windows, the harness runs NEAR's official Linux sandbox image inside Docker and exposes RPC at `127.0.0.1:3030`; Docker Desktop must be running.

The Windows harness uses NEAR's official `nearprotocol/sandbox:2.13.1` image. The image contains the Linux sandbox binary directly; no Node runtime or Rust toolchain is needed inside the sandbox container. The RoyaltyDesk contract still executes as WASM inside that local NEAR node.

## 5. Run a local NEAR sandbox

The sandbox is a private local NEAR blockchain used to prove contract behavior without testnet funds. Phase 00 uses it to deploy the probe WASM and verify real access-key restrictions, predecessor identity, receiver/method allowlists, and transaction failures. It is not the production network and does not replace testnet verification.

The automated harness uses the official sandbox package. To inspect or run the node manually on Linux/WSL:

```bash
npx near-sandbox --home /tmp/near-sandbox init
npx near-sandbox --home /tmp/near-sandbox run
```

Keep this process running. The local RPC is `http://127.0.0.1:3030`. The sandbox guide also documents importing its `test.near` key into `near-cli-rs` when CLI-driven local calls are needed.

With the compiled WASM present at `contracts/royaltydesk/target/near/royaltydesk_contract.wasm`, run `npm run test:sandbox` from the repository root. The command creates temporary accounts and keys, prints only sanitized account/permission metadata, and removes the sandbox home after completion. On Windows this command is the recommended path; do not invoke `npx near-sandbox` directly because its native package currently rejects `Windows_NT-x64`.

## 6. Create a testnet account and deploy

The live run needs a unique contract account ending in `.testnet`, controlled by your local NEAR CLI keychain. Keep its key on your machine. The contract's `operator_id` is that same account for this prototype. The compiled artifact is `contracts/royaltydesk/target/near/royaltydesk_contract.wasm`; run `npm run build` first.

If the account already exists but NEAR CLI reports no local access key, use the interactive `near account import-account using-seed-phrase` or `using-private-key` flow in your own terminal, select `testnet`, and save to the OS keychain. Enter the secret only at the CLI prompt, never in chat, a command argument, or a committed file. Confirm the imported public key appears in `near account list-keys <account.testnet> network-config testnet now` before deploying. The default CLI web-wallet login currently points to MyNearWallet, which may reject new app connections; do not assume its printed login URL authorized a key.

On Windows PowerShell, after installing the current NEAR CLI, replace the account name and run:

```powershell
$contractAccount = "your-unique-royaltydesk.testnet"
near account create-account sponsor-by-faucet-service $contractAccount autogenerate-new-keypair save-to-keychain network-config testnet create
near account view-account-summary $contractAccount network-config testnet now
$initArgs = '{"network_id":"testnet","operator_id":"' + $contractAccount + '"}'
near contract deploy $contractAccount use-file ./contracts/royaltydesk/target/near/royaltydesk_contract.wasm with-init-call new json-args $initArgs prepaid-gas '100 Tgas' attached-deposit '0 NEAR' network-config testnet sign-with-keychain send
near contract call-function as-read-only $contractAccount health base64-args e30= network-config testnet now
```

To upgrade an initialized contract, build the new WASM, confirm its state layout is compatible, and deploy without an init call. The existing account ID stays in `NEXT_PUBLIC_CONTRACT_ID`:

```powershell
npm run verify:release
near contract deploy $contractAccount use-file ./contracts/royaltydesk/target/near/royaltydesk_contract.wasm without-init-call network-config testnet sign-with-keychain send
npm run verify:deployment -- <upgrade-transaction-hash> --upgrade
npm run release:manifest
```

The upgrade verifier requires a finalized deployment transaction with no function call and an on-chain WASM hash matching the local build. Recheck representative releases and settlements after deployment.

If the OS keychain is unavailable, the CLI supports `save-to-legacy-keychain` and `sign-with-legacy-keychain`; keep the resulting credential directory private. Save the account ID and the deployment transaction hash, then set `NEXT_PUBLIC_CONTRACT_ID` in the ignored root `.env` to the deployed account. The browser journey also needs three distinct owner wallet accounts, one funder wallet account (the administrator may also fund), and a separate agent account with a restricted function-call key for delegated action evidence. Never send wallet keys or NEAR AI API keys through chat.

For Bash with the legacy keychain, the equivalent account creation and separate deploy/initialize sequence is:

```bash
near account create-account sponsor-by-faucet-service royaltydesk-dev.testnet \
  autogenerate-new-keypair save-to-legacy-keychain \
  network-config testnet create
near account view-account-summary royaltydesk-dev.testnet network-config testnet now
```

Deploy the WASM produced in step 4. Replace the file path if the build printed a different filename:

```bash
near contract deploy royaltydesk-dev.testnet \
  use-file ./contracts/royaltydesk/target/near/royaltydesk_contract.wasm \
  without-init-call network-config testnet \
  sign-with-legacy-keychain send
```

Initialize the current RoyaltyDesk contract:

```bash
near contract call-function as-transaction royaltydesk-dev.testnet new \
  json-args '{"network_id":"testnet","operator_id":"royaltydesk-dev.testnet"}' \
  prepaid-gas '100 Tgas' attached-deposit '0 NEAR' \
  sign-as royaltydesk-dev.testnet network-config testnet \
  sign-with-legacy-keychain send
near contract call-function as-read-only royaltydesk-dev.testnet health \
  base64-args e30= network-config testnet now
```

Record the account ID, WASM hash, and transaction hashes in `plans/evidence/PHASE_00.md`; never record private keys.

## 7. Wallet and NEAR AI checks

Start the web app after dependencies are installed:

```powershell
$env:NEXT_PUBLIC_CONTRACT_ID = "royaltydesk-dev.testnet"
npm run dev:web
```

Open `http://localhost:3000` and run the testnet wallet signature probe with a wallet that supports NEP-413 message signing. The wallet probe signs a challenge that the server verifies before creating an application session.

For Phase 00 evidence, record the wallet/network selected, whether the signing prompt appeared, and whether the request was approved or declined. Do not record the signed payload, cookies, or wallet keys. A source-level probe or mocked wallet is not browser evidence.

For the live NEAR AI probe, obtain a Cloud API key, select a model returned by `GET https://cloud-api.near.ai/v1/models`, then set:

```powershell
$env:NEAR_AI_BASE_URL = "https://cloud-api.near.ai/v1"
$env:NEAR_AI_API_KEY = "replace-me"
$env:NEAR_AI_MODEL = "replace-with-supported-model"
npm run test:live
```

`npm run test:live` automatically loads the repository-root `.env` file on Node 20.6+. PowerShell variables override values from that file when both are present.

Do not expose the API key with a `NEXT_PUBLIC_` variable.

## 8. Full verification target

After the Rust toolchain, npm registry access, testnet account, and NEAR AI credentials are available, run `npm run check`, `npm run build`, `npm run test:contract`, the sandbox tests, and `npm run test:live`. Update the phase evidence with exact command output and any skipped checks.

### Official references

- [NEAR smart-contract quickstart](https://docs.near.org/smart-contracts/quickstart)
- [NEAR CLI reference](https://docs.near.org/tools/cli)
- [Local sandbox guide](https://docs.near.org/web3-apps/tutorials/localnet/run)
- [Wallet login and NEP-413 verification](https://docs.near.org/web3-apps/tutorials/wallet-login)
