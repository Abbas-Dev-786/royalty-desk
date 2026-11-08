# Repository Guidelines

## Project Structure & Module Organization

- `docs/`: product requirements, current scope, feature catalogue, technical design, and future scope.
- `plans/MASTER_IMPLEMENTATION_PLAN.md`: authoritative implementation sequence and harness instructions.
- `plans/phases/`: detailed phase plans with dependencies, tasks, verification, and exit criteria.
- `plans/ACCEPTANCE_MATRIX.md`: feature-to-evidence mapping.
- `HACKATHON.md`: event rules and submission constraints.
- `exa-results/`: research artifacts; do not treat them as product requirements.

The planned code layout is `apps/web`, `apps/worker`, `contracts/royaltydesk`, `packages/domain`, `packages/chain`, `packages/persistence`, `fixtures`, and `tests`.

## Build, Test, and Development Commands

No build system exists yet. Phase 00 must create and validate the root commands before contributors rely on them. Planned commands include:

- `npm ci`: install pinned workspace dependencies.
- `npm run check`: run formatting, linting, and type checks.
- `npm run build`: build web, worker, packages, and contract wrappers.
- `npm run test:domain`: verify schemas, canonicalization, CSV parsing, and money allocation.
- `npm run test:sandbox`: exercise compiled contracts and NEAR receipt behavior.
- `npm run verify:release`: run all required offline release checks.

Missing or empty test suites must fail clearly rather than report success.

## Coding Style & Naming Conventions

Use TypeScript for applications/packages and Rust for the NEAR contract. Use two-space indentation in TypeScript/JSON and standard `rustfmt` output in Rust. Name TypeScript files `kebab-case.ts`, React components `PascalCase`, functions and variables `camelCase`, Rust modules/functions `snake_case`, and tests after stable case IDs such as `PAY-03` or `MAND-02`. Represent money as integer yoctoNEAR or validated decimal strings; never use floating-point arithmetic. Create proper files and folder structures. Follow industry level best coding practices. create proper files follow modularity. Do not write complete code in a single file. For typescript create proper types and do not use ANY type

## Testing Guidelines

Follow each phase file’s verification section and record actual results with `plans/EVIDENCE_TEMPLATE.md`. Cover positive and rejection paths. Distinguish unit, sandbox, browser, and live-testnet evidence. Mocks cannot prove wallet authority, asynchronous transfers, or live NEAR AI inference. Never mark skipped checks as passed.

## Commit & Pull Request Guidelines

No Git history is present, so no repository convention can be inferred. Use short imperative commits, optionally with a scope, such as `contract: reject stale mandate epochs`. Pull requests should reference phase/task IDs, summarize behavior and trust-boundary changes, list exact verification commands, and include screenshots for UI changes. Call out deferred checks and security or accounting implications.

## Security & Configuration

Commit placeholder-only environment files. Never commit wallet keys, API keys, cookies, private statements, populated databases, or submission payloads. Preserve owner approval boundaries, restricted agent keys, integer accounting, and retry-safe payment behavior defined in `docs/TECHNICAL_DESIGN.md`.
