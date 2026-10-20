# AGENTS.md

Repository-wide guidance for coding agents working in Infisical. Packages and subsystems have their own `AGENTS.md` files, listed in [Where guidance lives](#where-guidance-lives). Read the ones that cover the code you are changing.

## Essential Commands

- `make reviewable-api` / `make reviewable-ui` — lint:fix + type:check (run before PRs). Neither checks [`backend/CODE_QUALITY.md`](backend/CODE_QUALITY.md); review backend changes against it yourself.
- `cd backend && npm run migration:new` — create new DB migration
- `cd backend && npm run generate:schema` — regenerate Zod types from DB after migration changes
- `make test-api-unit` / `make test-api-e2e` — run the Node backend suites in the FIPS image CI uses, against a throwaway database. Narrow with `SPEC=<pattern>`. See `backend/AGENTS.md` for why running `npm run test:e2e` directly can destroy your dev data.
- `cd backend-go && make test` — run Go integration tests

Both backend and frontend use `@app/*` as path alias to `./src/*`.

## Repository Structure

Infisical is an open-source secret management platform. Monorepo layout:

```
infisical/
├── backend/               # Fastify 4 API server (see backend/AGENTS.md)
├── backend-go/            # Go API server — partial rewrite (see backend-go/AGENTS.md)
├── frontend/              # React 19 SPA (see frontend/AGENTS.md)
├── wasm/                  # Rust crates compiled to WASM for the frontend (see wasm/<crate>/AGENTS.md)
├── e2e/                   # External Playwright suite — gates prod deploys against gamma (see e2e/AGENTS.md)
├── tests/                 # Go blackbox suite — real containers, HTTP only (see tests/AGENTS.md)
├── docs/                  # Documentation site (Mintlify-based)
├── build-versions.env            # Versions pinned across several Dockerfiles (see Dependency Policy)
├── docker-compose.dev.yml        # Local dev (PostgreSQL, Redis, backend, frontend, Nginx)
├── docker-compose.prod.yml       # Production deployment stack
├── docker-compose.bdd.yml        # BDD testing environment
├── docker-compose.e2e-dbs.yml    # E2E test databases (Oracle, SAP, Snowflake, etc.)
├── Dockerfile.standalone-infisical       # Standalone image (frontend + backend)
├── Dockerfile.fips.standalone-infisical  # FIPS-compliant standalone image
├── .github/               # CI workflows, PR template
└── AGENTS.md               # This file
```

- **`backend/`** — Fastify 4 API server, TypeScript, PostgreSQL via Knex, BullMQ queues. See [`backend/AGENTS.md`](backend/AGENTS.md) for architecture, patterns, and commands.
- **`backend-go/`** — Go API server (partial rewrite), chi + chita framework, raw pgx queries, same PostgreSQL database. See [`backend-go/AGENTS.md`](backend-go/AGENTS.md) for architecture, patterns, and commands.
- **`frontend/`** — React 19 SPA, Vite 8, TanStack Router + React Query, Tailwind CSS v4. See [`frontend/AGENTS.md`](frontend/AGENTS.md) for architecture, patterns, and commands.
- **`wasm/`** — Rust crates that compile to WASM for the frontend. Generated bindings are committed under `frontend/src/lib/<crate>/` so the frontend builds without a Rust toolchain. Each crate has its own `AGENTS.md` with the rebuild command (e.g. [`wasm/ironrdp-decoder/AGENTS.md`](wasm/ironrdp-decoder/AGENTS.md)) — run it after any change to that crate's `src/` or `Cargo.toml` so source and bindings stay in sync.
- **`docs/`** — Product documentation site. Has its own Dockerfile for building. Reference docs for up-to-date feature descriptions and API usage.
- **`e2e/`** — Playwright suite that runs against a deployed environment (gamma) between deploy and prod promotion. Distinct from `backend/e2e-test/` (in-process Vitest). Failure blocks every prod-deploy job. Covers SCIM + SAML flows (SP-initiated, IdP-initiated, deactivation, response rejection) against a mock IdP we control — see [`e2e/AGENTS.md`](e2e/AGENTS.md) for the harness and the one-time gamma bootstrap.

- **`tests/`** — Go blackbox suite. Boots a real Infisical in Docker and talks to it over HTTP only, so the same tests run against the Node and Go servers unchanged. Distinct from `backend/e2e-test/` (in-process Vitest, compiled against the Node source) and from `e2e/` (Playwright against a deployed gamma). `make test-suites` from `tests/` runs everything; see [`tests/AGENTS.md`](tests/AGENTS.md) before writing one.

Enterprise features live in `backend/src/ee/` (services and routes), registered before community routes so they can override/extend them.

### Self-Hosted Deployment

Infisical supports self-hosted deployment via Docker. Key considerations:
- **`Dockerfile.standalone-infisical`** — single-container image with both frontend and backend; used for simple deployments.
- **`Dockerfile.fips.standalone-infisical`** — FIPS 140-2 compliant variant for regulated environments. Be strict about not introducing dependencies that break FIPS compliance.
- **`docker-compose.prod.yml`** — production compose with backend, PostgreSQL, and Redis.
- New backend dependencies should be evaluated carefully — they affect container size, FIPS compliance, and the encryption boundary. Check `docs/` for self-hosted deployment documentation when in doubt.

### Dependency Policy

`build-versions.env` holds versions that several Dockerfiles install, currently the bundled
Infisical CLI. Each Dockerfile keeps a matching `ARG` default so external builders (Northflank,
Render, a plain `docker build`) work without passing anything, and CI and compose override it from
that file. `check-dockerfile-pins.yml` fails a PR when the defaults drift from it, so change the
file and the `ARG` defaults together.

Both `backend/` and `frontend/` enforce a minimum release age of 7 days for npm packages (configured via `.npmrc` in each directory). This means `npm install` will only resolve package versions published at least 7 days ago, as a supply-chain security measure.

The backend installs with the npm bundled in Node 26 (11.x), which skips dependency install scripts unless `allowScripts` in `backend/package.json` approves them. The install still succeeds when a script is skipped, so a native addon that was not approved fails only when it is first `require`d. When adding or bumping a dependency with an install script, run `npm install-scripts ls` and approve or deny what it lists (`npm install-scripts approve <pkg>`).

## Where guidance lives

Agents that load `AGENTS.md` files only for the directories they work in will not see a nested file until they open code under it. Use this table to find the one that applies.

| Area | Read |
|---|---|
| Node backend: commands, testing, architecture, wiring | [`backend/AGENTS.md`](backend/AGENTS.md) |
| Backend minimum quality bar, for every backend change | [`backend/CODE_QUALITY.md`](backend/CODE_QUALITY.md) |
| Alerting (shared module) | [`backend/src/services/alert/AGENTS.md`](backend/src/services/alert/AGENTS.md) |
| Event outbox | [`backend/src/services/event-outbox/AGENTS.md`](backend/src/services/event-outbox/AGENTS.md) |
| Permissions (CASL) | [`backend/src/ee/services/permission/AGENTS.md`](backend/src/ee/services/permission/AGENTS.md) |
| Delegated OAuth tokens | [`backend/src/services/oauth-client/AGENTS.md`](backend/src/services/oauth-client/AGENTS.md) |
| Provisioning identifiers and IdP profile sync | [`backend/src/services/user-alias/AGENTS.md`](backend/src/services/user-alias/AGENTS.md) |
| Scheduled jobs (cron manager) | [`backend/src/lib/cron/AGENTS.md`](backend/src/lib/cron/AGENTS.md) |
| Audit log storage and event classes | [`backend/src/ee/services/audit-log/AGENTS.md`](backend/src/ee/services/audit-log/AGENTS.md) |
| OpenTelemetry metrics | [`backend/src/lib/telemetry/AGENTS.md`](backend/src/lib/telemetry/AGENTS.md) |
| PostHog product analytics (backend) | [`backend/src/services/telemetry/AGENTS.md`](backend/src/services/telemetry/AGENTS.md) and [`ANALYTICS.md`](ANALYTICS.md) |
| Internal CA revocation (CRL, OCSP) and key sources | [`backend/src/services/certificate-authority/AGENTS.md`](backend/src/services/certificate-authority/AGENTS.md) |
| Instance root encryption key | [`backend/src/services/kms/AGENTS.md`](backend/src/services/kms/AGENTS.md) |
| PAM backend | [`backend/src/ee/services/pam/AGENTS.md`](backend/src/ee/services/pam/AGENTS.md) |
| Agent Vault backend | [`backend/src/ee/services/agent-vault/AGENTS.md`](backend/src/ee/services/agent-vault/AGENTS.md) |
| Go backend | [`backend-go/AGENTS.md`](backend-go/AGENTS.md) |
| Frontend | [`frontend/AGENTS.md`](frontend/AGENTS.md) |
| UI design system and product voice | [`DESIGN.md`](DESIGN.md) |
| Shared frontend component deprecations | [`frontend/src/components/COMPONENT_LIFECYCLE.md`](frontend/src/components/COMPONENT_LIFECYCLE.md) |
| WASM crates | `wasm/<crate>/AGENTS.md`, for example [`wasm/ironrdp-decoder/AGENTS.md`](wasm/ironrdp-decoder/AGENTS.md) |
| Playwright suite against gamma | [`e2e/AGENTS.md`](e2e/AGENTS.md) |
| Go blackbox API suite | [`tests/AGENTS.md`](tests/AGENTS.md) |
| Documentation | the `docs-style` skill and [`docs/STYLE_GUIDE.md`](docs/STYLE_GUIDE.md) |

Skills live in `.agents/skills/`: `docs-style` (any work under `docs/`) and `testing-secrets-ui` (end-to-end checks of the secrets UI).

## Backend Code Quality

**Read [`backend/CODE_QUALITY.md`](backend/CODE_QUALITY.md) for every backend change, and check the change against it before calling the work done.** This applies to all work under `backend/`: new features, refactors, bug fixes, and reviews alike.

It is a floor, not an exhaustive standard: user-understandable error messages and no pointless 500s, explicit validation on every API input, correct pagination when calling third-party APIs, avoiding deadlock conditions on a small connection pool (thread `tx`, keep transactions short), REST-aligned API interfaces, and audit log events an admin can actually read.

That list describes what the guide currently covers; it is **not** a test for whether the guide applies. Do not skip it because a change does not look like one of those topics. Read it, then decide which items are relevant.

Some of it needs judgment rather than a mechanical check. The deadlock rules cannot be caught by testing one request at a time. And a design that breaks REST should be raised with the author, with the conforming alternative proposed, rather than implemented silently or quietly "fixed" (some deviations are deliberate).

## Cross-Cutting Patterns

### Code Comments

**Default to no comments.** One earns its place only by explaining *why*: a non-obvious constraint, a workaround, an ordering dependency, or logic that looks wrong until you know the reason.

Never write: narration restating the next line; section headers inside a function (`// --- validation ---`); change history (`// Added retry logic`, `// NEW`); references to plans, tickets, PRs, or reviewers; docstrings restating the signature; commented-out code.

Before finishing, delete any comment you added that only says what the code says.

### Product Analytics

Read [`ANALYTICS.md`](ANALYTICS.md) before adding or changing product analytics. Every event has one owning producer: the frontend records UI exposure and intent, the application backend records accepted commands it can establish, and the system of record records durable outcomes. Define stable dimensions, cardinality, firing conditions, and dashboard consumers before implementation.

### Design System & Voice

The v3 visual system (colors, typography, components, layout) and product voice/content tone are documented in [`DESIGN.md`](DESIGN.md). Read it before producing new UI or user-visible copy. Before changing a shared frontend component's lifecycle, read the [shared component lifecycle ledger](frontend/src/components/COMPONENT_LIFECYCLE.md) for current deprecations, blockers, and replacement decisions. Frontend conventions, including inline creation in entity pickers, are in [`frontend/AGENTS.md`](frontend/AGENTS.md).

### Documentation

**Use the `docs-style` skill for any work under `docs/`** (`.agents/skills/docs-style/`). It carries the procedure for the [Documentation Style Guide](docs/STYLE_GUIDE.md): what belongs on a page, and the sentence-level review pass Vale cannot check.

If the user wrote or edited the docs prose themselves, don't just accept it. Tell them the `docs-style` skill can run the review pass over their changes, and offer to run it.

The style guide covers writing for users (not implementers), Mintlify component usage, cross-referencing, page structure, the sentence-level writing rules in section 5, and the bolding and UI conventions in section 11.

Run `make lint-docs-branch` after any change under `docs/`. It runs [Vale](https://vale.sh) over the docs and enforces the mechanical half of the style guide: sentence case in headings and frontmatter titles, product and vendor spellings, spelling against a curated vocabulary, `$` prompts in code blocks, and em dash density. See [docs/CONTRIBUTING.MD](docs/CONTRIBUTING.MD) for how to extend the vocabulary or suppress a rule. It lints only the `.mdx` files the branch touched; `make lint-docs` checks every page. The `Check docs style` GitHub workflow runs that same script, so local and CI agree by construction. Every rule except `Infisical.EmDashes` reports at error level, including `Infisical.UIActions` (click/tap where the verb should be select) and `Infisical.Contractions`, so the run fails if either one reports a finding. `Infisical.EmDashes` reports at warning level and never changes the exit code -- read the printed output, not just the status. Note that Vale cannot see prose indented four or more spaces inside components -- roughly half of this repo -- and reports nothing about what it skipped, so a clean run does not mean a nested page was checked. A clean run is not a substitute for reading the guide: the judgment calls it cannot check are the ones that matter most.

### Auth & Permissions

Auth modes (JWT, IDENTITY_ACCESS_TOKEN, SCIM_TOKEN) are extracted in `backend/src/server/plugins/auth/`. Authorization uses CASL (`@casl/ability`) with project-level and org-level permission checks — see `backend/AGENTS.md` for backend details and `frontend/AGENTS.md` for frontend permission hooks/HOCs. Note: `API_KEY` and `SERVICE_TOKEN` auth modes are deprecated — do not use them in new code.

### Org-Scoped Products

PAM and Agent Vault are products over one implicit project per organization, not projects a user creates. Their URLs are `/organizations/$orgId/<product>/…` with no `$projectId`, the frontend resolves the project from the org (`useImplicitProjectId`), the backend bootstraps it lazily and blocks generic create and delete, their roles are admin or member only, and each has its own metered identities dimension (`pam_identities`, `agent_vault_identities`). When you add a `ProjectType.PAM` arm anywhere, add the Agent Vault arm beside it. See `backend/src/ee/services/pam/AGENTS.md` and `backend/src/ee/services/agent-vault/AGENTS.md`.

### Single-Project Products

Secret Scanning has one active project per organization (the newest). Like Certificate Manager, its URLs are `/organizations/$orgId/secret-scanning/…` with no `$projectId`; legacy orgs can still hold several projects, so the frontend pins the one being viewed (see `frontend/AGENTS.md`). New orgs and sub-orgs get it at creation (`bootstrapSecretScanningProject`), older orgs lazily from `GET /api/v2/secret-scanning/project`, and `projectId` is optional on its API (`inject-secret-scanning-project-id`). Do not add a project picker or a way to create more Secret Scanning projects.

### Shared Backend Modules

Alerting (`backend/src/services/alert/`) and approvals (`backend/src/services/approval-policy/`) are shared modules. Do not stand up a per-product alert or approval service; see [`backend/AGENTS.md`](backend/AGENTS.md) for how to plug into each, including the rule that deleting an alertable resource must reap its alerts.

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

When a change adds a service, a pattern, or an invariant an agent would otherwise get wrong, update the `AGENTS.md` closest to that code. Put cross-cutting rules here, package rules in the package file, and subsystem detail in a file next to the subsystem's code, then add it to [Where guidance lives](#where-guidance-lives). Keep each file a map rather than a spec: concepts, where things live, and non-obvious invariants. Leave signatures, field lists, and step-by-step mechanics to the code.
