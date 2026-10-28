# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

## Cross-Cutting Patterns

### Backend Code Quality

**Read [`backend/CODE_QUALITY.md`](backend/CODE_QUALITY.md) for every backend change, and check the change against it before calling the work done.** This applies to all work under `backend/`: new features, refactors, bug fixes, and reviews alike.

It is a floor, not an exhaustive standard: user-understandable error messages and no pointless 500s, explicit validation on every API input, correct pagination when calling third-party APIs, avoiding deadlock conditions on a small connection pool (thread `tx`, keep transactions short), REST-aligned API interfaces (flag deviations for the author to confirm rather than implementing them silently), and audit log events an admin can actually read.

That list describes what the guide currently covers; it is **not** a test for whether the guide applies. Do not skip it because a change does not look like one of those topics. Read it, then decide which items are relevant.

### Code Comments

**Default to no comments.** One earns its place only by explaining *why*: a non-obvious constraint, a workaround, an ordering dependency, or logic that looks wrong until you know the reason.

Never write: narration restating the next line; section headers inside a function (`// --- validation ---`); change history (`// Added retry logic`, `// NEW`); references to plans, tickets, PRs, or reviewers; docstrings restating the signature; commented-out code.

Before finishing, delete any comment you added that only says what the code says.

### Product Analytics

Read [`ANALYTICS.md`](ANALYTICS.md) before adding or changing product analytics. Every event has one owning producer: the frontend records UI exposure and intent, the application backend records accepted commands it can establish, and the system of record records durable outcomes. Define stable dimensions, cardinality, firing conditions, and dashboard consumers before implementation.

### Design System & Voice

The v3 visual system (colors, typography, components, layout) and product voice/content tone are documented in [`DESIGN.md`](DESIGN.md). Read it before producing new UI or user-visible copy.

### Documentation

**Use the `docs-style` skill for any work under `docs/`** (`.agents/skills/docs-style/`). It carries the procedure for the [Documentation Style Guide](docs/STYLE_GUIDE.md): what belongs on a page, and the sentence-level review pass Vale cannot check.

If the user wrote or edited the docs prose themselves, don't just accept it. Tell them the `docs-style` skill can run the review pass over their changes, and offer to run it.

The style guide covers writing for users (not implementers), Mintlify component usage, cross-referencing, page structure, the sentence-level writing rules in section 5, and the bolding and UI conventions in section 11.

Run `make lint-docs-branch` after any change under `docs/`. It runs [Vale](https://vale.sh) over the docs and enforces the mechanical half of the style guide: sentence case in headings and frontmatter titles, product and vendor spellings, spelling against a curated vocabulary, `$` prompts in code blocks, and em dash density. See [docs/CONTRIBUTING.MD](docs/CONTRIBUTING.MD) for how to extend the vocabulary or suppress a rule. It lints only the `.mdx` files the branch touched; `make lint-docs` checks every page. The `Check docs style` GitHub workflow runs that same script, so local and CI agree by construction. Every rule except `Infisical.EmDashes` reports at error level, including `Infisical.UIActions` (click/tap where the verb should be select) and `Infisical.Contractions`, so the run fails if either one reports a finding. `Infisical.EmDashes` reports at warning level and never changes the exit code -- read the printed output, not just the status. Note that Vale cannot see prose indented four or more spaces inside components -- roughly half of this repo -- and reports nothing about what it skipped, so a clean run does not mean a nested page was checked.

### Auth & Permissions

Auth modes (JWT, IDENTITY_ACCESS_TOKEN, SCIM_TOKEN) are extracted in `backend/src/server/plugins/auth/`. Authorization uses CASL (`@casl/ability`) with project-level and org-level permission checks — see `backend/AGENTS.md` for backend details and `frontend/AGENTS.md` for frontend permission hooks/HOCs. Note: `API_KEY` and `SERVICE_TOKEN` auth modes are deprecated — do not use them in new code.

### Org-Scoped Products

PAM and Agent Vault are products over one implicit project per organization, not projects a user creates. Their URLs are `/organizations/$orgId/<product>/…` with no `$projectId`, the frontend resolves the project from the org (`useImplicitProjectId`), the backend bootstraps it lazily and blocks generic create and delete, their roles are admin or member only, and each has its own metered identities dimension (`pam_identities`, `agent_vault_identities`). When you add a `ProjectType.PAM` arm anywhere, add the Agent Vault arm beside it. See `backend/src/ee/services/pam/AGENTS.md` and `backend/src/ee/services/agent-vault/AGENTS.md`.

### Single-Project Products

Secret Scanning has one active project per organization (the newest). Like Certificate Manager, its URLs are `/organizations/$orgId/secret-scanning/…` with no `$projectId`; legacy orgs can still hold several projects, so the frontend pins the one being viewed (see `frontend/AGENTS.md`). New orgs and sub-orgs get it at creation (`bootstrapSecretScanningProject`), older orgs lazily from `GET /api/v2/secret-scanning/project`, and `projectId` is optional on its API (`inject-secret-scanning-project-id`). Do not add a project picker or a way to create more Secret Scanning projects.

### Service Factory + Manual DI (Backend)

No IoC container in either backend. Every service is a factory function with explicit dependencies.
- **Node.js**: Wired in `backend/src/server/routes/index.ts` — see `backend/AGENTS.md`.
- **Go**: Wired in `backend-go/internal/server/api/api.go` via `NewRegistry()` — see `backend-go/AGENTS.md`.

### Interface Pattern (Go)

Both handlers and services define narrow interfaces for their dependencies (consumer-defined interfaces). Only expose methods or fields that are needed — keep everything else private. This enables testability and loose coupling.

### Alerting

All user-facing "notify me when X happens" features share one module: `backend/src/services/alert/`. It owns the alert CRUD, the channel stack (email, Slack, webhook, PagerDuty), recipients, dedup, history, and dispatch. To alert on a new resource, register an `IResourceAlertProvider` on the shared registry — do not stand up a per-domain alert service, channel table, or notification cron. See `backend/AGENTS.md` for the provider contract and invariants.

**If you touch a code path that deletes or detaches an alertable resource, it must reap that resource's alerts.** `alerts.resourceId` has no foreign key, so nothing cascades and the alert is left dangling. Use `alertService.deleteAlertsForDeletedResource` when the row is gone (unscoped, reaps across every org) and `deleteAlertsForResource` when the resource only left a scope. See the alerting invariants in `backend/AGENTS.md`.

### Approvals

All "someone has to approve this before it happens" features share one module:
`backend/src/services/approval-policy/`, which owns policies, requests, steps, grants, break-glass, and
the generic `/v1/<policy-type>/approval-policies` endpoints. Current types: PAM access, certificate
requests, code signing.

A policy type plugs in through **one** extension point, a `TApprovalResource` (see its doc comment),
constructed with its own dependencies and registered in the `approvalResources` map in
`server/routes/index.ts`; that also gives it the generic `/v1/approval-policies/<type>/...` endpoints,
which every type now uses for policy CRUD, requests, approve, reject and grant revocation. **Do not stand up a per-product approval service, request table, or review
endpoint**: `access-approval-*` and `secret-approval-*` predate this module and are what we are
converging away from. A product-facing service on top of it (PAM's `pam-access-request-service.ts`) is
for product vocabulary only: resolving the resource a request names, notifications, and read models.
Any rule about what is *allowed* belongs in the resource, or the product's own API and the shared API
stop agreeing.

Auto-approval rules (`approval-policy/auto-approval/`) live on the policy and are evaluated once in
`createRequest`, outside any transaction, failing closed. Another service becomes checkable by adding a
provider to `AUTO_APPROVAL_PROVIDER_REGISTRY`, keyed by its App Connection, not by per-product code. A
resource gates them per request with `allowsAutoApproval`. A policy may have rules and no approvers (no
steps): then a request no rule approves is refused at submission, and only break-glass gets past it. The
engine itself adds a reuse check (`not-used-before`) to every input, answered from the policy's approved
requests' evidence and claimed under an advisory lock in the auto-approve transaction. The
stored evidence holds data fetched from that service, so responses return only its outcome (`autoApproval`),
never `autoApprovalEvidence`.

A policy on the global approval system can hand its requests to a delegated approval system (ServiceNow)
through `backend/src/services/delegated-approval/`, which owns the `delegated_approval_policies` and
`delegated_approval_requests` rows. Secret access policies opt in with `delegatedApproval: { type, connectionId }`
on create and update (`secret-access-approval-global-policy-bridge-service.ts`). A delegated policy has no
Infisical approvers, cannot use break glass (soft enforcement or bypassers) or self approval, cannot be updated
while it has pending requests, and a policy on the legacy approval system can never be delegated. Keep those
rules in `assertDelegatedApprovalPolicyConstraints` when another policy type opts in. Only secret access
policies may opt in today: `assertPolicyTypeSupportsDelegatedApproval` refuses the rest, and secret change
policies return it as a 400 rather than dropping the field.

Delivery to the delegated system is asynchronous and goes through the event outbox (see `backend/AGENTS.md`).
`delegatedApprovalService.createRequest` writes the `delegated_approval_requests` row, stamped with the policy's
provider as `providerType` so `(providerRequestId, providerType)` can be unique, and emits
`delegated-approval.request.dispatch-requested` (`delegated-approval-events.ts`) in the caller's transaction, so
the dispatch is exactly as durable as the request; never enqueue it after commit. The
`delegated-approval-dispatch` consumer (`delegated-approval/dispatch/delegated-approval-dispatch-consumer.ts`)
calls the provider inline and moves the row `pending_dispatch` → `waiting_approval` (storing the provider's
record id in `providerRequestId`) or `failed_dispatch` with a `statusReason` a user can read. A transient
failure returns `Retry`, so the outbox backs off and tries again (up to `MAX_OUTBOX_ATTEMPTS`), and the reason
text promises that retry. The outbox flags the last attempt (`TEvent.isFinalAttempt`), and a transient failure
on it closes the request instead: the delegated row goes `failed` with a reason that says so, the approval
request goes `cancelled`, and the consumer returns `Failed`. A terminal failure the consumer raises itself (an
`UnrecoverableError`: SITE_URL unset, the app connection gone, the policy no longer delegated) stays
`failed_dispatch` on every attempt, because an admin can fix the cause and resend. A user resends a
`failed_dispatch` request with `POST /api/v1/access-approvals/requests/:requestId/retry-delegated-dispatch`. The
product's bridge checks who may retry, and `delegatedApprovalService.retryDispatch` checks the request can be
retried. A resend supersedes the event still in the outbox rather than running beside it: the row stores the
live event id in `dispatchEventId`, and a resend writes a new random one (only while the row is
`failed_dispatch`) and emits the event under it in one transaction. The consumer marks any event whose id no
longer matches delivered without calling the provider or writing the row, so an older event's last attempt
can never close a request the user resent, and concurrent resends call the provider once. A batch dispatches up to 10 different requests at once;
events for one request stay serial. A second event for a request that was already delivered is marked delivered
without calling the provider. A delegated request has
no Infisical approvers, so `POST /api/v1/access-approvals/requests/:requestId/cancel-delegated-dispatch` is the only way to close
one from Infisical: the requester, or anyone who can edit the policy, sets it `cancelled`, which is also how a
policy blocked by pending requests is freed for editing. Every provider implements `TDelegatedApprovalProvider` against the same
`TDelegatedApprovalDispatchInput` and registers in `DELEGATED_APPROVAL_PROVIDER_MAP`
(`delegated-approval/providers/<name>/`); a new policy type adds an arm to `TDelegatedApprovalDispatchDetails` and a
builder in `DELEGATED_APPROVAL_DISPATCH_DETAILS_BUILDER_MAP` rather than branching in a provider. The consumer
reads from the primary, never checks the license, and treats bullmq's `UnrecoverableError` as the terminal failure
signal, returning `Failed` for it and `Retry` for anything else until the last attempt. The callback contract (token issuance now, the inbound route and approve / reject later) is its own
module, `backend/src/services/delegated-approval-callback/`, so the delegated approval module never grows a
callback branch. A request gets exactly one callback token for its whole life: it is random, prefixed `inf_ext_`,
issued on the first dispatch attempt, and stored in `encryptedCallbackToken` under the SecretManager KMS key of
the request's project (`getOrIssueCallbackToken` resolves the project from the delegated request itself, since
the inbound route knows only that row) so every retry resends the same value. Never send a provider a token that
differs from the one stored for the request; the provider keeps the first token it was given and cannot be told
another, so a mismatch is unrecoverable. The provider calls `POST /api/v1/delegated-approvals/callback` (unauthenticated, IP rate limited)
with the token in the `Infisical-Approval-Token` header and a body naming the event and the provider's record id;
the body carries no decision, which a later worker reads back from the provider. The route finds the row by
`providerRequestId` and checks the token. Only a callback that starts a read-back counts in `callbackAttempts`,
so the limit bounds read-backs rather than repeats; on the sixth such callback it sets the row `failed` with a
readable `statusReason` and cancels the attached approval request in the claim's transaction, so the policy is
freed and the UI stops offering Cancel. That transaction locks the approval request before it claims, the same
order the decision consumer and cancel take, or failing the request inside it would invert their lock order. A
refused callback is never counted: the limit closes the request, so counting it would let anyone who knows the
record id cancel the request, and the token is 256 random bits, so there is nothing to brute force. Every other
refusal (no row for the record id, bad or missing token, request not `waiting_approval`)
gets one neutral 403 while the reason goes to the log. An accepted callback only emits an outbox event, and
only when it wins `claimDecisionRead`: a conditional update of `decisionReadRequestedAt`, in the emit's
transaction, that one of any number of concurrent callbacks wins. A repeat while a read-back is still in
flight gets the same 200, emits nothing and is not counted. The last read-back attempt clears
`decisionReadRequestedAt`, so a callback after the outbox gives up claims immediately. A claim whose worker
died before that write stays until it is older than `DELEGATED_APPROVAL_DECISION_READ_CLAIM_TTL_MS`
(70 minutes), which is what lets a fresh notification start one then. The event's `type` is the body's event
and its id is derived (uuid v5) from the delegated request id plus the attempt count. The
`delegated-approval-decision` consumer (`backend/src/services/delegated-approval-decision/`, a thin outbox
adapter over `delegatedApprovalDecisionService.applyDecision` that, like dispatch, reads up to 10 different
requests at once and one request's events serially) then reads the decision back through the
policy's app connection: `TDelegatedApprovalProvider.fetchDecision` returns `pending` or a decision with
the permissions the provider holds, and the consumer answers `Retry` for `pending` (on the last attempt, `Failed`
with the request left open, `decisionReadRequestedAt` cleared, and a `statusReason` saying Infisical stopped
checking and the callback has to be sent again), compares the approved
permissions with the ones it dispatched after both go through `normalizeDelegatedApprovalPermissions` (set
comparison: padding, order, duplicates and case never count as a change), and finalizes in one transaction
that locks the approval request, moves the delegated row `waiting_approval` → `approved` / `rejected`, and
runs the policy type's `postApprovalTxRoutine` from `approvalResources`. A mismatch, a record for another
request, or any other `UnrecoverableError` goes through `failDelegatedApprovalRequest`: the delegated row
becomes `failed` with a readable `statusReason`, the approval request is cancelled, and nothing can retry
it. A request whose requester was deleted (`requesterId` is set null) or is no longer a member of the
project, directly or through a group (`membershipDAL.isUserProjectMember`), takes the same path before the
decision is read back. The secret access `postApprovalTxRoutine` refuses a non-member too, on both approval
paths: removing a member reaps only the privileges that already exist, so one written afterwards would take
effect if the user were ever added back. Every outcome is audited as
`ACCESS_APPROVAL_REQUEST_DELEGATED_DECISION` with the `PLATFORM` actor, and
product notifications (the access request webhook) go through `decisionNotifiers`, never through the
consumer itself. A new delegated policy type adds its `postApprovalTxRoutine` and decision notifier in
`delegatedApprovalDecisionMapsFactory`, the same way dispatch details get a builder in
`DELEGATED_APPROVAL_DISPATCH_DETAILS_BUILDER_MAP`. ServiceNow stamps an immutable `decision` on its record before it posts the callback, so
the provider reads that field alone and ignores `state`.

### Object Storage

New product files go to S3 through `backend/src/services/object-storage/`, not a product's own S3 client (PAM
recordings predate it and haven't moved). A product
registers a namespace (record-first path like `sessions/{sessionId}/logs/{file}`, checked for naming collisions at
boot) and the layer builds org-first keys, signs links, and applies the retention tag and, for default storage on Infisical Cloud, a daily upload cap. Storage is
`default` (the instance's bucket, `OBJECT_STORAGE_S3_*`) or `external` (the customer's, through an AWS connection);
use those two words everywhere.

### API Layer (Frontend)

React Query + Axios with query key factories per domain. Each API domain in `frontend/src/hooks/api/` has `queries.tsx`, `mutations.tsx`, and `types.tsx` — see `frontend/AGENTS.md` for conventions.

## Keeping AGENTS.md Up to Date

When making significant changes to the codebase (new services, architectural shifts, new patterns, major refactors), update the relevant AGENTS.md file(s) with high-level findings. This includes this root file for cross-cutting concerns, `backend/AGENTS.md` for Node.js backend changes, `backend-go/AGENTS.md` for Go backend changes, and `frontend/AGENTS.md` for frontend changes. The goal is to keep these files accurate as living documentation so future sessions start with correct context.

## Wiring a New Full-Stack Feature

1. **Backend**: Create service module, migration, wire DI, add routes — see checklist in `backend/AGENTS.md`
2. **Frontend**: Add API hooks in `src/hooks/api/<domain>/`, create page/view, wire route — see `frontend/AGENTS.md` for routing and component patterns
3. Check the backend work against [`backend/CODE_QUALITY.md`](backend/CODE_QUALITY.md)
4. Run `make reviewable-api` and `make reviewable-ui` before submitting

## Backend Development

**Read the [Backend Code Quality Guide](backend/CODE_QUALITY.md) for any change under `backend/`, and check your work against it before reporting the task done.** Features, refactors, bug fixes, and reviews all count.

It is a short, deliberately non-exhaustive floor: error messages users can understand (and no pointless 500s), validation on every API input, correct pagination when calling third-party APIs, no deadlock conditions on a small connection pool, REST-aligned API interfaces, and audit log events an admin can actually read.

Treat that list as a summary of the guide's current contents, not as a condition for reading it. A change that does not look like any of those topics still gets checked, because the guide grows and because the items apply in places they are not obviously about (a bug fix that adds a query inside an existing transaction, a refactor that moves a third-party list call).

Some of it needs judgment rather than a mechanical check. The deadlock rules cannot be caught by testing one request at a time. And a design that breaks REST should be raised with the author, with the conforming alternative proposed, rather than implemented silently or quietly "fixed" (some deviations are deliberate).

## Documentation

**Use the `docs-style` skill for any work under `docs/`** (`.agents/skills/docs-style/`). It carries the procedure for the [Documentation Style Guide](docs/STYLE_GUIDE.md), including the sentence-level review pass Vale cannot check.

If the user wrote or edited the docs prose themselves, don't just accept it. Tell them the `docs-style` skill can run the review pass over their changes, and offer to run it.

The style guide covers writing for users (not implementers), Mintlify component usage, cross-referencing, page structure, the sentence-level writing rules in section 5, and the bolding and UI conventions in section 11.

Run `make lint-docs-branch` after any change under `docs/` (or `make lint-docs` for the whole site; the `Check docs style` CI check runs the branch variant). It runs [Vale](https://vale.sh) over the docs and enforces the mechanical half of the style guide. A clean run is not a substitute for reading the guide: the judgment calls it cannot check are the ones that matter most. Vale cannot see prose indented inside Mintlify components, so a clean run is not evidence that nested content was checked, and `Infisical.EmDashes` reports at warning level, so its findings never change the exit code.

## UI Development

When building frontend UI, follow [DESIGN.md](DESIGN.md) for the v3 design system — colors, typography, components, and voice.

Before deprecating or removing a shared frontend component, follow the component lifecycle rules in [`frontend/AGENTS.md`](frontend/AGENTS.md).

Pickers for entities a user may need to create first (app connections, gateways, and similar) must offer an inline "Create new X" row, gated on the create permission, so the user never has to leave the flow. Build them with the v3 `Combobox` and its `creation` prop, which renders that row. For app connections, use `creation.mode = "dialog"` and have `renderForm` render `AppConnectionForm` with the app preset, selecting the new connection and calling `complete` in its `onComplete`, and route `onDismiss` and the form's cancel through `useDiscardChangesGuard` (see `components/app-connections/useConnectionCreation.tsx`).

## Issue and PR Guidelines

- Never create a GitHub issue.
- When creating a pull request, use and fully complete the repository's
  `.github/pull_request_template.md` template.

## Workflow Guardrails

- Do not reformat existing code as incidental cleanup. Preserve the repository's current formatting unless a review agent, CI check, or user explicitly asks for a formatting change.
- Never push changes to `license-fns` or local UI fixtures to a remote branch. Those edits are local-only support for review and test passes; keep them out of commits and pull requests.
- When resolving merge conflicts, optimize for a correct, minimal, strategically unblocking resolution. Do not let a slow or stalled local check block the push when the corresponding frontend or backend CI checks on GitHub can validate the branch; push the resolved code and use CI to complete the expensive verification.
