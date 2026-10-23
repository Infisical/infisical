# AGENTS.md

Repository-wide guidance for coding agents working in Infisical. Packages and subsystems have their own `AGENTS.md` files. Read the ones that cover the code you are changing, starting from the table below.

## Essential Commands

- `make reviewable-api` / `make reviewable-ui` — lint:fix + type:check (run before PRs). Neither checks [`backend/CODE_QUALITY.md`](backend/CODE_QUALITY.md); review backend changes against it yourself.
- `cd backend && npm run migration:new` — create new DB migration
- `cd backend && npm run generate:schema` — regenerate Zod types from DB after migration changes
- `make test-api-unit` / `make test-api-e2e` — run the Node backend suites in the FIPS image CI uses, against a throwaway database. Narrow with `SPEC=<pattern>`. See `backend/AGENTS.md` for why running `npm run test:e2e` directly can destroy your dev data.
- `cd backend-go && make test` — run Go integration tests

Both backend and frontend use `@app/*` as path alias to `./src/*`.

## Repository Structure

Infisical is an open-source secret management platform. Each package below has its own `AGENTS.md`; read it before working there.

| Directory | What it is |
|---|---|
| [`backend/`](backend/AGENTS.md) | Fastify 4 API server, TypeScript, PostgreSQL via Knex, BullMQ queues. Its `AGENTS.md` links the subsystem files under `backend/src/`. |
| [`backend-go/`](backend-go/AGENTS.md) | Go API server (partial rewrite), chi + chita, raw pgx queries, same PostgreSQL database. |
| [`frontend/`](frontend/AGENTS.md) | React 19 SPA, Vite 8, TanStack Router + React Query, Tailwind CSS v4. |
| `wasm/<crate>/` | Rust crates compiled to WASM for the frontend, with bindings committed under `frontend/src/lib/<crate>/`. Run the rebuild command in the crate's `AGENTS.md` (e.g. [`wasm/ironrdp-decoder/AGENTS.md`](wasm/ironrdp-decoder/AGENTS.md)) after any change to its `src/` or `Cargo.toml`. |
| [`e2e/`](e2e/AGENTS.md) | Playwright suite against a deployed gamma; a failure blocks every prod deploy. Distinct from `backend/e2e-test/` (in-process Vitest). |
| [`tests/`](tests/AGENTS.md) | Go blackbox suite: a real Infisical in Docker, HTTP only, so it runs against the Node and Go servers unchanged. |
| [`docs/`](docs/AGENTS.md) | Mintlify documentation site, with its own Dockerfile. Reference it for up-to-date feature descriptions and API usage. |

Also at the root: `build-versions.env` (see Dependency Policy), `docker-compose.{dev,prod,bdd,e2e-dbs}.yml`, `Dockerfile.standalone-infisical` and its FIPS variant (see the self-hosting notes in `backend/AGENTS.md`), and `.github/` (CI workflows, PR template). Skills live in `.agents/skills/`: `docs-style` (any work under `docs/`) and `testing-secrets-ui` (end-to-end checks of the secrets UI).

### Dependency Policy

`build-versions.env` holds versions that several Dockerfiles install, currently the bundled
Infisical CLI. Each Dockerfile keeps a matching `ARG` default so external builders (Northflank,
Render, a plain `docker build`) work without passing anything, and CI and compose override it from
that file. `check-dockerfile-pins.yml` fails a PR when the defaults drift from it, so change the
file and the `ARG` defaults together.

Both `backend/` and `frontend/` enforce a minimum release age of 7 days for npm packages (configured via `.npmrc` in each directory). This means `npm install` will only resolve package versions published at least 7 days ago, as a supply-chain security measure.

## Cross-Cutting Patterns

### Backend Code Quality

**Read [`backend/CODE_QUALITY.md`](backend/CODE_QUALITY.md) for every backend change, and check the change against it before calling the work done.** This applies to all work under `backend/`: new features, refactors, bug fixes, and reviews alike. `backend/AGENTS.md` explains how to apply it.

### Code Comments

**Default to no comments.** One earns its place only by explaining *why*: a non-obvious constraint, a workaround, an ordering dependency, or logic that looks wrong until you know the reason.

Never write: narration restating the next line; section headers inside a function (`// --- validation ---`); change history (`// Added retry logic`, `// NEW`); references to plans, tickets, PRs, or reviewers; docstrings restating the signature; commented-out code.

Before finishing, delete any comment you added that only says what the code says.

### Product Analytics

Read [`ANALYTICS.md`](ANALYTICS.md) before adding or changing product analytics. Every event has one owning producer: the frontend records UI exposure and intent, the application backend records accepted commands it can establish, and the system of record records durable outcomes. Define stable dimensions, cardinality, firing conditions, and dashboard consumers before implementation.

### Design System & Voice

Read [`DESIGN.md`](DESIGN.md) before producing new UI or user-visible copy, and the [shared component lifecycle ledger](frontend/src/components/COMPONENT_LIFECYCLE.md) before changing a shared frontend component's lifecycle.

### Documentation

**Use the `docs-style` skill for any work under `docs/`** (`.agents/skills/docs-style/`), and read [`docs/AGENTS.md`](docs/AGENTS.md) for the review pass and `make lint-docs-branch`. If the user wrote or edited the docs prose themselves, don't just accept it. Tell them the `docs-style` skill can run the review pass over their changes, and offer to run it.

### Auth & Permissions

Auth modes (JWT, IDENTITY_ACCESS_TOKEN, SCIM_TOKEN) are extracted in `backend/src/server/plugins/auth/`. Authorization uses CASL (`@casl/ability`) with project-level and org-level permission checks — see `backend/AGENTS.md` for backend details and `frontend/AGENTS.md` for frontend permission hooks/HOCs. Note: `API_KEY` and `SERVICE_TOKEN` auth modes are deprecated — do not use them in new code.

### Org-Scoped Products

PAM and Agent Vault are products over one implicit project per organization, not projects a user creates. Their URLs are `/organizations/$orgId/<product>/…` with no `$projectId`, the frontend resolves the project from the org (`useImplicitProjectId`), the backend bootstraps it lazily and blocks generic create and delete, their roles are admin or member only, and each has its own metered identities dimension (`pam_identities`, `agent_vault_identities`). When you add a `ProjectType.PAM` arm anywhere, add the Agent Vault arm beside it. See `backend/src/ee/services/pam/AGENTS.md` and `backend/src/ee/services/agent-vault/AGENTS.md`.

### Single-Project Products

Secret Scanning has one active project per organization (the newest). Like Certificate Manager, its URLs are `/organizations/$orgId/secret-scanning/…` with no `$projectId`; legacy orgs can still hold several projects, so the frontend pins the one being viewed (see `frontend/AGENTS.md`). New orgs and sub-orgs get it at creation (`bootstrapSecretScanningProject`), older orgs lazily from `GET /api/v2/secret-scanning/project`, and `projectId` is optional on its API (`inject-secret-scanning-project-id`). Do not add a project picker or a way to create more Secret Scanning projects.

### Shared Backend Modules

Alerting (`backend/src/services/alert/`) and approvals (`backend/src/services/approval-policy/`) are shared modules. Do not stand up a per-product alert or approval service; see [`backend/AGENTS.md`](backend/AGENTS.md) for how to plug into each, including the rule that deleting an alertable resource must reap its alerts.

### Object Storage

New product files go to S3 through `backend/src/services/object-storage/`, not a product's own S3 client (PAM
recordings predate it and haven't moved). A product
registers a namespace (record-first path like `sessions/{sessionId}/logs/{file}`, checked for naming collisions at
boot) and the layer builds org-first keys, signs links, and applies the retention tag and, for default storage on Infisical Cloud, a daily upload cap. Storage is
`default` (the instance's bucket, `OBJECT_STORAGE_S3_*`) or `external` (the customer's, through an AWS connection);
use those two words everywhere.

## Issue and PR Guidelines

- Never create a GitHub issue.
- When creating a pull request, use and fully complete the repository's
  `.github/pull_request_template.md` template.

## Workflow Guardrails

- Do not reformat existing code as incidental cleanup. Preserve the repository's current formatting unless a review agent, CI check, or user explicitly asks for a formatting change.
- Never push changes to `license-fns` or local UI fixtures to a remote branch. Those edits are local-only support for review and test passes; keep them out of commits and pull requests.
- When resolving merge conflicts, optimize for a correct, minimal, strategically unblocking resolution. Do not let a slow or stalled local check block the push when the corresponding frontend or backend CI checks on GitHub can validate the branch; push the resolved code and use CI to complete the expensive verification.

## Wiring a New Full-Stack Feature

1. **Backend**: Create service module, migration, wire DI, add routes. See the checklist in `backend/AGENTS.md`
2. **Frontend**: Add API hooks in `src/hooks/api/<domain>/`, create page/view, wire route. See `frontend/AGENTS.md` for routing and component patterns
3. Check the backend work against [`backend/CODE_QUALITY.md`](backend/CODE_QUALITY.md)
4. Run `make reviewable-api` and `make reviewable-ui` before submitting

## Keeping AGENTS.md Files Up to Date

When a change adds a service, a pattern, or an invariant an agent would otherwise get wrong, update the `AGENTS.md` closest to that code. Put cross-cutting rules here, package rules in the package file, and subsystem detail in a file next to the subsystem's code, then link it from its package's `AGENTS.md`. Add a `CLAUDE.md` beside every new `AGENTS.md` that holds only the `@AGENTS.md` import: once the root `CLAUDE.md` exists, Claude Code reads only `CLAUDE.md` files, so a nested `AGENTS.md` without that pointer never loads for it. Keep each file a map rather than a spec: concepts, where things live, and non-obvious invariants. Leave signatures, field lists, and step-by-step mechanics to the code.
