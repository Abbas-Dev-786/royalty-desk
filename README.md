# Agent Music Studio

An AI music studio on NEAR testnet. Agents help create songs and albums, while the studio contract controls release approval, purchases, tips, and payouts.

## Run locally

Requires Node.js 24+ and npm 11.

```powershell
Copy-Item .env.example .env
npm ci
npm run dev:web
```

In a second terminal, start the worker:

```powershell
npm run dev:worker
```

Set the deployed testnet contract ID, provider credentials, and a private `STUDIO_WORKER_TOKEN` in `.env`. The web and worker processes share local SQLite databases and media storage. Keep `.env`, wallet keys, databases, and media outside Git.

## Build and deploy

`npm run build` builds the web app and checks the worker. Use `npm run start:web` and `npm run start:worker` to run the built app locally. The Render service in [`render.yaml`](render.yaml) starts both processes together and uses a persistent disk. See the [Render deployment guide](docs/RENDER_DEPLOYMENT.md) for configuration and optional import of an existing studio database.

The NEAR contract source is in [`contracts/studio`](contracts/studio). The deployed testnet contract ID is configured separately; building or running the web app does not deploy the contract.
