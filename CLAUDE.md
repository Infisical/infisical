# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Essential Commands

- `make reviewable-api` / `make reviewable-ui` — lint:fix + type:check (run before PRs). Neither checks [`backend/CODE_QUALITY.md`](backend/CODE_QUALITY.md); review backend changes against it yourself.
- `cd backend && npm run migration:new` — create new DB migration
- `cd backend && npm run generate:schema` — regenerate Zod types from DB after migration changes
- `cd backend-go && make test` — run Go integration tests

Both backend and frontend use `@app/*` as path alias to `./src/*`.

## Repository Structure

Infisical is an open-source secret management platform. Monorepo layout:

```
infisical/
├── backend/               # Fastify 4 API server (see backend/CLAUDE.md)
├── backend-go/            # Go API server — partial rewrite (see backend-go/CLAUDE.md)
├── frontend/              # React 18 SPA (see frontend/CLAUDE.md)
├── wasm/                  # Rust crates compiled to WASM for the frontend (see wasm/<crate>/CLAUDE.md)
├── e2e/                   # External Playwright suite — gates prod deploys against gamma (see e2e/CLAUDE.md)
├── docs/                  # Documentation site (Mintlify-based)
├── docker-compose.dev.yml        # Local dev (PostgreSQL, Redis, backend, frontend, Nginx)
├── docker-compose.prod.yml       # Production deployment stack
├── docker-compose.bdd.yml        # BDD testing environment
├── docker-compose.e2e-dbs.yml    # E2E test databases (Oracle, SAP, Snowflake, etc.)
├── Dockerfile.standalone-infisical       # Standalone image (frontend + backend)
├── Dockerfile.fips.standalone-infisical  # FIPS-compliant standalone image
├── .github/               # CI workflows, PR template
└── CLAUDE.md               # This file
```

- **`backend/`** — Fastify 4 API server, TypeScript, PostgreSQL via Knex, BullMQ queues. See [`backend/CLAUDE.md`](backend/CLAUDE.md) for architecture, patterns, and commands.
- **`backend-go/`** — Go API server (partial rewrite), chi + chita framework, raw pgx queries, same PostgreSQL database. See [`backend-go/CLAUDE.md`](backend-go/CLAUDE.md) for architecture, patterns, and commands.
- **`frontend/`** — React 18 SPA, Vite 6, TanStack Router + React Query, Tailwind CSS v4. See [`frontend/CLAUDE.md`](frontend/CLAUDE.md) for architecture, patterns, and commands.
- **`wasm/`** — Rust crates that compile to WASM for the frontend. Generated bindings are committed under `frontend/src/lib/<crate>/` so the frontend builds without a Rust toolchain. Each crate has its own `CLAUDE.md` with the rebuild command (e.g. [`wasm/ironrdp-decoder/CLAUDE.md`](wasm/ironrdp-decoder/CLAUDE.md)) — run it after any change to that crate's `src/` or `Cargo.toml` so source and bindings stay in sync.
- **`docs/`** — Product documentation site. Has its own Dockerfile for building. Reference docs for up-to-date feature descriptions and API usage.
- **`e2e/`** — Playwright suite that runs against a deployed environment (gamma) between deploy and prod promotion. Distinct from `backend/e2e-test/` (in-process Vitest). Failure blocks every prod-deploy job. Covers SCIM + SAML flows (SP-initiated, IdP-initiated, deactivation, response rejection) against a mock IdP we control — see [`e2e/CLAUDE.md`](e2e/CLAUDE.md) for the harness and the one-time gamma bootstrap.

Enterprise features live in `backend/src/ee/` (services and routes), registered before community routes so they can override/extend them.

### Self-Hosted Deployment

Infisical supports self-hosted deployment via Docker. Key considerations:
- **`Dockerfile.standalone-infisical`** — single-container image with both frontend and backend; used for simple deployments.
- **`Dockerfile.fips.standalone-infisical`** — FIPS 140-2 compliant variant for regulated environments. Be strict about not introducing dependencies that break FIPS compliance.
- **`docker-compose.prod.yml`** — production compose with backend, PostgreSQL, and Redis.
- New backend dependencies should be evaluated carefully — they affect container size, FIPS compliance, and the encryption boundary. Check `docs/` for self-hosted deployment documentation when in doubt.

### Dependency Policy

Both `backend/` and `frontend/` enforce a minimum release age of 7 days for npm packages (configured via `.npmrc` in each directory). This means `npm install` will only resolve package versions published at least 7 days ago, as a supply-chain security measure.

## Cross-Cutting Patterns

### Backend Code Quality

**Read [`backend/CODE_QUALITY.md`](backend/CODE_QUALITY.md) for every backend change, and check the change against it before calling the work done.** This applies to all work under `backend/`: new features, refactors, bug fixes, and reviews alike.

It is a floor, not an exhaustive standard: user-understandable error messages and no pointless 500s, explicit validation on every API input, correct pagination when calling third-party APIs, avoiding deadlock conditions on a small connection pool (thread `tx`, keep transactions short), and REST-aligned API interfaces (flag deviations for the author to confirm rather than implementing them silently).

That list describes what the guide currently covers; it is **not** a test for whether the guide applies. Do not skip it because a change does not look like one of those topics. Read it, then decide which items are relevant.

### Code Comments

**Default to no comments.** One earns its place only by explaining *why*: a non-obvious constraint, a workaround, an ordering dependency, or logic that looks wrong until you know the reason.

Never write: narration restating the next line; section headers inside a function (`// --- validation ---`); change history (`// Added retry logic`, `// NEW`); references to plans, tickets, PRs, or reviewers; docstrings restating the signature; commented-out code.

Before finishing, delete any comment you added that only says what the code says.

### Design System & Voice

The v3 visual system (colors, typography, components, layout) and product voice/content tone are documented in [`DESIGN.md`](DESIGN.md). Read it before producing new UI or user-visible copy.

### Documentation

**Use the `docs-style` skill for any work under `docs/`** (`.agents/skills/docs-style/`). It carries the procedure for the [Documentation Style Guide](docs/STYLE_GUIDE.md): what belongs on a page, and the sentence-level review pass Vale cannot check.

If the user wrote or edited the docs prose themselves, don't just accept it. Tell them the `docs-style` skill can run the review pass over their changes, and offer to run it.

The style guide covers writing for users (not implementers), Mintlify component usage, cross-referencing, page structure, the sentence-level writing rules in section 5, and the bolding and UI conventions in section 11.

Run `make lint-docs-branch` after any change under `docs/`. It runs [Vale](https://vale.sh) over the docs and enforces the mechanical half of the style guide: sentence case in headings and frontmatter titles, product and vendor spellings, spelling against a curated vocabulary, `$` prompts in code blocks, and em dash density. See [docs/CONTRIBUTING.MD](docs/CONTRIBUTING.MD) for how to extend the vocabulary or suppress a rule. It lints only the `.mdx` files the branch touched; `make lint-docs` checks every page. The `Check docs style` GitHub workflow runs that same script, so local and CI agree by construction. `Infisical.UIActions` (click/tap where the verb should be select) and `Infisical.Contractions` report at warning and suggestion level, so they never change the exit code -- read the printed output, not just the status. Note that Vale cannot see prose indented four or more spaces inside components -- roughly half of this repo -- and reports nothing about what it skipped, so a clean run does not mean a nested page was checked.

### Product Analytics

Any PR that ships or changes a user-facing feature, API endpoint, or API client must follow
[`.claude/skills/product-analytics/SKILL.md`](.claude/skills/product-analytics/SKILL.md). It defines the telemetry
attribution contract: route events through the backend telemetry service, carry org/project attribution,
aggregate high-volume events, register new client User-Agents in both backends, and honor opt-outs.

### Auth & Permissions

Auth modes (JWT, IDENTITY_ACCESS_TOKEN, SCIM_TOKEN) are extracted in `backend/src/server/plugins/auth/`. Authorization uses CASL (`@casl/ability`) with project-level and org-level permission checks — see `backend/CLAUDE.md` for backend details and `frontend/CLAUDE.md` for frontend permission hooks/HOCs. Note: `API_KEY` and `SERVICE_TOKEN` auth modes are deprecated — do not use them in new code.

### Service Factory + Manual DI (Backend)

No IoC container in either backend. Every service is a factory function with explicit dependencies.
- **Node.js**: Wired in `backend/src/server/routes/index.ts` — see `backend/CLAUDE.md`.
- **Go**: Wired in `backend-go/internal/server/api/api.go` via `NewRegistry()` — see `backend-go/CLAUDE.md`.

### Interface Pattern (Go)

Both handlers and services define narrow interfaces for their dependencies (consumer-defined interfaces). Only expose methods or fields that are needed — keep everything else private. This enables testability and loose coupling.

### Alerting

All user-facing "notify me when X happens" features share one module: `backend/src/services/alert/`. It owns the alert CRUD, the channel stack (email, Slack, webhook, PagerDuty), recipients, dedup, history, and dispatch. To alert on a new resource, register an `IResourceAlertProvider` on the shared registry — do not stand up a per-domain alert service, channel table, or notification cron. See `backend/CLAUDE.md` for the provider contract and invariants.

**If you touch a code path that deletes or detaches an alertable resource, it must reap that resource's alerts.** `alerts.resourceId` has no foreign key, so nothing cascades and the alert is left dangling. Use `alertService.deleteAlertsForDeletedResource` when the row is gone (unscoped, reaps across every org) and `deleteAlertsForResource` when the resource only left a scope. See the alerting invariants in `backend/CLAUDE.md`.

### API Layer (Frontend)

React Query + Axios with query key factories per domain. Each API domain in `frontend/src/hooks/api/` has `queries.tsx`, `mutations.tsx`, and `types.tsx` — see `frontend/CLAUDE.md` for conventions.

## Keeping CLAUDE.md Up to Date

When making significant changes to the codebase (new services, architectural shifts, new patterns, major refactors), update the relevant CLAUDE.md file(s) with high-level findings. This includes this root file for cross-cutting concerns, `backend/CLAUDE.md` for Node.js backend changes, `backend-go/CLAUDE.md` for Go backend changes, and `frontend/CLAUDE.md` for frontend changes. The goal is to keep these files accurate as living documentation so future sessions start with correct context.

## Wiring a New Full-Stack Feature

1. **Backend**: Create service module, migration, wire DI, add routes — see checklist in `backend/CLAUDE.md`
2. **Frontend**: Add API hooks in `src/hooks/api/<domain>/`, create page/view, wire route — see `frontend/CLAUDE.md` for routing and component patterns
3. Check the backend work against [`backend/CODE_QUALITY.md`](backend/CODE_QUALITY.md)
4. Run `make reviewable-api` and `make reviewable-ui` before submitting

## Helpful files

Claude Code reads CLAUDE.md, not AGENTS.md, so the shared agent instructions are imported here rather than linked:

@AGENTS.md
