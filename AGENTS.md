# Repository Guidelines

## Project Structure & Module Organization

- `plan-v2/MASTER_PLAN.md`: current studio implementation sequence and verification gates.
- `plan-v2/phases/` and `plan-v2/ACCEPTANCE_MATRIX.md`: studio tasks and evidence mapping.
- `docs/`: product vision and technical decisions; older royalty-administration documents are historical context.
- `plans/`: historical RoyaltyDesk prototype plans and evidence, retained for audit and migration context.
- `HACKATHON.md`: event rules and submission constraints.
- `exa-results/`: research artifacts; do not treat them as product requirements.

The active code layout is `apps/web`, `apps/worker`, `contracts/studio`, `packages/domain`, `packages/chain`, `packages/persistence`, `fixtures/studio`, and `tests/studio`.

## Build, Test, and Development Commands

The root commands are:

- `npm ci`: install pinned workspace dependencies.
- `npm run check`: run formatting, linting, and type checks.
- `npm run build`: build web, worker, packages, and contract wrappers.
- `npm run test:studio-domain`: verify studio schemas, persistence, and integer money allocation.
- `npm run test:studio-sandbox`: exercise the compiled studio contract and NEAR receipt behavior.
- `npm run verify:studio`: run all required offline studio checks.

Missing or empty test suites must fail clearly rather than report success.

## Coding Style & Naming Conventions

Use TypeScript for applications/packages and Rust for the NEAR contract. Use two-space indentation in TypeScript/JSON and standard `rustfmt` output in Rust. Name TypeScript files `kebab-case.ts`, React components `PascalCase`, functions and variables `camelCase`, Rust modules/functions `snake_case`, and tests after stable case IDs such as `PAY-03` or `MAND-02`. Represent money as integer yoctoNEAR or validated decimal strings; never use floating-point arithmetic. Create proper files and folder structures. Follow industry level best coding practices. create proper files follow modularity. Do not write complete code in a single file. For typescript create proper types and do not use ANY type

## Testing Guidelines

Follow each studio phase file’s verification section and record actual results with `plan-v2/EVIDENCE_TEMPLATE.md`. Cover positive and rejection paths. Distinguish unit, sandbox, browser, and live-testnet evidence. Mocks cannot prove wallet authority, asynchronous transfers, or live NEAR AI inference. Never mark skipped checks as passed.

## Commit & Pull Request Guidelines

No Git history is present, so no repository convention can be inferred. Use short imperative commits, optionally with a scope, such as `contract: reject stale mandate epochs`. Pull requests should reference phase/task IDs, summarize behavior and trust-boundary changes, list exact verification commands, and include screenshots for UI changes. Call out deferred checks and security or accounting implications.

## Security & Configuration

Commit placeholder-only environment files. Never commit wallet keys, API keys, cookies, private statements, populated databases, or submission payloads. Preserve administrator approval boundaries, restricted agent keys, integer accounting, and retry-safe payment behavior defined in `plan-v2/MASTER_PLAN.md`.
