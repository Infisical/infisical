# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the **backend** package of the Infisical monorepo — a Fastify 4 API server with TypeScript, PostgreSQL via Knex, and BullMQ queues.

The backend code quality guide is imported below, so it is always in context for work in this package. **Check every change against it, whatever the change is, before calling the task done.** This file covers *where* code goes and *which* pattern to follow; the quality guide covers the minimum any implementation has to handle. It is a deliberately non-exhaustive floor, so the topics it happens to cover are not a filter for whether it applies.

@CODE_QUALITY.md

## Essential Commands

All commands run from the `backend/` directory:

- `npm run dev` — start dev server with tsx watch + pino-pretty logging (`dev:docker` is the same with the debugger on 9229)
- `npm run build` — production build via tsdown (`tsdown.config.ts`) with sourcemaps
- `npm run lint:fix` — Oxlint autofix, then Oxfmt formatting (`npm run lint` checks both without writing, as CI does)
- `npm run type:check` — TypeScript 7 (native compiler) check
- `make reviewable-api` (from repo root) — runs `lint:fix` + `type:check` (run before PRs)

The backend runs on Node 26. TypeScript files run directly through tsx (dev server, scripts, the
`*-dev` knex commands, and the e2e environment's migration loading); there is no ts-node.

### Build (tsdown)

`tsdown` compiles every module to its own `dist/**/*.mjs` (unbundled ESM) and rewrites `@app/*` to
relative paths itself. Invariants that a config change can silently break:

- **The output extension stays `.mjs`.** knex records each migration's file name, extension included, in
  `infisical_migrations`, so production rows are `*.mjs`. A different extension makes every applied
  migration look unknown and the boot check refuses to start.
- **`main` stays the first entry, and entry paths stay absolute.** Rolldown orders each file's imports by
  execution order, walking entries in order; a glob that sorts another entry ahead of `main` hoists its
  imports above the telemetry instrumentation. Object entries ignore `root`, so relative paths nest every
  other module under `dist/src/`.
- **Rolldown reorders imports, even within one file.** Never rely on import order for a global side effect
  that another package needs; import it explicitly where it is needed (see `reflect-metadata` in
  `lib/crypto/pqc/pqc-algorithm.ts`).
- **`deps.onlyBundle: []` fails the build if a `node_modules` package would be inlined.** That means
  `src/` imports a package that `package.json` does not declare; declare it instead of loosening the guard.

### Testing

Run both suites from the repo root, which is the same entry point CI uses:

- `make test-api-unit` — unit tests matching `./src/**/*.test.ts`
- `make test-api-e2e` — e2e tests matching `./e2e-test/**/*.spec.ts`
- `make test-api-e2e SPEC=<pattern>` — narrow to one spec, e.g. `SPEC=secret-sync`
- `make up-rotation-databases` — start the databases the secret rotation specs need, required
  only for a full run (`docker-compose.e2e-dbs.yml`, and the Oracle image is large)
- `make down-test-suite-containers` — stop everything when finished

The secret rotation specs reach their databases by compose service name, so
`docker-compose.e2e-dbs.yml` pins the same compose project as the test stack and shares its
network. Without `make up-rotation-databases`, those specs fail on connection; the rest pass.

Both run inside the FIPS image (`Dockerfile.dev.fips`), which carries the native dependencies
the suites need (SoftHSM2, the Oracle client, the FIPS OpenSSL build) and pins the Node
version, so the host's does not matter. `docker-compose.test.yml` declares the image,
environment, mounts and services; `src`, `e2e-test` and both vitest configs are mounted, so
editing a test needs no rebuild but changing `package.json` or `tsconfig.json` does.

**`npm run test:e2e` directly is possible but destructive if misconfigured.** The Vitest
environment runs `DROP SCHEMA public CASCADE` on whatever database `.env.test` points at,
before every run. Copy `.env.test.example`, which targets the throwaway stack, and start it
with `make up-test-suite-containers`. Never point it at the dev database.

Unit tests go next to source as `*.test.ts` and test pure functions with Vitest globals (`describe`, `test`, `expect`).

E2E tests live in `e2e-test/routes/`. The custom Vitest environment (`e2e-test/vitest-environment-knex.ts`) bootstraps a full server with DB, Redis, and encryption. Tests use injected globals: `testServer` (Fastify instance), `jwtAuthToken` (pre-authenticated JWT). Use `testServer.inject()` for HTTP assertions. Test helpers in `e2e-test/testUtils/` provide CRUD wrappers for secrets, folders, and secret imports. See `e2e-test/routes/v1/org.spec.ts` for a representative e2e test.

#### Writing e2e tests with `testUtils`

**Build test state with the helpers in `e2e-test/testUtils/`, not by hand.** Before writing a
`testServer.inject` call or a `testDb` insert to set something up, check `testUtils/` for a helper
that already does it. If none exists, add one there rather than a local helper in the spec: two
specs had each written their own `createTargetUser` before `testUtils/users.ts` existed, and every
copy drifts on its own.

- **Isolate each test.** `createIsolatedOrgAndProject` (`fixtures.ts`) gives a test its own org and
  project, a token scoped to it, and a `cleanup` that deletes the org. Prefer it over the shared
  `seedData1` org and project, whose state leaks between tests and files.
- **Don't lean on the seed user as a participant.** When a test needs someone other than the caller
  (a recipient, a member, a target), create them with `createUser` and `addUserMembership`
  (`users.ts`). Those write rows directly because signup needs SRP, so the user can be named but
  cannot log in.
- **Go through the API for everything else**, with the domain helpers (`secrets.ts`, `folders.ts`,
  `alerts.ts`, `reminders.ts`, `identities.ts`, ...). Write a helper with `request()` (`request.ts`)
  so a call is sent when made and a caller can `.expect()` a non-200 or take the `.raw()` response.
- **Assert on outcomes a user would see**: an API response, an email in `testSmtp`, a message at a
  fake destination. Read `testDb` only when the API cannot show the thing under test (eg an alert
  orphaned by a cascade), and say why in a comment.
- **Wait with `pollUntil`** (`poll.ts`) for anything asynchronous, never a fixed sleep.
- **Run background jobs on demand** through a pass-through wrapper in `e2e-test/fakes/` (eg
  `reminder-queue.ts` and `event-outbox-queue.ts`, driven by `runDailyReminders` in `reminders.ts`).

#### Faking a third-party provider

**Never add test-only code to `src/`** — no test-mode enum members, no lookup map entries, no
`isTestMode` branches. Replace the module instead, from `test.alias` in
`vitest.e2e.config.mts`, with a double under `e2e-test/fakes/`. Production code stays unaware
a fake exists. `e2e-test/fakes/aws-parameter-store-sync-fns.ts` and its connection counterpart
are the worked examples, and the pre-existing `./license-fns` alias is the precedent.

Four things decide whether this works:

- **Alias the narrowest specifier.** Entries match the import string, so aliasing one a single
  file imports (a barrel's `./x-fns` re-export) swaps that seam and leaves the constants,
  schemas, types, router and lookup maps real.
- **`test.alias` must stay an array.** Vite's `mergeAlias` concatenates arrays with
  `test.alias` first, but merges two objects, where the generic `@app` prefix matches before a
  specific `@app/...` entry and the fake silently stops applying with no error.
- **Re-export whatever you do not replace.** The alias swaps the whole module, so an export you
  omit stops existing for every importer of it.
- **Assert the fake still matches.** Nothing otherwise checks it against the module it
  replaces. Export an assignment typed as `Pick<typeof RealModule, …>` so a signature change
  fails type-checking rather than leaving the fake quietly wrong.

A fake must reproduce the contract under test, not merely record its input. The Parameter Store
fake reimplements the real reconciliation rules (skip empty writes, delete absent keys unless
deletion is disabled, respect the key schema), because those rules are the behavior the specs
exist to pin.

#### FIPS test image and the prebuilt toolchain

CI (`.github/workflows/run-backend-tests.yml`) runs the e2e suite inside a FIPS image built
from `Dockerfile.dev.fips`. The expensive, rarely-changing parts of that image (SoftHSM2,
Oracle Instant Client, the FIPS OpenSSL 3.1.2 build and the PQC OpenSSL 3.5.6 build) live in
**`Dockerfile.fips-toolchain`**, which is published to
`ghcr.io/infisical/backend-fips-toolchain` for amd64 and arm64 by
`.github/workflows/publish-fips-toolchain.yml` on pushes to `main`.

`Dockerfile.dev.fips` consumes it via the `TOOLCHAIN_IMAGE` build arg, so CI and local dev
pull the toolchain instead of spending ~15min compiling it. Consequences worth knowing:

- **Editing `Dockerfile.fips-toolchain` is expensive.** CI pins the image by the content hash
  of that file, so a PR touching it has no published tag and rebuilds from source (the old,
  slow path). It publishes once the PR lands on `main`. Keep app-level changes in
  `Dockerfile.dev.fips`.
- **Don't add `cache-to: type=gha` back to the image build.** GHA cache is PR-scoped (so it
  never hits on a PR's first run) and the repo's 10GB cache budget is already full; writing
  image blobs there evicts the `node_modules` caches of every workflow.
- **The published image is an internal CI build cache, not a supported artifact.** It is
  public only so CI and local dev can pull it; it carries no support or compatibility
  guarantee. It is *not* the FIPS product image; that one is `infisical/infisical-fips`,
  built from `Dockerfile.fips.standalone-infisical`. OCI labels on the image say the same.
- **Keep every third-party fetch pinned and checksummed.** SoftHSM2 is pinned to a commit
  SHA (tags are mutable); both OpenSSL tarballs and the Oracle Instant Client zip are
  SHA256-verified; the Infisical CLI apt package is version-pinned. Oracle Instant Client
  is redistributed under the Oracle Free Distribution, Hosting, and Use Terms, which
  require the license to travel with it, so `/opt/oracle/instantclient_23_26/BASIC_LICENSE`
  must not be removed.

##### Building the dev stack without GHCR

`docker compose -f docker-compose.dev.yml build backend` pulls the toolchain from GHCR by
default. If GHCR is down, the package is private, you're offline, or you're iterating on the
toolchain itself, build it locally once and point the compose build at it:

```bash
# 1. Build the toolchain from source (~15min, or ~2min if your layer cache is warm)
docker build -f backend/Dockerfile.fips-toolchain -t fips-toolchain:local backend

# 2. Prefer .env, so it survives every compose invocation (see the warning below)
echo 'TOOLCHAIN_IMAGE=fips-toolchain:local' >> .env

# ...or pass it per-invocation. Both forms work but are easy to forget:
TOOLCHAIN_IMAGE=fips-toolchain:local docker compose -f docker-compose.dev.yml build backend
docker compose -f docker-compose.dev.yml build --build-arg TOOLCHAIN_IMAGE=fips-toolchain:local backend
```

**Use `.env` rather than a one-off env var.** The documented start command in
`docs/contributing/platform/developing.mdx` is `up --build`, which rebuilds the backend and
re-resolves the `TOOLCHAIN_IMAGE` default, so a per-invocation override silently stops
applying and you're back to a failing GHCR pull. Compose interpolates the project `.env` for
every invocation, so putting it there sticks.

Notes:

- Step 1 is only needed once per change to `Dockerfile.fips-toolchain`. The local tag name is
  arbitrary; it just has to match what you point `TOOLCHAIN_IMAGE` at.
- An already-built `backend` image keeps working if GHCR is unreachable, as long as you don't
  pass `--build`. This only bites on a rebuild.
- This is not an offline story. The toolchain build itself still fetches Debian packages, both
  OpenSSL tarballs, SoftHSM sources, and the Oracle client. With no network at all, neither
  path works and you need a previously built image.

### Database

- `npm run migration:new` — create new migration (interactive prompt)
- `npm run migration:latest-dev` — run pending migrations (dev, uses `src/db/knexfile.ts`)
- `npm run migration:rollback-dev` — rollback last migration batch (dev)
- `npm run generate:schema` — regenerate Zod types from DB into `src/db/schemas/` (always run after migration changes)
- `npm run seed-dev` — run database seeds

- **Every foreign-key column must be covered by an index** (its own, or as the leftmost column of a composite index). Postgres does **not** auto-index FK columns. This holds regardless of cascade behavior: an unindexed FK forces a seq-scan of the child table on every parent `DELETE`/`UPDATE` (per-row RI trigger), and the FK column is almost always also a join/filter key. Watch helper-generated FKs — `createJunctionTable` (`src/db/utils.ts`) creates CASCADE FK columns with **no index** on either side.

### Scaffolding

- `npm run generate:component` — interactive generator that can create a service module (DAL + service + types), a standalone DAL, or a router

Path alias: `@app/*` maps to `./src/*`.

## Linting, Formatting & Import Ordering

Oxlint (`.oxlintrc.json`) lints; its type-aware rules run through `oxlint-tsgolint` on TypeScript 7.
Existing `eslint-disable` comments, including `@typescript-eslint/` rule names, are honoured by Oxlint.
`import/no-cycle` is off: the backend has thousands of cycles through `@app/*` that ESLint's resolver never saw.
Type-aware linting is the `--type-aware` CLI flag, not `options.typeAware`: Oxlint rejects that option in a nested
config, which is what `backend/.oxlintrc.json` is to an editor opened at the repo root.
Editor setup for the Oxc extension lives in `backend/.vscode/` and `backend/.zed/`.

Oxfmt (`.oxfmtrc.json`) formats `src/**/*.ts` and sorts imports in this group order:
1. Side-effect imports
2. `node:` builtins
3. Third-party packages
4. `@app/` imports
5. Other absolute imports (`e2e-test/`)
6. Relative imports

Since TypeScript 5.7, `Buffer` is typed as possibly `SharedArrayBuffer`-backed, which WebCrypto, `@peculiar/x509`,
asn1 and pkijs reject. Declare `Buffer<ArrayBuffer>` (not the deprecated `NonSharedBuffer` alias) where a function really
returns one (for example `Buffer.concat`, `Buffer.from`, cipher output), and use `asNonSharedBuffer` from `@app/lib/fn` at a call
site that receives a plain `Buffer`.

## Architecture

### Service Factory + Manual DI

No IoC container. Every service is a factory function that receives explicit dependencies as a typed object and returns an object of methods. Dependencies are narrowed with TypeScript `Pick` to define minimal interface contracts.

The entire dependency graph is manually wired in `src/server/routes/index.ts`:
- **~line 480-646**: DAL instantiation — each DAL factory receives the `db` client
- **~line 649-2800**: Service instantiation — each factory receives its DALs + other services
- **~line 2831-2972**: `server.decorate("services", {...})` exposes ~100+ services as `server.services.*`
- **~line 3082-3098**: Route registration — EE routes registered before community routes per API version

See `src/services/secret/secret-service.ts:104-162` for a representative factory with ~20 dependencies. See `src/services/user/user-service.ts` for a simpler example (~8 dependencies).

### DAL Layer (Data Access)

Each service has a `*-dal.ts` that wraps `ormify()` (defined in `src/lib/knex/index.ts:155-326`). `ormify()` provides typed CRUD methods: `findById`, `find`, `findOne`, `create`, `insertMany`, `batchInsert`, `upsert`, `updateById`, `update`, `deleteById`, `delete`, `countDocuments`, `transaction`.

DALs extend these with custom queries — typically complex joins using Knex query builder and `sqlNestRelationships()` for nested entity mapping. All methods accept an optional `tx` parameter for transaction threading.

**Read replica pattern**: Read methods use `db.replicaNode()` (e.g., `(tx || db.replicaNode())(tableName)`), while writes always hit the primary (`(tx || db)(tableName)`). See any `ormify()` method in `src/lib/knex/index.ts` for the pattern.

`updateById` and `update` support atomic `$incr` and `$decr` operators alongside regular field updates.

**A dropped column does not fail type checking if the insert is built in a `.map()`.** TypeScript's
excess-property check only fires on a fresh object literal at the assignment site, so a stale field
survives when the literal is returned from a callback:

```ts
insertMany(names.map((name) => ({ name, role: "member", orgId })));  // compiles, then 500s at runtime
insertMany([{ name, role: "member", orgId }]);                       // TS2353
```

See `src/services/secret/secret-dal.ts` for a DAL that overrides the base `update` to auto-increment version and adds complex join queries.

### Service Module Structure

Services live in `src/services/` (100+ modules). Each typically contains:
- `*-dal.ts` — data access via `ormify()` + custom queries
- `*-service.ts` — business logic factory
- `*-types.ts` — DTOs and type definitions
- `*-queue.ts` — BullMQ async job handlers and/or cron-manager registrations (when needed)
- `*-fns.ts` — pure utility functions (when needed)

### Route Handler Pattern

Routes use Fastify's Zod type provider — schemas auto-generate OpenAPI docs. Each route specifies: `method`, `url`, `config.rateLimit` (using `readLimit` or `writeLimit` presets), `schema` (Zod schemas with `operationId` for OpenAPI), `onRequest: verifyAuth([AuthMode.*])`, and a `handler` that accesses business logic via `server.services.*`.

See `src/server/routes/v4/secret-router.ts` for a representative router file.

### Auth System

Auth extraction happens in `src/server/plugins/auth/`:
- `inject-identity.ts` — detects auth mode from request headers and attaches identity to request
- `verify-auth.ts` — middleware that checks if the request's auth mode is in the route's allowed strategies
- `inject-permission.ts` — attaches permission context
- `inject-assume-privilege.ts` — privilege escalation support
- `superAdmin.ts` — super admin flag injection

**Auth modes** (defined in `AuthMode` enum):
- **JWT** — user browser sessions (decoded from `Authorization: Bearer` header)
- **IDENTITY_ACCESS_TOKEN** — machine-to-machine identity tokens
  A TLS Certificate Auth token may carry an RFC 8705 `cnf` (`x5t#S256`) claim. `fnValidateIdentityAccessTokenFast` and renewal then reject it unless the proxy-forwarded client certificate matches (`assertCertificateBinding`).
- **SCIM_TOKEN** — SCIM provisioning tokens
- **OAUTH** — delegated user tokens from the `oauth-client` module. Same JWT shape and session binding as
  `JWT`, told apart by an `oauthClientId` claim. See [Delegated OAuth tokens](#delegated-oauth-tokens).

**Deprecated auth modes (do not use in new code):**
- **API_KEY** — user API keys (from `x-api-key` header). Deprecated — use identity access tokens instead.
- **SERVICE_TOKEN** — service tokens (Bearer tokens starting with `st.` prefix). Deprecated — use identity access tokens instead.

If you encounter `API_KEY` or `SERVICE_TOKEN` in existing code, do not replicate them in new routes or services. All new machine authentication should use `IDENTITY_ACCESS_TOKEN`.

Token detection logic in `inject-identity.ts` checks `x-api-key` header first, then parses `Authorization: Bearer` and inspects JWT `authTokenType` field to determine mode.

#### Delegated OAuth tokens

Two grants issue them: the authorization code flow (consented `scopes`) and the RFC 8693 token exchange
(`delegation: "full"`, no scopes).

**Opting a route in.** `verify-auth.ts` rejects `AuthMode.OAUTH` on any route that doesn't list it; most
product `AuthMode.JWT` routes do. Two things have to hold before adding it. The route must not be an
administration route (below). And the handler must actually **check** a CASL ability, because that check
is where the granted scopes get intersected in: building an ability and throwing it away
(`getOrgPermission` used as a membership gate), or reading `hasRole(...)` off its return value, narrows
nothing; `hasRole` is the easy one to miss because it reads like authorization. Rough proxy: nothing
passing `requireOrg: false` accepts `AuthMode.OAUTH`.

**Administration is read-only for a delegated token.** A delegated token can look at anything the
authorizing user can, but it changes nothing under **Administration**: no create, update, or delete, at
either level. The frontend nav is the boundary, and it is worth opening (`OrgNav.tsx`,
`OrgSubmenuView.tsx`, `SecretManagerNav.tsx`, `submenus.tsx`) when a new route's side is unclear. The
surfaces it covers:

- **org access control** — members, groups, identities (including memberships, templates, and all
  thirteen `identity-*-auth-router.ts`), org roles, invites, external group-to-role mapping
- **usage & billing** — `ee/v1/license-router.ts`, `ee/v1/license-v2-router.ts`
- **audit logs** — the org and project log reads plus audit log streams
- **org settings** — org update and incident contacts, SSO and provisioning (SAML, OIDC, LDAP, SCIM,
  GitHub org sync, email domains), networking (gateways, gateway pools, relays), encryption (external
  KMS, KMIP, KMIP servers, HSM connectors), project templates, sub-orgs, workflow integrations
  (Slack, Microsoft Teams), and the org-wide EnvKey/Vault migrations on the settings tab
- **project access control** — memberships for users, groups and identities, project roles, additional
  privileges, folder grants, project keys, service tokens, and the per-resource equivalents under PAM,
  cert manager, code signing and PKI applications
- **project settings** — project update and delete, environments, tags, approval policies, webhooks,
  trusted IPs, secret validation rules, project KMS, blind index, audit log retention, E2EE upgrade,
  and the secret scanning `configs` routes

In practice that means `GET` keeps `AuthMode.OAUTH` and `POST` / `PATCH` / `PUT` / `DELETE` lose it. The
method is the test because `CODE_QUALITY.md` already requires `GET` to be safe, so it needs no per-route
judgment. Two adjustments to that rule, both small enough to enumerate:

- **A `POST` that only reads keeps it.** Five endpoints are `POST` solely because a lookup needs a request
  body: `POST /v1/identities/search`, `POST /v2/identities/search`, `POST /v2/identities/search/count`,
  and the two `memberships/details` routes. All five check a CASL read ability.
- **A read that hands back credential material loses it**, because the point of closing administration is
  that a third-party application should not end up holding the org's secrets. Five routes:
  `GET /v1/sso/oidc/config` (`clientSecret`), `GET /v1/ldap/config` (`bindPass`),
  `GET /v1/workspace/:projectId/kms/backup` (the project's KMS backup blob), and Slack
  `GET /install` / `GET /reinstall`, which gate on `OrgPermissionActions.Create` and exist only to start
  an install. Everything else reads through a sanitized schema — `sanitizedClientSecretSchema` returns a
  prefix, `sanitizedExternalSchemaForGetById` drops provider credentials, `ScimTokensSchema` carries no
  token. Check the response schema, not the route name, before opening a new administration read.

Three things are first-party outright, because they sit outside an org and the nav boundary doesn't
reach them:
- account self-management (user, password, MFA, sessions, login, signup, notifications, announcements)
- super-admin routes (`v1/admin-router.ts`), where `verifySuperAdmin` reads
  `user.superAdmin` rather than an ability
- `POST /v2/organizations`, and the org reads that return more than the token's org: `GET /v1/organization`,
  `GET /v1/organization/accessible-with-sub-orgs`, `GET /v1/organization/:organizationId`. All pass
  `requireOrg: false`, so nothing narrows them

Everything else that used to be listed here individually — OAuth client CRUD, assume-privilege, deleting
an org or sub-org, minting SCIM tokens, KMIP client certificates or gateway / relay / KMIP-server
enrollment tokens, registering identity auth methods — is an administration write, and closed by the rule
above rather than by its own exception. Two of those reasons still generalize, so keep them in mind when a
**product** route does the same thing:

- **A route that leaves behind something able to authenticate later can't accept a delegated token.**
  Revocation reaches only the sessions tagged with `getOauthClientSessionUserAgent`, so a credential or an
  auth method bound to a key the caller holds survives deleting the application and rotating its secret,
  and authenticates as a principal no OAuth scope intersects. Whether the route hands secret material back
  is beside the point, so start any new route that writes a trust anchor (bound issuer, signing key, CA,
  cloud principal) first-party.
- **Nor can a route that reissues the caller's session.** `DELETE /v2/organizations/:organizationId`
  returns a fresh pair from `loginService.generateUserTokens`, which takes no delegation parameter, so a
  delegated caller would exit with a first-party session.

**Delegation markers.** A token carries `scopes` or `delegation: "full"`, never both
(`oauth-client-types.ts`). `permission-service` intersects the user's CASL rules with `scopes`
(`applyOauthScopeToOrgRules` / `applyOauthScopeToProjectRules`). `inject-identity.ts` sets
`RequestContextKey.OauthScopes` for every scope-narrowed token (even `[]`, which denies everything) and
leaves it unset only for full delegation. Matching full delegation **positively** is what makes a dropped
claim fail closed instead of promoting the token.

**The token endpoint's error contract is RFC 6749 §5.2, not the house envelope**, because generic OAuth
libraries branch on the `error` code. `OauthTokenError` (`oauth-token-error.ts`) carries the code and
derives the status from it (400; 401 for `invalid_client`, 500 for `server_error`), and the shared error
handler renders `{ error, error_description }`. When extending it:
- The handler's `try`/`catch` is the endpoint's only exit, and every `return` inside it is **awaited**: a
  bare `return promise` would resolve outside the `catch` and escape in the house envelope.
- `toOauthTokenError` defaults by **error class**, never message text: `UnauthorizedError` and
  `ForbiddenRequestError` take the rejected-grant code for that grant (`invalid_grant` on the redirect and
  refresh grants, `invalid_request` on token exchange, per RFC 8693 §2.2.2), `BadRequestError` takes
  `invalid_request`, and anything else becomes `server_error`, whose response carries no detail and whose
  original is logged. Both refusal classes are listed because the exchange rejects an unusable subject in
  two vocabularies: `exchangeSubjectToken`'s own membership checks raise `UnauthorizedError`, while
  `getOrgPermission` raises `ForbiddenRequestError` for the same kind of refusal. A new way to refuse a
  subject belongs in one of those two classes, or it lands in `server_error` as an unexplained 500.
- Throw `OauthTokenError` directly where that default is wrong: client authentication
  (`invalid_client`), a grant the client doesn't hold (`unauthorized_client`), a redirect-URI or PKCE
  mismatch (`invalid_grant`), the unsupported `scope` (`invalid_scope`) and `audience`/`resource`
  (`invalid_target`) parameters, and org misconfiguration or IdP outages (`server_error`).
- The route sets `attachValidation` so a schema failure reaches the handler; an unrecognized `grant_type`
  earns `unsupported_grant_type`.
- `toErrorDescription` sanitizes and bounds `error_description` at the render boundary, so no throw site
  has to remember RFC 6749's printable-ASCII restriction.
- Messages shared with a management route (the OIDC-config checks) take an error factory rather than
  throwing, since the two callers owe the same explanation in different envelopes.

**Token exchange trusts the org's OIDC SSO config, not per-client configuration**
(`oauth-token-exchange-fns.ts`), so the issuers that can vouch for a user are the ones that can already
log them in. The one per-application field is `tokenExchangeAudience`, and it does the security work:
without it, any token that issuer signed for anything in the estate is exchangeable. Enabling the grant,
changing the audience, and rotating the secret each need `OrgPermissionSsoActions.Edit` on top of the usual
`OauthClients` check (`checkSsoConfigPermission`), rotation included, since its response is a working
credential for acting as any of the org's users.

`getOrgPermission` is **not** a membership check: the org-scope query in `permission-dal.ts` never reads
`Membership.isActive` or `Membership.status`. Every other user token came from a browser login, where
`selectOrganization` rejects an inactive membership; the exchange has no login in front of it, so
`exchangeSubjectToken` checks membership state itself. Any future non-interactive way of minting a user
token needs the same check.

**Withdrawing an exchange application's authority revokes the tokens it already issued.** Deleting the
client, rotating its secret, and any update that narrows the exchange's trust (dropping the grant,
changing `tokenExchangeAudience`, switching `tokenExchangeIdpSatisfiesMfa` off) all call
`revokeSessionsByUserAgent`. `hasWithdrawnTokenExchangeTrust` and `hasClientAuthorityChanged` guard the
same fields, so a new field belongs in both. The test is whether it carries federation trust, not merely
whether it can be narrowed. `accessTokenTTL` is in neither: it only decides how long a new token lasts, so
revoking on a routine edit would surprise, and guarding it would fail in-flight exchanges. Widening
(turning the MFA declaration on) revokes nothing. Rotation revokes for exchange clients only, where the
secret alone mints tokens; in the redirect flow it has to be paired with a code or refresh token, so
blanket revocation would just sign everyone out. The session tag is per client, which is unambiguous
because `assertValidOauthClientGrantConfig` rejects the exchange grant alongside `authorization_code`, so
a service needing both registers twice.

That sweep only reaps sessions that already exist, so **the exchange rechecks the client after creating
its own session** (`findByIdForUpdate` + `hasClientAuthorityChanged`, re-running the sweep). The other
grants read an existing session rather than creating one, so they don't need it. The recheck has to be a
**locking** read on the primary, and both halves of that are load-bearing: each withdrawal path writes the
client and sweeps sessions inside one transaction, so a plain read still sees the pre-withdrawal row until
that transaction commits, and would clear a token whose session the sweep has already scanned past. A
replica read has the same hole for the length of the replication lag. Keeping the write and the sweep
atomic is what makes the lock the fix here; splitting them so the write commits first would reopen a
window where the sweep can fail on its own and leave the tokens live.

**Everything the exchange fetches from the IdP is cached for 10 minutes; nothing read from our own
database is**, so an admin editing the SSO config takes effect on the next request while the provider
never becomes a synchronous dependency of the middleware's own request path. The cache invariants
(rejections evicted, in-flight promise shared, expiry rebuilding the SSRF-pinned agent) are documented in
`oauth-token-exchange-fns.ts`.

### Resolving Users From Provisioning Identifiers

Every invite / removal path resolves a person by `users.username` (which always equals their email),
never by `users.email` and never by a join. An external provisioning system, though, often knows
people only by the identifier its IdP asserts, a UPN like `m249913@one.example.com` rather than the
mailbox `robert@example.com`. SSO login already records that identifier as
`user_aliases.externalId`, so the two are reconcilable without making `username` diverge from
`email`.

`resolveUsersBySsoExternalId` in `src/services/user-alias/user-alias-fns.ts` is the one place that
does it, backed by `userAliasDAL.findBySsoExternalIds`. Callers run it **only after an exact
`username` lookup has missed**, so an alias can never shadow a real account. It is wired into
`$getUsers` (`membership-user-service.ts`, the single funnel for org, project, and cert-manager
invites), `project-membership-service.ts` (removal and membership read-back), and PAM's
`addProductUserMembers`.

Four invariants, each load-bearing:

- **Scope by `orgId` *and* `aliasType`.** `user_aliases.orgId` is NULL for the global
  google/github/gitlab aliases, so `whereIn("orgId", ...)` excludes them outright and the
  `ORG_SCOPED_USER_ALIAS_TYPES` filter is the second lock. Without both, an org admin could name a
  user in another tenant.
- **Match `externalId` exactly, never folded.** It is a case-sensitive identifier (OIDC Core defines
  `sub` that way, as does SAML for nameID) and is stored verbatim, so folding case could collapse two
  distinct IdP subjects onto one identifier. The known consequence: because both invite routes
  lowercase their input (`sanitizeEmail`, and the `.refine` on `usernames`), an IdP that asserts
  mixed-case identifiers cannot be provisioned against at all. Supporting those means relaxing that
  input validation so the exact identifier survives to the query, not loosening the comparison.
  `adoptProvisionedShadowUser` does not fold either. It derives its lookup key with `sanitizeEmail`
  because it searches the `users.username` namespace, where lowercase is canonical, but it then
  **refuses any identifier that is not already canonical** rather than adopting on the folded match.
  It once did adopt, and that was a real hole: a subject differing only by case is a different
  subject, so it could take over the placeholder provisioned for another one and inherit its grants.
  Folding bought nothing anyway, since the alias written afterwards is verbatim and this exact-match
  lookup could never find it again, stranding the grant where provisioning cannot manage it.
- **Ambiguity is an error.** Nothing constrains `(externalId, aliasType)` to be unique for the
  org-scoped types (only the social ones have a partial unique index), so an identifier can reach two
  users. Picking one would be a guess about which human it names, and the cost of guessing wrong is
  granting access to the wrong person. Several aliases on the *same* user are not a conflict.
- **Dedupe resolved users by `id`.** An identifier now reaches a user by either their username or
  their alias, so one request can name the same person twice. Undeduped, that violates
  `membership_unique_user_org` and surfaces as a 500.

Nothing constrains a user to one alias per `(orgId, aliasType)`, and SSO login mints a new one
whenever the asserted subject differs from what SCIM last wrote, so **a SCIM read must match a
`userName` against every one of a user's aliases, not the newest**. Matching only the newest made a
provisioned user vanish from `GET /Users?filter=userName eq "..."` the first time they logged in
under a different subject, and the IdP answered that empty lookup by provisioning them again. It was
intermittent because `replaceScimUser` rewrites `externalId` on *all* of a user's aliases, so the
next PUT healed it until the next login. `$buildScimMembershipQuery` (`org-dal.ts`) therefore
answers every `userName` comparison with an `EXISTS` over the user's aliases, so the predicate is per
user rather than per alias row. That matters for negation: evaluated per row, `userName ne "x"` or
`not (userName eq "x")` would keep a user through their other alias, and a member with no alias at
all would fall out through a NULL comparison. The parser (`lib/knex/scim.ts`) lets an attribute
resolve to a handler instead of a column for exactly this. Display is separate: the query still
joins every alias and collapses the fan-out with `DISTINCT ON`, ranked so the alias row that
satisfies the filter wins and the newest is the fallback, which is how a lookup by an older alias
echoes that alias back. The list query also carries a total order, because an IdP walking
`startIndex`/`count` over an unordered result loses users the same way.

A related case sits on the login side: provisioning can name someone before they have ever logged
in, leaving a placeholder account keyed on the identifier instead of the mailbox.
`adoptProvisionedShadowUser` (same file, wired into `oidcLogin`'s no-alias branch) adopts that row
and rewrites it to the asserted mailbox rather than creating a second account. It refuses anything a
human has claimed (accepted, email-verified, holding a password), anything already bound to an IdP
(any alias, any org), ghosts, anything whose identifier is not already canonical (see above), and
anything without a membership in the org doing the login.

One case is a refusal to *log in* rather than a refusal to adopt: a placeholder whose membership in
the login org is **inactive**. Declining is not neutral there, because the caller reads a `null` as
"no placeholder" and creates a second account with a fresh active membership, handing a deactivated
person their org back (`selectOrganization` then accepts it). So the inactive check is resolved
before every remaining decline — the alias check and the cross-tenant check both sit after it — and
it throws the same `ForbiddenRequestError` an already-aliased deactivated member gets.

It also refuses a placeholder that holds an org membership **outside** the login org's own sub-org
family, and that one is the security-critical check rather than a tidiness one. The username lookup
that finds the placeholder is global, so a second tenant that invited the same identifier shares the
row; adopting it would hand the login org's IdP subject that tenant's memberships, and
`selectOrganization` accepts a membership in any status (promoting `Invited` to `Accepted` on
arrival), so nothing downstream stops the inherited access from being used. A project membership
always implies an org membership in the same org, so the org-scope check covers project access too.

Adoption also recovers from a unique violation on `users.username`, because the caller's preceding
read is not a lock. That recovery has to run inside a savepoint (`tx.transaction()`, which knex
compiles to `SAVEPOINT`/`ROLLBACK TO SAVEPOINT` on the same connection): Postgres aborts the whole
transaction on a constraint violation, so an unscoped retry would fail with `25P02`, taking the
caller's remaining alias and membership writes with it. SAML and LDAP have structurally identical
branches and are deliberately not wired up.

Because adoption rewrites an existing account's `username` and `email`, it emits an
`OIDC_PROVISIONED_PLACEHOLDER_ADOPTED` audit event carrying the before and after, not just an
application log: if one of the refusal checks above ever regresses, the audit trail is what makes it
findable. That event must never fire on the unique-violation recovery path, where the returned user
is whoever won the race rather than a rewritten placeholder. `adoptProvisionedShadowUser` draws that
line by returning `adoptedFromUsername: null` for the yield, and the caller keys the audit log on
it.

That trail is best-effort, not guaranteed. `audit-log-queue.ts` drops every entry at push time when
`plan.auditLogsRetentionDays` is 0, which is the default for a self-hosted instance with no
audit-log entitlement, so on those deployments only the `logger.info` line survives an adoption.
(`null` is the License Server's "No limit" and keeps everything; see `audit-log-retention-fns.ts`.)
Do not special-case this event past the retention gate; treat the application log as the floor and
the audit event as the addition for licensed instances.

### Profile Sync From The IdP (SSO-enforced orgs)

An IdP keyed on a stable identifier lets someone change mailbox and display name without changing
who they are, so our copy of both goes stale: notification mail goes to an address that no longer
exists, and every audit entry written from then on records it. `syncSsoUserProfile`
(`src/services/user-alias/user-alias-fns.ts`) carries the asserted email and name onto the account,
and is called from all three login services right after `ensureSsoAccountVerified`, outside the
caller's transaction, with its result flowing into the session.

The gate is `organization.authEnforced` **and** a verified alias, and both halves matter. Enforcement
is the org saying the IdP is authoritative for identity, which is the same claim that already skips
email verification at signup. The verified alias is the proof that the IdP controls *this* account:
an unverified alias asserting an unrecognized email is exactly what `isStaleSsoAlias` exists to
catch, and reading that as a rename would let a stale alias rewrite somebody else's account. One
consequence to know: a legacy unverified alias whose email changed before its next login is stale,
so it gets the email-verification fallback (a code sent to the dead mailbox) rather than a sync.

Three invariants:

- **It never fails a login.** A rename that could not be applied leaves stale data, which is what we
  already had; a throw locks the person out of an org that has no other way in. Every failure path
  returns the unchanged user.
- **It only renames an address the org owns, onto another address the org owns.** Both halves are
  checked in the helper against the org's verified domains. The user row is global rather than
  org-scoped, so without the first half an org could rename an account that merely carries one of
  its aliases and rewrite the identity every other org of that user sees. Every login path
  establishes both already (`verifyEmailDomainOwnership` is a positive check: the domain must be
  verified *for this org*, and the alias branch runs it against the existing account's username),
  so the helper's copy is there to keep the rename from outliving those checks. It is unreachable
  today, and audits the skip anyway (`SSO_USER_EMAIL_SYNC_SKIPPED` with
  `reason: "domain-not-owned"`) so a refactor that removes a caller's check leaves a trail rather
  than a silently stale account.
- **It never renames onto an occupied address.** `users.username` is globally unique and the row is
  global rather than org-scoped, so the asserted address may already be a personal signup or an
  unmerged duplicate. The conflict is recorded (`SSO_USER_EMAIL_SYNC_SKIPPED` with
  `reason: "address-taken"`) and the email is left alone; the name still syncs. The preceding read
  is not a lock, so a unique violation lands on the same path.

SCIM is the other half of the same story and moves with it. `updateScimUser` / `replaceScimUser`
rejected every email change outright, which left the data stale *and* put the provisioning job in a
permanent error state (Entra quarantines after repeated failures). Both now accept the change under
the same `authEnforced` gate via `$resolveScimEmailChange`, and answer an occupied address with
`409 uniqueness` rather than a constraint-shaped 500. Self-service email change
(`user-service.ts`) is refused when the next login would overwrite it anyway, which
`$getManagedEmailReason` narrows to the case that actually would: the account's own address sits on a
domain one of its SSO-enforced orgs has verified. Membership in an enforced org is not the test, since
the user row is global and an address outside that org's domains is one `syncSsoUserProfile` will not
touch. SCIM stays a blanket refusal, because the directory provisions the address either way.

### Permission System (CASL)

Uses CASL (`@casl/ability`) with MongoDB-style rules. Permission logic lives in `src/ee/services/permission/`:
- `permission-service.ts` — factory that builds CASL abilities from user/identity roles
- `project-permission.ts` — defines project-level permission actions and subjects
- `org-permission.ts` — defines org-level permission actions and subjects

**Project permission actions** include standard CRUD plus specialized ones like `DescribeSecret` (see metadata without value), `ReadValue`, `GrantPrivileges`, `AssumePrivileges`, `Lease` (for dynamic secrets). See `ProjectPermissionActions`, `ProjectPermissionSecretActions`, `ProjectPermissionDynamicSecretActions`, and `ProjectPermissionIdentityActions` enums in `project-permission.ts`.

Built-in roles: `Admin`, `Member`, `Viewer`, `NoAccess`. For PAM and Agent Vault `getPredefinedRoles` (`project-role-fns.ts`) returns only `Admin` and `Member`, because their permission dispatch resolves every other slug to the member set; the role factory delegates to that one function, so every role picker follows. Custom roles use unpacked CASL rules stored in the database. Rules can include conditions with operators `$IN`, `$EQ`, `$NEQ`, `$GLOB` (for pattern matching like `prod-*`). See `PermissionConditionSchema` in `permission-types.ts`.

**Privilege boundaries mean different things on the two privilege systems.** `organizations.shouldUseNewPrivilegeSystem` (default `true`, backfilled `false` for orgs predating March 2025) picks which. `validatePrivilegeChangeOperation` / `assertRoleSetBoundary` (`permission-fns.ts`) are the shim: on the new system they collapse to `actorPermission.can(action, subject)`, on the legacy one they run `validatePermissionBoundary`, requiring the actor to out-rank every role the target holds. So a boundary at a call site that already gated on the same action is a no-op for new-system orgs and the only protection for legacy ones. Two consequences: "the route checks the action" is not a substitute for a boundary, and adding one is not a behavior change for most tenants. Prefer `getOrgPermissionByRoles` / `getProjectPermissionByRoles` + `assertRoleSetBoundary` over fetching the target's merged ability. It bounds each role separately, and it avoids `getProjectPermission`, which stamps whichever actor it was called for onto the request context the audit log reads.

**Identity auth-method access goes through `assertIdentityAuthAccessAllowed`** (`src/services/identity/identity-auth-permission-fns.ts`), because repointing an identity's auth trust lets the caller authenticate as that identity. It's both the gate and the boundary: it checks the identity action itself on both privilege systems, and on legacy also makes the actor out-rank every grant the target holds. The boundary alone isn't enough, since it passes for any target you cover, and for an org identity it only sees org-scope grants, so a no-access org identity that's admin in projects would be open to anyone. Callers don't repeat the action check. The 13 auth services and the template update call it once per attach/update/revoke, outside the `identity.projectId` branch so both scopes are covered, and a new auth method should too. Only the fine-grained action gates these paths, at both scopes; the old coarse org checks (`edit`, `create`, `read`, `delete`) are gone. Credential issuance (`createTokenAuthToken`, `createUniversalAuthClientSecret`) goes through it under `create-token`, since minting a credential is the same escalation as repointing the trust, and so do the per-credential paths: `updateTokenAuthToken` under `create-token`, `getUniversalAuthClientSecrets` / `getUniversalAuthClientSecretById` under `get-token`, and `revokeUniversalAuthClientSecret` under `delete-token`. **`PROJECT_ACTION_BY_ORG_ACTION` must map each org action to its project equivalent**, since project identities get checked against the mapped one. `revokeTokenAuthToken` and `clearUniversalAuthLockouts` are still unbounded in both scopes (and the former gates on `edit` where its UA counterpart gates on `delete-token`); that predates the helper and is a deliberate gap, not an oversight to copy. The target's grants come from `permissionService.getActorGrantAbilities`, not from a membership lookup, and it returns one ability per grant rather than per role. Two things a role-slug resolver misses: a group-derived membership carries a NULL `actorIdentityId`, so `membershipIdentityDAL.getIdentityById` never sees it, and an additional privilege carries a raw permission blob with no slug at all, so no `*PermissionByRoles` path can express it. Either omission clears an actor that out-ranks the target's direct roles but not its effective access. `getActorGrantAbilities` reads the same `permissionDAL.getPermission` query the ability itself is built from, so the bounded set cannot drift from the effective one.

**Auth template propagation is serialized with row locks on `identity_auth_templates`.** A template edit rewrites every linked identity's auth, and a link copies the template's values onto the identity row, so the two must not interleave: a link landing between the edit's permission loop and its writes would be rewritten by an actor never checked against it, and an edit landing between a link's validation and its insert would leave the identity holding values the template no longer has. `updateTemplate` and `deleteTemplate` take the row `FOR UPDATE` as the first statement of their transaction, and the edit re-reads usages through `tx` under that lock and returns a 409 if an identity appeared since the checked set was built; its propagation writes are also scoped to the checked ids so the privilege invariant does not rest on the lock. Every path that copies template values onto an identity (the three attaches, and the three identity updates when they load a template) calls `assertTemplateUnchangedForLink` (`ee/services/identity-auth-template/identity-auth-template-fns.ts`) as the first statement of its transaction: a `FOR SHARE` read plus an `updatedAt` comparison against the row it validated outside the transaction, 409 on mismatch. Lock order is template row first, identity row second; unlink and non-linking identity updates take no template lock and never wait on it, so no cycle is possible. Nothing slow may sit under either lock, which is why LDAP attach runs `testLDAPConfig` before its transaction opens. A new path that copies template values onto an identity must call the helper inside its transaction.

**Deny an RBAC check by throwing through CASL, never with `ForbiddenRequestError`.** `audit-log-permission-denied.ts` records a permission-denied audit event for every CASL `ForbiddenError` and `PermissionBoundaryError` a request throws, and skips plain `ForbiddenRequestError` because most of those are auth-mode, plan and ownership refusals. A service that calls `permission.can()` and throws `ForbiddenRequestError` itself therefore produces no denial event, and nothing fails to tell you. When the check has a fallback (a second action, an approver, an application grant), test the fallbacks first and make `ForbiddenError.from(permission).throwUnlessCan(...)` the last check, so the denial is recorded with a real action and subject. Keep `ForbiddenRequestError` for refusals that are not about a permission.

**Project permission caching** uses a fingerprint-based two-tier cache (`withCacheFingerprint` in `src/lib/cache/with-cache.ts`):
- **Short-lived marker** (10s TTL) in Redis — while present, cached data is served with 0 DB reads.
- **Long-lived data payload** (10m TTL) in Redis — holds the full permission blob plus a fingerprint hash.
- On marker expiry, a lightweight **fingerprint** is computed (`getProjectPermissionFingerprint` in `permission-fns.ts`: the `getPermissionFingerprint` query in `permission-dal.ts` plus the project's folder-permission version counter). If it matches the cached payload, the marker is reset; otherwise, a full data re-fetch occurs.
- The fingerprint covers **both project-scoped and org-scoped** memberships for the actor, so org-level changes (e.g. SSO bypass grant/revoke, org role edits) also trigger cache invalidation.
- `filterTemporary` in `flattenActiveRolesFromMemberships` runs on every request as a real-time safety net — it filters out expired temporary access regardless of cache state, so access revocation for timed roles/privileges is immediate.
- **Membership and role changes need no explicit invalidation call.** The fingerprint self-corrects within the marker TTL (10s eventual consistency for access granting). The old `invalidateProjectPermissionCache` / DAL version counter pattern has been removed. Folder grants are the one exception: they are covered by a version counter that writers must bump (see Folder RBAC below).
- Cache helpers (`cacheGet`, `cacheSet`, `applyReviver`) in `src/lib/cache/with-cache.ts` are shared between the simple `withCache` and the fingerprint-based `withCacheFingerprint`.

**Folder RBAC (folder-scoped privileges)**: `additional_privileges` rows with a `folderId` + `role` (`SecretFolderRole` tiers in `folder-roles.ts`) are fetched by `$fetchProjectPermissionData` and ride in the **same** cached blob as the membership permissions, behind the same fingerprint — there is no separate folder cache. `getProjectPermissionFingerprint` (`permission-fns.ts`) is that fingerprint: `permissionDAL.getPermissionFingerprint` with the project's Postgres folder-permission version counter appended, and it is the only fingerprint source (the secret-read ETag path in `secret-v2-bridge-service.ts` uses it too). The counter is what covers folder grants, because `getPermissionFingerprint` excludes `folderId`-scoped rows and a grant's effective `secretPath` is derived from the folder tree rather than stored on the grant, so a rename changes what a grant allows without touching any row. **Only writes the membership fingerprint cannot see bump it**, via `permissionService.invalidateProjectFolderPermissionCache`: the folder-access grant create/update/delete endpoints and every folder rename/move/delete path. Membership teardowns (user, identity or group leaving a project or org, actor leaving a group) must **not** bump, even though they reap `additional_privileges` rows: they delete a `Membership` or group-membership row that the actor's `getPermissionFingerprint` already hashes, so the blob is invalidated on the same marker expiry and a bump would only be a second invalidation of the same entry. That argument holds only while a teardown reaps grants in exactly the projects the actor is losing (`filterProjectsByUserMembership` / `filterProjectsByIdentityMembership`); a reap that reached a project whose membership is untouched would need the counter again. The grants are stored raw in the blob and filtered through `isActiveRole` per request, so a temporary grant lapsing takes effect immediately; admins skip the fetch entirely, and the fingerprint's `rExp` column makes a temporary admin role lapsing re-evaluate that gate. When an actor holds folder grants, `buildProjectPermissionRules` appends per-grant CASL rules built by `buildFolderScopedPrivilegeRules` (`permission-fns.ts`): a deny of every secretPath-capable subject conditioned on `{ environment, secretPath }` (exact path, folder-only, subfolders fall back to base roles), followed by the folder role's allows with the same conditions. CASL gives the last matching rule precedence, so the folder role fully replaces base permissions at the granted path and nowhere else. The deny list `FOLDER_SCOPED_DENY_RULES` (`folder-roles.ts`) is deliberately literal: `folder-scoped-privilege-rules.test.ts` enumerates `ProjectPermissionV2Schema` and fails when a new secretPath-scoped subject or action is added, forcing a human to extend the deny list and reconsider the role tiers. `getProjectPermission` and the project-wide `getProjectPermissions` evaluate folder grants (the latter loads every grant in the project in one query and skips admins the same way); audits do not yet. The folder access sheet endpoints (`folderPermissionService.listFolderAccessUsers` / `listFolderAccessIdentities`) answer "who has access on this folder" without building an ability per actor: `folder-access-roles-fns.ts` builds one ability per distinct project role, probes it with every `(action, subject)` pair from `FOLDER_SCOPED_DENY_RULES` plus `SecretFolders.Read`, and caches the evaluated roster per `(projectId, folderId, actorType)` with `withCacheFingerprint` (10m data / 20s marker, fingerprint = membership counts and max timestamps plus the folder's env and path). Folder grants are merged live so a grant or revoke shows on the next request.

### Request-Scoped Memoization

A per-request in-memory cache that eliminates redundant DB reads within a single HTTP request. Defined in `src/lib/request-context/request-memoizer.ts`, attached to Fastify's `@fastify/request-context` as the `memoizer` field (initialized in `src/server/app.ts`). Cache is automatically garbage-collected when the request ends — zero staleness risk, zero infrastructure.

**How it works**: `RequestMemoizer` wraps a `Map<string, unknown>` with an async `getOrSet(key, fetcher)` method. Concurrent calls for the same key coalesce onto a single fetcher invocation (in-flight deduplication). The `requestMemoize(key, fetcher)` helper reads the memoizer from request context and falls back to direct execution when no context exists (e.g. queue workers).

**Currently memoized**:
- `getProjectPermission` — full-function result (keyed by projectId + actor + actorId + actorOrgId + actorAuthMethod + actionProjectType). Eliminates redundant permission checks in batch secret operations (50 secrets → 1 DB round-trip instead of 50).
- `getOrgPermission` — full-function result (keyed by orgId + actor + actorId + actorOrgId + actorAuthMethod + scope).
- `projectDAL.findById` — in permission-service.ts and project-bot-fns.ts. Deduplicates 4 of the 5 redundant project lookups seen per secret read request.
- `userDAL.findById` / `identityDAL.findById` — in permission-service.ts. Eliminates the redundant actor lookup during permission resolution.

**Usage pattern**:
```ts
import { requestMemoize } from "@app/lib/request-context/request-memoizer";

// In a service or function called during request handling:
const project = await requestMemoize(
  `project:findById:${projectId}`,
  () => projectDAL.findById(projectId)
);
```

**When to add more items to request-scoped memoization**:
- The data is **read-only within the request** — no mutations to the same record happen between reads.
- The same DAL call (same table, same ID) is made **2+ times in the same request** across different services or functions. Check with Datadog traces or by searching for the DAL method across call sites in the hot path.
- The call does **NOT use a DB transaction** (`trx` parameter). Transactional reads may see different data than read-replica results; memoizing them could return stale data.
- The call is on a **hot path** (auth, permissions, secret CRUD). Low-frequency admin endpoints don't benefit enough to justify the added indirection.

**When NOT to use**:
- Inside DB transactions — pass `trx` directly, skip memoization.
- For data mutated within the request and re-read (e.g. KMS key creation writes to the project row, then re-reads it).
- In queue workers or background jobs — the helper falls back gracefully, but there's no request lifecycle to scope the cache.
- For write operations — only memoize reads.

**Key format convention**: `<entity>:<method>:<id>` for DAL calls (e.g. `project:findById:${projectId}`), `permission:<scope>:<id>:...` for permission results.

### Queue System (BullMQ)

Queue infrastructure in `src/queue/queue-service.ts`. Defines 30+ named queues via `QueueName` enum (e.g., `SecretRotation`, `AuditLog`, `IntegrationSync`, `SecretReplication`, `SecretSync`, `DynamicSecretRevocation`). Each queue has typed payloads defined in `TQueueJobTypes`.

Queue jobs support: delays, attempts with exponential/fixed backoff, and completion/failure cleanup. **Use BullMQ only for event-driven, payload-carrying work** — jobs enqueued in response to a request or another job (audit log writes, integration syncs, secret replication, webhook fan-out, etc.).

**Do NOT use BullMQ repeatable jobs or `JobScheduler` for recurring/cron-pattern work.** All scheduled/periodic tasks must use the cron manager (see below). The previous BullMQ-repeatable pattern has been migrated off, and `queueServiceFactory` actively cleans up stale repeatable queues and schedulers on boot (`src/queue/queue-service.ts:585-650`) — re-introducing a BullMQ repeatable will collide with that cleanup and cause double execution.

Queue handler factories (e.g., `src/services/secret/secret-queue.ts`) follow the same DI pattern as services — they receive DALs and services as dependencies.

`queueService.start(name, handler, opts)` accepts `concurrency` (per-worker parallelism ceiling) and BullMQ's `limiter: { max, duration }` (fleet-wide throughput cap, coordinated via Redis). Use both to **rate-shape DB-heavy background work** so a large backlog drains as an even plateau instead of a burst — see `src/services/project/project-cleanup-queue.ts`. The cron cadence must not be the pacer; load is bounded by `concurrency × per-job cost`, and the limiter caps steady throughput.

**`INFISICAL_RUN_MODES` gates the consumer, never the producer.** `start()` creates the BullMQ `Queue` for every queue in every run mode, and only skips creating the `Worker` when the queue isn't consumed by this pod: `secret-scanning` covers `SECRET_SCANNING_QUEUES`, `general-workers` covers everything else. This invariant is what makes splitting the fleet safe — an API-only pod runs no workers at all but must still be able to enqueue, since `queue()` silently no-ops on an uninitialized queue (`await q?.add(...)`) and would otherwise drop every job destined for another pod's worker. It also means `upsertJobScheduler` works from any pod, so boot-time scheduling needs no run-mode branch.

`QUEUE_WORKERS_ENABLED` and `QUEUE_WORKER_PROFILE` were replaced by `INFISICAL_RUN_MODES` and no longer exist.

**Worker heartbeats detect a fleet nobody deployed**, since an ungated producer means an `api`-only deployment silently queues work nothing consumes. In `src/lib/worker-heartbeat/worker-heartbeat.ts`: a `general-workers` pod `startReporting`s itself into a per-worker-type sorted set scored by its heartbeat deadline (60s beat, 5-minute TTL), and an `api` pod that doesn't run the fleet `startMonitoring`s it, logging an error while no instance reports. Observation only — never wire it into `/api/status`; a deployment missing its workers must still serve API traffic.

### Scheduled Jobs (Cron Manager)

Recurring work runs through the cron manager in `src/lib/cron/cron-job.ts` (`cronJobFactory`). A single instance is constructed in `src/server/routes/index.ts` (~line 541) and injected as `cronJob` into any service that needs to schedule periodic work. The factory exposes `register`, `start`, and `stop`; `start` is called once after construction, and `stop` is invoked during graceful shutdown to drain in-flight handlers.

**Only `general-workers` pods start the manager's timers**, so only they execute a scheduled handler; every pod still calls `register`. The separate `cronJobs` array in `src/server/routes/index.ts` is deliberately **not** gated: those refresh the process's own caches (license, env overrides), not fleet work.

**Per-process refreshes use `startLocalRefresh` (`src/lib/cron/local-refresh.ts`), never the cron manager and never a raw `new CronJob`.** The cron manager runs a job once per fleet, which would leave every other pod's in-memory state stale; a wall-clock cron pattern makes every pod fire in the same second. The helper starts each process at a random offset within one interval (random per process on purpose, unlike the manager's deterministic hash), skips a tick while the previous run is in flight, logs and swallows errors, and unrefs its timers. Its `stop()` handle is what goes in `cronJobs`. It records `infisical.local_refresh.*` on the `InfisicalCore` meter, labelled by `name` as `job.name`, so a new refresh needs no metric code; keep `name` a fixed string. A failing refresh keeps retrying on every tick rather than giving up after N failures, because stopping would freeze the pod's state at whatever it last loaded. The `consecutive_failures` gauge (reset on success) is the alerting signal.

**Why this exists instead of BullMQ repeatables**: cron runs are coordinated across pods via a slot-election scheme (5 participant slots backed by Redis SET NX/PX) plus per-run redlocks, so each fire executes exactly once across the fleet without the orphaned-scheduler / duplicate-execution failure modes the BullMQ `JobScheduler` had. The manager also handles crash recovery via lease TTLs, hang recovery via per-handler timeouts, and bounded exponential backoff that won't overlap with the next scheduled fire.

**Registering a cron job**:

1. Add a new entry to the `CronJobName` registry at the top of `src/lib/cron/cron-job.ts`. All cron names must be defined there — don't pass raw strings.
2. In the owning service/queue file, take `cronJob: TCronJobFactory` as a dependency and call `cronJob.register(...)` from an `init()` (or `start*()`) method:

   ```ts
   import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";

   export const myServiceFactory = ({ cronJob }: { cronJob: TCronJobFactory }) => {
     const init = () => {
       cronJob.register({
         name: CronJobName.MyJob,
         pattern: "*/5 * * * *",      // standard cron, UTC
         runHashTtlS: 60 * 60,        // how long the run hash lives in Redis
         enabled: !appCfg.isSecondaryInstance, // gate per-deploy if needed
         maxAttempts: 3,              // optional, default 3
         handler: async () => { /* work */ }
       });
     };
     return { init };
   };
   ```

3. Add a corresponding alarm in the infrastructure repo so the new job is monitored. Follow the existing pattern in `infisical-shared-cloud/modules/redis_alarms/main.tf` — every cron job must have an alarm defined there. Don't ship a new cron job without wiring up its alarm.

**Handler contract**:
- Each scheduled fire runs exactly once across the fleet: pods race for a per-run redlock, the winner executes the handler, and the others no-op. You don't need in-handler locking to guard against concurrent pods.
- Handlers must be idempotent at the boundary of `handlerTimeoutMs` (default 5 min). A timeout marks the run failed-final and waits for the next fire — it does NOT retry the same fire, because the timed-out handler may still be running.
- Failures (non-timeout) retry with exponential backoff (base 30 s, max 5 min) up to `maxAttempts`, but only if the retry would still fit before the next scheduled fire. Otherwise the next fire is treated as the natural retry.
- Long-running handlers should override `handlerTimeoutMs` / `leaseDurationMs` per-entry (must satisfy `handlerTimeoutMs <= leaseDurationMs`).
- **A fire is not picked up at its scheduled time; it is picked up at a deterministic offset past it.** Cron patterns cluster hard, so without a spread one pod claims a dozen handlers in a single tick. Two knobs bound that, both in `cronJobFactory`:
  - **Jitter** spreads pickup, and is *derived, never configured*: a job's window is `JITTER_INTERVAL_FRACTION` (0.25) of its own cron interval, capped by the factory's `maxJitterMs` (5 min), so a `*/5` job gets 75s and anything at or past a 20-minute interval gets the full 5 min. Two things follow from the fraction being below 1: a run can never reach its own next fire, and the first retry always fits (worst case `0.25 x interval + 30s backoff + 1s`, under `interval` for anything above ~41s, and cron cannot fire faster than every 60s). The offset within the window is `sha256(name) % window`, never random: every pod computes a run's eligibility independently and the run id is keyed on the *unjittered* fire, so a per-pod offset would break the Redis enqueue dedup and the lease logic. Only the pending-zset score carries the offset; the run id and `scheduled_at` are unchanged. Development wiring passes `maxJitterMs: 0` so a job runs when its pattern says. `register` rejects anything but a 5-field pattern: the retry model assumes minute granularity, and a 6-field pattern firing every 30s would have its first retry land past its own next fire. Sub-minute recurring work belongs on a `setInterval` or a queue, as the event outbox relay does.

**When to use cron vs. queue**:
- Scheduled/recurring (every N minutes, daily at X, cron pattern) → `cronJob.register(...)`.
- One-shot or event-triggered work (enqueued from a request handler or another job) → BullMQ queue + worker.
- A cron handler that fans out per-tenant work typically *enqueues BullMQ jobs* for each unit of work rather than doing the work inline — keep the cron tick fast and let the queue worker handle parallelism and retries for the actual payload.

See `src/services/health-alert/health-alert-queue.ts` for a minimal example, `src/services/resource-cleanup/resource-cleanup-queue.ts` for a service with multiple registrations, and `src/ee/services/secret-rotation-v2/secret-rotation-v2-queue.ts` for a cron-tick that fans out into a BullMQ queue.

### Alerting (shared module — reuse it, don't fork it)

`src/services/alert/` is **the** alerting module: one `alerts` table, one channel stack (email, Slack, webhook, PagerDuty), one recipient resolver, one encryption story for channel configs, one dedup + history + retention path, one cron tick that fans out into the `AlertDispatch` queue, and one set of routes (`src/server/routes/v1/alert-router.ts`, including `POST /channels/test`).

**Any new "notify someone when X happens" capability belongs here as a provider.** Do not write a per-domain alert service, per-domain channel table, or per-domain notification cron — that path produces N half-featured implementations (only one of which gets PagerDuty, or dedup, or a test button). `src/services/pki-alert-v2/` predates this module and is legacy. New PKI application alerts live here (`cert-manager.application`); existing PKI Alerts V2 rows were not migrated and keep firing, both project-wide and application-scoped, and can still be read and deleted through the deprecated routes. Creating and editing them is refused by `LEGACY_ALERT_WRITES_BLOCKED` (`pki-alert-v2-constants.ts`). Certificate code paths still queue it directly through `pkiAlertV2Queue`, next to the `certificateAlertEventEmitter` call that feeds this module (`emit` inside the issuance and renewal transactions, `notify` where there is none and after a revocation commits, so a failed event insert can never roll back a revocation the upstream CA already made). Don't add features to it or copy it.

Adding a new alertable resource type:

1. Implement `IResourceAlertProvider` (`alert-types.ts`) in `src/services/alert/providers/<name>-alert-provider.ts`, with its DAL alongside it. You supply: a dot-namespaced `resourceType` (e.g. `identity.authentication`), an `events` list (each event carries its own `conditionSchema` for the "when", so a scheduled expiry and an event-triggered change on the same resource type don't share one shape), `buildViewUrl` / `buildPayload` / `targetId`, one discovery method per trigger type you declare (below), and the two authorization hooks `assertPermission` + `assertResourceInScope`. Test sends need nothing from you: they go through the generic `buildTestAlertPayload` (`alert-test-payload-fns.ts`).
2. Register it on the singleton registry in `src/server/routes/index.ts` (`alertProviderRegistry.register(...)`).

That's it — CRUD routes, channel creation/rotation, recipient resolution, KMS encryption, dedup, history, retention pruning, test sends, and dispatch metrics all come for free, because the cron tick enumerates `alertProviderRegistry.resourceTypes()`. See `src/services/alert/providers/identity-credential-alert-provider.ts` for a complete example that declares both trigger types (`identity.authentication.expiry` scheduled, `identity.authentication.auth-method-changed` event-triggered). `audit-log-stream-alert-provider.ts` is the smallest event-only example: the stream delivery path emits `audit-log.stream.delivery-failed` (contract in `ee/services/audit-log-stream/audit-log-stream-events.ts`) only on the healthy to failing edge, in the transaction that drops the rows. Its alerts are org-wide only: the event carries no `resourceId`, because the consumer matches alerts by the event's `resourceId` and resource-less alerts only hear resource-less events.

**Each event declares how it fires**, and the trigger decides which discovery method the provider owes:

- `AlertTriggerType.Scheduled` → **`findScheduledTargets`**. The daily cron asks what is currently due, and the engine dedups per `(channel, target)` so a target rediscovered tomorrow is not alerted on twice.
- `AlertTriggerType.Event` → **`findEventTargets`**. The target is already known, so nothing is scanned for and **nothing is deduped**: an event that fired is one the customer asked to hear about, and unlike a daily scan it is never rediscovered. These reach the engine from the event outbox (below), never from the cron. The input carries the outbox row's whole `payload` next to `targetIds`: the module only reads `targetIds`, so an emitter can add the facts the notification needs (which auth method, who changed it) and the provider validates them with its own schema at delivery. Encoding facts into the target id is the wrong tool for that.

**`findEnabledForEvent` with no `projectId` matches every alert bound to the resource, any scope.** A resource that has no project of its own (an org-level identity) can still be watched from a project it is a member of, and `assertResourceInScope` already checked that binding at create. Given a `projectId`, it matches that project's alerts plus org-scoped ones.

`alertProviderRegistry.register` asserts that pairing at boot, so a provider that declares an event trigger without `findEventTargets` fails the process rather than silently no-op'ing in production. `triggerType` is derived from the provider's event definition inside `createAlert` and is never accepted from a request.

**Event-path reads go to the primary, `findEventTargets` included.** An empty read there is terminal (the event is marked delivered and never asked about again), so a replica that hasn't seen the commit loses the notification. `findEnabledForEvent` and the engine's channel lookup already do this; a provider's `findEventTargets` must too, since the target usually commits in the same transaction as the event. The scheduled path keeps the replica because tomorrow's scan asks again.

**An event only reaches channels that existed when it occurred.** `runAlertForEvent` drops channels created after `occurredAt`, because the outbox retries an event for up to an hour while any channel on any matching alert keeps failing, and each retry looks the alerts up again. Without it, an alert created (or a channel added) during that window is notified about something that happened before it existed.

**The history write is retried, then logged, never thrown.** The channels have already sent by then, so a throw can't undo anything and would re-notify on the event path.

Invariants worth knowing before extending it:

- **The alert module owns no CASL subject.** Each provider reuses its own resource's existing permissions inside `assertPermission`, so authorization stays with the domain that owns the resource.
- **New delivery mediums are channel definitions**, not providers: add one under `src/services/alert/channels/` and register it in `ALERT_CHANNEL_REGISTRY`. `directed: true` means the channel addresses principals and needs recipients (email); undirected channels carry their destination in config. `secretFields` drives masking on read and merge-from-stored on update.
- **Channel configs are encrypted** with the org/project KMS cipher (`alert-channel-crypto-fns.ts`) — never store or return them in plaintext.
- **One alert per `(scope, resource, event)` for resource-bound alerts**, enforced by the partial `alert_unique_scope_resource_event_bound` index. A provider that sets `supportsScopeWideAlerts` also accepts alerts with no `resourceId`: such an alert watches every resource of its type in scope, several can watch the same event because they differ by condition, and `assertConditionInScope` is where the provider checks the IDs inside a condition, on create and on update (newly added IDs only). `findEnabledForEvent` matches exactly: the bound alerts for a `resourceId`, or the resource-less ones when it is null. To let a scope-wide provider hear another provider's events without a second outbox write, an event definition can declare `sourceEvent: { resourceType, eventKey }`; the consumer then runs the source resource's alerts plus the resource-less alerts of every event sourced from it (`alertProviderRegistry.findEventsBySource`), each under its own `eventType`. Certificate Manager-wide (`cert-manager`) and signer (`cert-manager.signer`) alerts are scope-wide providers, and creating or editing either requires the project Admin role, since PKI permissions are admin or member, not granular. **Every provider hook is opt-in, and its absence must reproduce the behaviour identity alerts had before any other provider existed.** `recipientPolicy` decides who can receive: `atOrgScope` validates and resolves user and group recipients against the org instead of the alert's project, and `allowEmailAddresses` accepts plain `EMAIL` recipients and makes test sends validate recipients like create and update do, instead of silently dropping out-of-scope ones (application alerts set both). `includeLastRun` adds `lastRun` to alert responses, and `resourceName` is only returned by providers that implement `getResourceNames`, and `filters` (read-only `{ id, name }` lists for the IDs inside a condition, keyed by kind, such as `applications` and `profiles` on a Certificate Manager-wide alert, with a null name for deleted IDs, matching how approval policies return approvers) only by providers that implement `getFilters`. Resolve such names there rather than adding ID filters to another domain's list endpoint. `assertChannelTypesAllowed` is where a provider gates paid channel types on create and on update (new, retyped, or re-enabled channels only, so a downgraded org can still edit the alert). `getResourceNames` (batched) supplies the resource's display name for alert responses. `resolveProjectId` lets create, list and test sends omit `projectId` when the resource already belongs to one project (`resolveAlertProjectId` in `alert-provider-registry.ts`). `getTelemetryEvent` lets a provider map alert create, update and delete to its own PostHog event, so the shared router never branches on a resource type. Audit logs are not a provider hook: every alert, whatever its resource type, logs the generic `create-alert`, `update-alert`, `delete-alert` and `test-alert-channel` events (`getAuditEvent` in `alert-service.ts`), which carry `resourceType`, `resourceId` and `resourceName` (from `getResourceNames`, so a provider with resource-bound alerts must implement it) so admins can tell them apart. Do not add per-provider audit event types. The deprecated `pki/alerts` and `applications/:applicationId/alerts` routes only serve legacy PKI Alerts V2 rows. Add features to `/api/v1/alerts`, not to them.
- **Email channels accept plain addresses as `EMAIL` recipients when the provider opts in** (`recipientPolicy.allowEmailAddresses`), with the address as `principalId`, besides users and groups. Every address must be on one of the org's verified email domains, checked on create, update and test sends (`alert-channel-service.ts`), and again at send time, so an address on a domain the org has since removed stops receiving alerts. The resolver sends to them directly and skips an address that a user recipient on the same channel already covers.
- **`findScheduledTargets` must return most-urgent-first.** The engine's per-channel `maxTargetsPerRun` cap keeps the head of the list and defers the tail, so ordering is what guarantees the closest-to-expiry targets are never the dropped ones.
- **A `findScheduledTargets` that caps its own row count must honour `alreadyAlerted`.** The engine passes `{ alertId, channelIds, since }` (the alert's enabled channels and its dedup cutoff), and the provider drops targets every one of those channels already delivered since then, in SQL before the limit. Dedup otherwise runs after the fetch, so once more targets are due than the cap, the same head of the list comes back every run, is deduped, and nothing past it is ever alerted. For dedup windows shorter than the scan interval (daily reminders), also order least-recently-notified first. `scanExpiringCertificates` (`cert-manager-expiring-certificates-fns.ts`) does both.
- **Deleting an alertable resource does NOT delete its alerts. You have to reap them yourself.** `alerts.resourceId` is a plain string column with **no foreign key** to the resource's table (a provider's `resourceType` can point at anything), so nothing cascades. Skip the reap and the row survives as a dangling alert whose `findScheduledTargets` matches nothing and whose "view" link 404s. Two helpers on `alertService`, and picking the wrong one is the bug:
  - **`deleteAlertsForDeletedResource({ resourceType, resourceId })`** when the resource **row is gone**. It has **no scope filter** and reaps across every org and project. This is required, not just tidier: the same resource can be watched from another org (a root-org identity invited into a child org), so an `orgId`-filtered reap leaves those rows orphaned.
  - **`deleteAlertsForResource({ orgId, projectId?, resourceType, resourceId })`** when the resource merely **left a scope** (removed from a project, removed from an org) but still exists. Narrow on purpose: leaving one project must not drop the org-level alert, and leaving one org must not touch another org's alerts. Omitting `projectId` reaps the whole org, which is what org-membership removal wants since it cascades the project memberships.

  Wire it into **every** path that deletes or detaches the resource, not just the obvious one. A resource usually has several (a hard delete, an org-membership removal, a project-membership removal), and each needs its own reap. Call it **inside the delete transaction** and pass `tx`; the reap is pure DB (no KMS or network), so it is safe there. The `(resourceType, resourceId)` index on `alerts` is what keeps the unscoped reap off a seq scan, so a provider whose resource is deleted in bulk depends on it.

### Event Outbox (transactional and generic; alerting is its first consumer)

`src/services/event-outbox/` writes "this happened" as a row inside the caller's own transaction, so
an event is exactly as durable as the business write. Enqueueing to Redis after commit loses the event
whenever the pod dies or Redis is down in that window. It's not alert-specific:
`alert-event-consumer.ts` is one consumer on the shared registry, and anything else that needs
at-least-once delivery of a domain event registers next to it. The delegated approval dispatch consumer
(`delegated-approval/dispatch/delegated-approval-dispatch-consumer.ts`) is the second: it calls the external
approval system inline from `handle()` and maps the outcome to `Delivered` / `Retry` / `Failed`, with no queue hop.

**Naming:** the outbox is an implementation detail to both sides of it. Emitters depend on
`TEventEmitter` and pass a `TEventInput`; consumers implement `IEventConsumer`, receive `TEvent[]` (the
CloudEvents envelope) and return `TEventConsumerResult` with an `EventResultStatus`. Names with "outbox"
in them (the DAL, queue, cron jobs, metrics, `EventOutboxStatus`, `TOutboxFlushKey`) describe the
mechanism and stay inside the module and its wiring. A dependency field for the emitter is
`eventEmitter`, not `eventOutboxService`.

#### How to implement an event

Events are public API: their names and shapes are a contract we can't take back. Read the
[Event Standards and Versioning ADR](https://app.notion.com/p/3c2564692229804b93a1d0ff069016d6) and, for
an event about something being created, updated or deleted, the
[CRUD Event Design ADR](https://app.notion.com/p/3ff5646922298176bd92f298433f7d60). The steps below
summarise them.

1. **Define it with `defineEvent`, in the domain that emits it.** It goes in that domain's `*-events.ts`
   (eg `secret-folder/secret-folder-events.ts`), never in a consumer (see "The event contract belongs to
   the domain" below). The name is `com.infisical.<domain>.<entity>.<action>.v<version>`: lower-kebab
   segments, a singular entity, a past-tense action, and words a customer recognises rather than
   implementation detail. `defineEvent` throws on boot for a name that breaks this. Start at `v1` and
   bump only for a breaking change to `data`; adding an optional field is not one.
2. **Give `data` what a consumer needs to decide whether it cares and to find the thing again, not the
   thing itself.** That is ids, the owning scope (eg `projectId`) and the location where there is one
   (eg `environment` and `secretPath`). Consumers read the current state from the source. Never put
   secret values, credentials or other sensitive content in an event.
3. **For create, update and delete, use one `modified` event per entity.** Its `data` carries
   `modificationType` (`created`, `updated` or `deleted`) and, on an update that changed a field the
   event carries, `previous` with only those fields' earlier values. A change that keeps the entity's id
   is one `updated` event (eg a folder rename). A change that gives it a new id is `deleted` for the old
   id and `created` for the new one (eg a secret move). A delete that cascades is one event for the
   entity deleted, which covers everything beneath it. The secret, folder and secret import events
   (`secret-v2-bridge/secret-events.ts`, `secret-folder/secret-folder-events.ts`,
   `secret-import/secret-import-events.ts`) are the reference.
4. **Emit it in the transaction of the write it describes**, so the event is exactly as durable as that
   write: `SomeEventV1.emit(eventEmitter, data, tx)`, or `build` several and pass them to
   `eventEmitter.emit(events, tx)` in one call. Omit `tx` only when there is no such write left to be
   atomic with (eg after it already committed); the insert then runs on its own. Nothing around the emit
   is caught: a swallowed insert failure hands the caller a poisoned transaction (`25P02` on its next
   statement). When several services emit the same event, give it one helper in the domain's events
   file rather than repeating the call.

   ```ts
   await folderDAL.transaction(async (tx) => {
     const folder = await folderDAL.create({ ... }, tx);
     await FolderModifiedEventV1.emit(
       eventEmitter,
       { folderId: folder.id, projectId, environment, secretPath, modificationType: EventModificationType.Created },
       tx
     );
   });
   ```

5. **Consume it with an `IEventConsumer`** whose `subscribesTo` matches the definition's `type` and
   whose `dataSchema` is the definition's `data` schema. Nothing is written for an event no consumer
   subscribes to. Only `subscribesTo` runs before the insert, in memory: whether a customer configured
   anything for the resource is decided in the worker, and a row nobody wanted is marked `Delivered` and
   pruned within a day. If that ever matters for a hot event type, cache inside the consumer rather than
   adding a read to the emit path.

Events named before the ADR (eg `identity.authentication.auth-method-changed`) keep their names until
they move to it.

**How delivery works:**

- **The row owns retry state** (`attempts`, `nextRetryAt`, backoff, terminal `failed`); the consumer
  owns what "delivered" means and reports `Delivered` / `Retry` / `Failed` per event. The outbox keeps
  no per-event state for a consumer: what a retry should skip is recorded wherever the consumer already
  keeps delivery records, keyed by `TEvent.id` (stable across attempts). The alert consumer files each
  run under that id in `alert_history.eventId` and the engine skips channels already recorded there.
  The one piece of retry state a consumer sees is `TEvent.isFinalAttempt`: the row is `failed` after that
  attempt whatever the consumer returns, so a consumer with state of its own records the terminal outcome
  then (the delegated approval dispatch closes its request). A give-up from the stale-claim sweep never
  reaches a consumer.
  Backoff is exponential with jitter from 30s, and `MAX_OUTBOX_ATTEMPTS` puts the last attempt about an
  hour after the first, because a `failed` row is a notification nobody will receive. To replay failed
  rows by hand: `status = 'retry', attempts = 0, nextRetryAt = now()`.
- **A claim is a lease, and the lease is fenced.** The sweeper hands back any `processing` row whose
  `lockedAt` is older than `STALE_CLAIM_THRESHOLD_MS`, with the same backoff as a normal failure, and counts
  exhausted rows on the same metric. `drain` refreshes `lockedAt` while `handle` runs so a slow batch isn't
  delivered twice. Because `handle` has no time bound (unlike the audit log stream outbox, where every
  provider call has an HTTP timeout and a claim therefore can't outlive the threshold), that heartbeat can
  fail while the work carries on, so a claim can be recycled under a worker that is still alive. `claimBatch`
  stamps a `lockToken` and `extendClaims` / `commitResults` both require it, so the recycled worker's late
  result can't clear the new owner's lock or drop its outcome. `commitResults` returns how many rows it
  settled and `drain` logs a short settle: that count is the only signal that a batch went out twice, since
  the fence protects the bookkeeping but delivery stays at-least-once.
- **The envelope carries only what the outbox queries on.** `consumer`, `eventType`, and the retry and
  lock columns. Which tenant and resource an event concerns lives in `payload` under a shape the
  consumer's `dataSchema` declares, and that schema is where it is validated (the alert consumer
  requires `orgId` as a UUID). The outbox never groups, filters or indexes on any of it, so don't add a
  tenant or resource column back for a query nothing runs.
- **Discovery only looks at consumers registered in this process.** A row for any other name has nowhere
  to go here. It waits and shows up on the oldest-pending gauge instead.
- **Don't let one event's failure escape `handle`.** The outbox retries the whole batch when `handle`
  throws. Catch per event and report `Retry` for that event alone: `runEventsSerially` and
  `parseEventPayload` in `event-outbox-fns.ts` are that loop and the payload check, and every consumer
  uses them rather than its own copy. A consumer that calls a third party per event uses
  `runEventsConcurrentlyByKey` instead, so one slow tenant cannot hold up the batch while events for one
  resource still run one at a time (both delegated approval consumers key it on the delegated request).
- **BullMQ owns latency, not correctness.** `attempts: 1` on the flush job is intentional; retry lives
  on the row. A lost job costs one relay interval.
- **The relay is a `setInterval`, not a cron job.** It doesn't need exactly-once (`FOR UPDATE SKIP
  LOCKED` plus the flush `jobId` make concurrent pollers safe) and it needs a sub-minute cadence the
  cron manager can't give.
- **Delivery is serial per consumer, and ordering is best-effort.** The flush `jobId` is the consumer
  name, so one flush per consumer runs at a time and `drain` works through its backlog in bounded batches
  (`MAX_BATCHES_PER_FLUSH` x `OUTBOX_CLAIM_BATCH_SIZE` per flush; the next relay tick picks up the rest).
  `claimBatch` sorts by `id` (re-sorting what `RETURNING` gives back, which is arbitrary). A row inside
  its backoff window is skipped, so a later row can overtake it. That's deliberate: blocking a consumer
  behind its oldest failing row is the wrong trade for notifications. Don't promise strict ordering, and
  don't add a partition key back until a consumer needs one: no consumer today depends on the order two
  events for one resource arrive in, and each event is idempotent on its own through alert history.
- **Delivery is at-least-once.** `commitResults` is retried in-process, since by then the consumer has
  already sent; what's left is narrowed by the consumer's own delivery records.

**Watch `infisical.event_outbox.oldest_pending_age`.** It catches a dead relay, a wedged consumer and a
stuck claim alike. `lag` and `exhausted.count` are recorded by the outbox, labelled by consumer, so a
new consumer gets them for free.

**Adding an event-triggered alert** needs no outbox code: declare the event with
`triggerType: AlertTriggerType.Event`, implement `findEventTargets`, and emit with
`data: { orgId, projectId, resourceType, resourceId, targetIds, ...facts }` where `resourceType` is the
provider's. A
`resourceType` that doesn't declare the `eventType` fails the row terminally with both named, so a bad
emit site shows up in the logs on its first event.

Approval lifecycle events reach the outbox through `TApprovalResource.buildEvent`, which the approval
service emits inside each transition's transaction (PAM folder alerts use it).

**The event contract belongs to the domain that emits it, not to a consumer.** The identity auth method
event (key, resource type, change enum, payload schema, and the `emitIdentityAuthMethodChanged` helper)
lives in `src/services/identity/identity-auth-method-events.ts`. The 13 auth method services import the
helper from there and the alert provider imports the schema from there, so neither depends on the other
and a second consumer of the same event has one place to import from. When several services fire the same
event, give it one such helper rather than repeating the `emit` literal: the helper owns the payload shape,
and the provider's test parses what the helper emits with the delivery schema. A bare `updateById` had to
become a short transaction for this; the cache invalidation that follows it stays outside, after commit.

The DAL is covered by `e2e-test/event-outbox.spec.ts` against real Postgres; the unit tests only check
query shape.

### Org Access Reconcile (second outbox consumer)

Lives in `src/services/org/`: `org-membership-events.ts` (event contract), `org-access-reconcile-consumer.ts`
and `org-access-sweep-queue.ts`, with queries on `org-dal.ts`. The rule: **an actor keeps project
memberships in an org only while they have a direct org row there or are in a group that has one.** A user
can reach a sub-org only through a linked root group, so code removing a group membership can't tell by
itself whether the actor still reaches the org.

- **Every removal of an org path emits a fact event in the same tx.** Four of them,
  `com.infisical.organization.<entity>.removed.v1`:
  - `group-membership`: `groupId`, `orgIds`, the `members` who left. From the removal helpers in
    `group-fns.ts` (manual route plus SCIM, LDAP, OIDC and SAML sync) and GitHub org sync, which removes team
    members itself at login and on a manual sync.
  - `group-link`: `orgId`, `groupId`, the group's `members`. From `membershipGroupService.detachGroupFromOrg`.
  - `group`: `groupId`, `orgIds`, all `members`. From owned and SCIM group deletes, read with
    `groupDAL.findGroupActorsAndOrgs` before the cascade.
  - `membership`: `orgId` + actor. From `deleteOrgMembershipsFn` (users), the org branch of
    `membershipIdentityService.deleteMembership` and the invited-identity branch of `identityService.deleteIdentity`
    (identities), and the sweep.

  Group events snapshot orgs and members at removal time, since a later removal can wipe those rows before
  the consumer runs. The org list always comes from `groupDAL.findGroupOrgIds` (the owning org plus every
  org the group is linked into), so no emit site builds it by hand. Both lists are paged at 100 (one event
  per org page x member page) because the outbox rejects payloads over 16 KiB, which rolls back the removal.
  Any new path removing one of these must emit the matching event.
- **What leaving an org's projects takes away is defined once**, in
  `projectAccessRevokeService.revokeActorsInOrgs` (`services/membership/project-access-revoke-service.ts`):
  project rows, resource rows (PAM, Agent Vault, PKI apps, signers, through
  `applicationMembershipCleanupService`), project keys, privileges, approver slots, alert recipient slots and
  live PAM sessions, across every project in the given orgs since those can exist in group-only projects.
  It runs in the caller's tx and hands back the PAM cancellation sender for after commit. Don't add another
  copy of that list.
- **Removing a user from an org tears down synchronously; for an identity it depends on the path.** `deleteOrgMembershipsFn`
  (org member removal, bulk removal, SCIM deprovision, the instance admin panel) drops the user's org rows in the sub-orgs, their
  groups there and calls `revokeActorsInOrgs` for the org plus its sub-orgs in the same tx; its event only
  lets the consumer confirm nothing's left. `membershipIdentityService.deleteMembership` just writes the
  revocation marker and emits, so the consumer does all the project cleanup there. `identityService.deleteIdentity`
  (the UI's "Remove From Sub-Organization") deletes the identity's rows in the org itself and emits anyway, like
  `deleteOrgMembershipsFn`.
- **The consumer (`org-access-reconcile`) rechecks against current state.** Orgs and actors come from the
  payload for group events, and from the org plus its sub-orgs for a membership removal. Per org it works in
  batches of 10 actors, each its own tx with `SET LOCAL statement_timeout` (30s) that locks the actors,
  rechecks `findActorsWithOrgAccess` and calls `revokeActorsInOrgs` for whoever has no path left, since the
  rows an actor holds aren't bounded. PAM cancellations, the `revoke-org-project-access` audit log and usage
  meters fire after each batch commits and only when something was removed, so replays are silent.
- **The audit event is written for admins.** The actor is the platform; `reason` is an
  `OrgAccessRemovalCause` mapped from the event type. `revokeActorsInOrgs` returns one entry per (org, actor)
  and each is logged under that org, so a sub-org admin sees the revoke in their own log when a root
  removal cascaded into their org. Actors and the group are recorded by id only: a name
  lookup after the revoke commits could fail, and the retry would find nothing left to log. `projectIds` are
  project memberships, `resources` the resource grants.
- **The daily `org-access-reconcile-sweep` cron is a backstop, not a substitute.** It looks for project and
  resource rows whose actor no longer reaches the org (ghost users skipped) and emits a `membership` event
  per (actor, org) pair, capped at 5000 per run, in a replica tx with a 3 minute `statement_timeout`.
  Resource rows count on their own, because a resource grant can exist with no project row behind it (a
  group-derived PAM admin's personal folder row), and the consumer reaps both.
- **Not on the enforcement path.** Token validation already rejects actors with no effective org membership
  (`assertActiveOrgMembership` and its Go port). The lag only shows in member lists, seat counts and SCIM.
- **`orgDAL.lockActorsForOrgAccess({ orgId, actorIds }, tx)`** serializes everything that grants against the
  consumer, so access granted between its check and its deletes doesn't get reaped or outlive it. Advisory
  xact locks at two levels: the root org (resolved from `orgId`) shared plus one key per actor in one sorted
  statement, or, past `ORG_ACCESS_LOCK_ESCALATION_THRESHOLD` actors, the root org exclusive and no actor
  keys. The escalation keeps a bulk SCIM sync from filling Postgres's shared lock table, which would fail
  unrelated transactions instance-wide; the price is that such a sync stalls other grants in its own tenant
  until it commits. Root org first, then sorted actors, so callers can't deadlock. Two kinds of caller take it:
  - The add-to-group helpers in `group-fns.ts` (the SSO and SCIM services only pass it through) and GitHub org
    sync, which adds team members itself. Take it in any new path that grants an org path outside them.
  - Every path that writes a project or resource membership for a user or identity, through
    `lockAndAssertActiveOrgAccess` (`services/org/org-access-fns.ts`), which locks and rechecks
    `findActorsWithActiveOrgAccess` inside the write's own transaction: the generic user and identity
    `createMembership` at project scope, the deprecated `addUsersToProject`, the org admin console's
    `grantProjectAdminAccess`, PKI application and signer `addMember` (their `addUserMembers` go through it),
    PAM's `addProductMember`, `addProductUserMembers` and `addResourceMember`, and Agent Vault's
    `addProductMembers`. A new add path must call it before its write; the pre-checks outside the transaction
    stay for their error messages but don't close the race.
- **Indirect members can be assigned to projects, PAM and Agent Vault included.** Users and identities that
  reach an org only through a linked group can get a direct project membership; that's the row the consumer
  revokes once the group path goes away. Two helpers on `org-dal.ts`, and picking the wrong one is the bug:
  - `findActorsWithActiveOrgAccess` answers "can we grant this actor access now": an active direct org row,
    or no direct row and an active group holding one (a deactivated direct member stays out, matching
    `findEffectiveOrgMembership`). Every add path uses it: the project user and identity guards, the
    `skipUsersWithOrgAccess` step of the project invite routes, PAM's `validateActorExists` /
    `addProductUserMembers` and Agent Vault's `assertActorsAreAddable`. The candidate lists
    (`.../memberships/available-users`, `.../available-identities`, Agent Vault's `findAvailableActors`)
    apply the same rule in SQL.
  - `findActorsWithOrgAccess` answers "does this actor still reach the org", ignoring deactivation, and is
    only for the reconcile consumer: deactivating someone must not reap their project rows.
  - The project invite routes (`POST /v1/projects/:projectId/memberships`, its deprecated v2 twin and the
    cert manager `/users` route) pass `skipUsersWithOrgAccess` to the org-scope `createMembership`, so a
    group-only user isn't turned into a direct org member, emailed an org invite, or held to org
    `Member.Create`. Brand-new emails still go through the full org invite.
  - The project candidate lists are org member lists, so at project scope they're gated on org
    `Member.Read` / `Identity.Read` only, plus a 404 when the project isn't in the caller's org. The project
    and PAM add-member modals read `available-users`; Agent Vault keeps its own `/agent-vault/members/available`.

`e2e-test/routes/v1/org-access-reconcile.spec.ts` covers the sub-org flows end to end against real
Postgres (group removal, unlink, identities, a second path keeping access, the sweep query); the unit
tests mock the DALs.

### Soft-Delete + Async Cleanup

Resources whose deletion cascades across many/large tables use a **soft-delete + paced async hard-delete** pattern instead of a synchronous cascade in the request path.

Pattern:
- **Soft-delete columns** on the table: `deleteAfter`, `softDeletedAt`, `deletedByActorType`, `deletedByActorId`, plus a **partial index** `WHERE deleteAfter IS NOT NULL` (tiny, ~zero write cost on the live path). The DELETE handler sets `deleteAfter` (one UPDATE) and returns immediately. Set `deleteAfter = now()` for "real delete" UX (reaped on the next worker tick) or `now + grace` for a restore window. The actor pair follows the same `(actorType, actorId)` pattern used by audit logs — extensible to any `ActorType` without schema changes.
- **Hide soft-deleted rows from every read.** Override the `ormify` base `findById`/`findOne`/`find` to append `.whereNull("deleteAfter")`, and add explicit `*IncludingExpired` escape hatches used only by the cleanup worker/restore. Patch all custom read queries too — **especially any count feeding a plan/quota limit** (e.g. `countOfOrgProjects`), or soft-deleted rows wrongly count against limits. Free unique columns (e.g. the project slug) on soft-delete so the resource can be recreated immediately.
- **`Environment.deleteAfter` ≠ `Project.deleteAfter` — filter both.** The two soft-deletes are independent: soft-deleting a project does NOT soft-delete its environments. Many DALs already filter `Environment.deleteAfter` (from the env soft-delete) — that does **not** exclude a soft-deleted *project*'s data. So any **cron / cross-project enumeration** must also filter `Project.deleteAfter`: the rotation/sync/reminder queue queries, and cross-project listings (project/identity memberships, group projects, org product stats). External side effects are the dangerous case — without it, a soft-deleted project's secrets get rotated, synced, or reminded on during the cleanup window. Per-project reads resolved through `projectDAL.findById` are protected upstream (it returns nothing for a soft-deleted project).
- **Cron discovery + paced worker** (cron fans out to BullMQ): the cron selects the oldest `LIMIT N` expired rows (`ORDER BY deleteAfter ASC`) and enqueues one job each with a deterministic `jobId` (dedupe → queue stays bounded at ~N; never enqueue the whole backlog). The worker (`concurrency` + `limiter`) does the actual delete, re-reading via the **primary** under a per-resource lock to defeat replica-lag/restore races.
- **Chunk-deleting child rows: check inbound FKs first.** Reference implementation: `services/secret-v2-bridge/secret-tree-hard-delete-fns.ts` (project/env hard-delete workers).
  - `CASCADE` / `SET NULL` inbound FKs → safe to chunk.
  - `DEFERRABLE NO ACTION` → only if you delete the referencing rows in the **same transaction**; hard-delete paths only (never live deletes).
  - Non-deferrable `NO ACTION` / `RESTRICT` → neither path is safe: it breaks the final cascade too (next bullet). Migrate the FK to `DEFERRABLE INITIALLY DEFERRED` first.
  - Each batch: own transaction + `SET LOCAL statement_timeout`.
- **A non-deferrable `NO ACTION`/`RESTRICT` inbound FK is unsafe under cascading deletes; make it `DEFERRABLE INITIALLY DEFERRED`.** It is checked at end of *statement*, so within one cascading `DELETE` a parent branch can be processed before a sibling branch deletes the referencer, raising "update or delete on X violates FK on Y". When a CASCADE child of the deleted root is itself referenced by `NO ACTION`/`RESTRICT` FKs, declare those FKs `.deferrable("deferred")` so the check runs at COMMIT after the cascade completes (a *direct* parent delete is still blocked while a referencer remains). Audit **all** inbound `NO ACTION`/`RESTRICT` FKs of such a parent, not just one.
- **Index every FK referencing column that participates in a cascade.** Postgres does **not** auto-index FK columns. A cascade fires a **per-row** RI trigger on each child, so an unindexed child means one seq-scan *per deleted parent row*, which blows past `statement_timeout` on a chunked delete. Before chunk-deleting a large table, enumerate **every** inbound FK, including helper-generated ones: `createJunctionTable` (`src/db/utils.ts`) creates CASCADE FK columns with **no index** on either side, so every junction table needs explicit FK indexes. For a mostly-NULL nullable FK, a partial index `WHERE col IS NOT NULL` serves the cascade lookup at a fraction of the size/write cost.
- **Observe the backlog, not just the queue.** Queue depth caps at the discovery batch size, so it can't reveal the true backlog. Record the discovery result from the cron tick itself (e.g. `infisical.project_cleanup.discovered` / `infisical.project_env_cleanup.discovered` on the `InfisicalCore` meter: last batch size, capped at the discovery LIMIT). **Alert when the gauge stays at the cap** — it means the drain rate can't keep up (raise concurrency/limiter) or a mass-delete is in progress.

### Error Handling

Custom error classes in `src/lib/errors/index.ts`:
- `BadRequestError` (400) — with optional `details` field
- `UnauthorizedError` (401)
- `ForbiddenRequestError` (403) — with optional `details`
- `PermissionBoundaryError` — extends `ForbiddenRequestError`
- `NotFoundError` (404)
- `DatabaseError` (500) — wraps original Knex error
- `GatewayTimeoutError` (504)
- `InternalServerError` (500)
- `RateLimitError`
- `ScimRequestError` — SCIM-specific formatting with schemas and status
- `ClientClosedRequestError` (499, nginx convention) — the client disconnected before the response was written; see below

Global error handler in `src/server/plugins/error-handler.ts` maps these to HTTP status codes and records OpenTelemetry error metrics.

#### Stopping work after a client disconnect

Node keeps running a handler after its client has gone, and a disconnected client usually retries, so a CPU-heavy request that outlives its caller does the full cost again on another pod. Routes whose work can run long after the database reads finish (fan-out over folders, references, or imports) should stop when the connection closes. `GET /api/v3/secrets/raw` and `GET /api/v4/secrets` are examples.

- **Route:** pass `abortSignal: getClientDisconnectSignal(reply)` (`src/server/lib/client-disconnect.ts`) into the service. It aborts only when the socket closes before the response was written, so a normal completion never trips it.
- **Service:** call `throwIfClientDisconnected(abortSignal)` at fan-out points only: before each unit of work that triggers more reads (each reference, each import level, a shared folder load). Don't add one after every `await`; a check that saves a single query for a client that has already left is noise. Checks are cooperative, so an in-flight query or synchronous block still finishes, and a long synchronous block delays noticing the disconnect. Keep the per-item work linear.
- **`Promise.allSettled` fan-outs:** they swallow the rejection, so scan the results with `throwIfAnySettledClientClosed(results)` instead of rechecking the signal. A disconnect mid-fan-out means the result is partial and must not be cached or returned as reference errors; a result that completed before the client left should still be cached so the retry is a hit.
- **Catch blocks** that turn failures into an empty result (a folder that failed to load, a skipped cross-project read) must rethrow `ClientClosedRequestError` first, or the partial state gets cached.

The 499 never reaches the caller. It exists for logs (warn, no stack) and the `error.type="client_closed"` label on `infisical.core.http.error.count`. This is disconnect handling, not a request deadline: a slow client that stays connected is still bounded only by Fastify's 100s socket `connectionTimeout` in `src/server/app.ts`.

### Logging

Uses Pino via `@app/lib/logger`. Always include key identifiers in the message string using `[key=value]` format for log searchability. You may also pass a structured object as the first argument for programmatic access, but the message must be self-contained:

```ts
// Preferred: identifiers in message + structured object
logger.error({ sessionId, err }, `Failed to get connection details [sessionId=${sessionId}]`);

// Also acceptable: identifiers in message only
logger.info(`getPlan: Process done for [orgId=${orgId}] [projectId=${projectId}]`);

// NOT preferred: identifiers only in structured object, not in message
logger.error({ sessionId, err }, "Failed to get connection details");
```

**Never log an outbound URL verbatim — a URL is often itself a credential.** Incoming-webhook providers put the bearer secret in the path (`https://hooks.slack.com/services/T…/B…/<secret>`, Discord, Teams, Telegram) and many APIs accept a token as a query param, so a raw URL in a log line ships a working credential to the log sink. Pass it through `sanitizeUrlForLog` from `@app/lib/logger` first (`src/lib/logger/sanitize-url.ts`): it keeps only the origin, strips userinfo and the fragment, redacts the entire path, and redacts every query value. Token formats can't be recognised reliably, so the path is redacted by default for every host rather than sniffed with heuristics. The global axios response interceptor (`src/lib/config/request.ts`) and `safeRequest`'s dispatch log already do this.

Note that `logger.ts` also has a `redactedKeys` list applied to structured-object fields up to depth three. It only matches by key name, so it does **not** help with a secret embedded in a `url` field.

### Certificate revocation: CRL and OCSP

Internal CAs publish revocation two ways, both unauthenticated public endpoints under
`/api/v1/cert-manager`. CRL is `ee/services/certificate-authority-crl`; OCSP
([RFC 6960](https://www.rfc-editor.org/rfc/rfc6960)) is `ee/services/certificate-authority-ocsp`, opt-in
per CA via `internal_certificate_authorities.isOcspEnabled` and gated on the `pkiOcsp` plan flag.

The responder answers a status question for one certificate, so the things that bite are freshness and
what an anonymous caller can cost us.

- **Serials have two forms and the database knows one.** `certificates.serialNumber` is 40 lowercase hex
  as issued, and `createSerialNumber` clears the top bit, so ~1 in 8 begins with `0`. A CertID carries a
  DER INTEGER that may also carry a sign byte. `parseOcspRequest` keeps `rawSerialNumber` and the
  zero-stripped `serialNumber`, and `$resolveStatuses` queries both. Querying one silently answers
  `unknown` for every certificate whose serial starts with a zero byte, revoked ones included.
- **Every read on the revocation path goes to a primary, in Redis and in Postgres.** `keyStore.getItem`
  and `ormify().find` both default to a replica, and so does `findByIdWithAssociatedCa`. Under lag any of
  them re-caches a pre-revocation `good` for the full validity window, or answers for a CA whose OCSP was
  just switched off. Use `getItemPrimary` and pass a `primaryNode()` as the `tx`.
- **Invalidation is a Postgres counter, not a Redis write.** `internal_certificate_authorities.ocspGeneration`
  is bumped in the *same transaction* as the certificate status write in `revokeCert`, which is the only
  place a certificate becomes revoked. Each cached entry records the generation it was signed under and a
  read rejects a mismatch, so nothing has to delete a key and a Redis outage cannot leave a revoked
  certificate reading `good`. The responder already reads the CA row from the primary every request, so
  comparing it is free. A new path that revokes a certificate must bump it too. Deleting a certificate does
  not, and neither does the expiry cleanup: deletion is not revocation, so a cached `good` for a certificate
  nobody revoked is still true, and bumping would flush every live certificate's cached response on that CA
  for nothing. Only single-certID responses are cached; multi-certID requests are answered but never cached.
  Do not reintroduce a best-effort invalidation call after the commit: that is exactly the shape that failed
  review, because a failure there is unrecoverable and silent.
- **Concurrent misses coalesce into one signing.** `inFlightResponses` keys on the cache key plus the
  generation. The generation is what stops a request arriving after a revoke from joining a flight
  that began before it. Nonced requests are exempt for free, because their cache key is `null`.
- **A nonce is an OCTET STRING, and an extnValue that is not one is rejected.** The response always
  re-encodes the nonce wrapped, so accepting a raw inner value would sign an echo that can never match what
  the client sent. `parseOcspRequest` returns `null`, which the service answers as `malformedRequest`.
- **Never take the hash OID out of a CertID without checking `OCSP_HASH_NAME_BY_OID` first.** An OID is an
  unbounded dotted-decimal string and it keys the per-CA issuer-hash memo, so an unvalidated one is
  unbounded attacker-controlled heap.
- **Signing is capped three ways and sheds with `tryLater`**: globally (4), per CA (2), and in aggregate
  across every CA (`OCSP_SIGNING_MAX_TOTAL_IN_FLIGHT`, checked before a per-CA limiter is created or
  entered). The global cap matches libuv's default threadpool of 4, where `crypto.subtle.sign` runs, so
  OCSP never needs more than the pool that password hashing, KMS decrypts and DNS lookups share. The
  per-CA tier stops one tenant's traffic shedding everyone else's, but on its own it multiplies how many
  requests are parked at once, because a caller choosing to spray across many valid CA ids gets a fresh
  queue per id. The aggregate cap is what bounds that, and it is deliberately far above any single CA's
  own limit so the fairness the per-CA tier buys is preserved. Both are per process, so the rate limiter is the outer
  bound, and it is only registered under `isProductionMode && isCloud`.
- **Do not log per request on this path.** The endpoint is unauthenticated and the rate limiter is only
  registered under `isProductionMode && isCloud`, so on self-hosted an anonymous caller sets the log
  volume. Malformed and unauthorized results are counted by `ocsp.result` and logged nowhere; the
  saturation warning is interval-guarded because shedding is by definition high volume.
- **Protocol shape, not REST.** HTTP 200 with the error in the DER body, and a wildcard GET path carrying
  url-encoded base64. Required by RFC 6960 appendix A.1. Both routes also carry an `errorHandler`, because
  a body over `bodyLimit` or a missing `Content-Type` never reaches the handler and would otherwise return
  a JSON 500 an OCSP client cannot parse.
- **The responder never consults the plan.** Entitlement gates enabling OCSP, never answering, per
  `CODE_QUALITY.md`. Note the managed CRL URL beside it *does* re-check at issuance; that asymmetry is
  deliberate on the OCSP side and should not be "fixed" by copying the CRL pattern.
- **The response metric keeps those two states on separate dimensions.** `ocsp.status` is the envelope
  and `ocsp.cert_status` is the per-certificate answer, which only exists inside a `successful` envelope
  and is `none` otherwise. Flattening them onto one label made `unknown` and `unauthorized` look like
  siblings when they come from different enumerations. Both names, plus `ocsp.cache`, have to be in
  `INFISICAL_CORE_METER_ATTRIBUTES`: an attribute missing from that allowlist is dropped by the SDK View
  with no error, so `ocsp-metric-attributes.test.ts` pins them.
- **The two "I can't answer" states are different, and RFC 6960 picks between them.** `unauthorized`
  (2.3, unsigned) is "not capable of responding authoritatively": no such CA, no active CA certificate,
  issuer hashes that belong to someone else, and OCSP switched off for that CA. `unknown` (2.2, signed,
  inside a successful response) is "I serve this issuer but have no record of this certificate", which is
  a serial this CA never issued. Do not answer a disabled CA with `unknown`: we hold a record for those
  certificates, so it is a false assertion signed with the CA key, and it would make the off switch still
  cost a signature per request. `unknown` responses carry a short validity window, since their serial is
  caller-chosen.

**`signTbs` must DER-encode ECDSA itself.** WebCrypto returns raw `r||s`; X.509 and OCSP need the DER
`ECDSA-Sig-Value` SEQUENCE. The certificate, CSR and CRL generators convert internally, so nothing above
them ever had to. Without it every ECDSA CA's OCSP responses fail verification in openssl, Go and Windows,
and nothing on our side errors. `TCaSigner` (`services/certificate-authority/ca-signer.ts`) gained
`signTbs` for this and abstracts over software, HSM and PQC CAs. PQC needs no special case beyond taking
the signature OID from `pqcNameToOid`.

### Internal CA key sources

An internal CA's signing key lives in Infisical (`keySource: infisical`, encrypted private key) or
outside it. Every external source (HSM, AWS KMS) is a provider in
`services/certificate-authority/ca-key-source/`, registered in `caKeySourceServiceFactory`, and
implements four things: `supportedKeyAlgorithms`, `assertCanUse` (permission to use the connection),
`createKey` (entitlement check, then key creation; returns the columns to store) and `buildSigner` (returns a `TCaSigner`, usually through
`buildExternalCaSigner`, which swaps a remote signature into structures built with a throwaway key).
CA creation and `getCaSigner` branch only on Infisical versus external, so adding a source means a
provider, a `CertKeySource` value, an arm in `certificate_authority_secret_key_source_chk`, and the
wizard option. Every external source stores its key in the generic `externalKeyId` and
`publicKeySpki` columns, and cloud KMS sources reach the key through `appConnectionId` (HSM through
`hsmConnectorId`). Each provider's `describeKey` builds the key fields of the CA read response and
the CA create and delete audit events, which is how the API still exposes an HSM CA's
`externalKeyId` as `hsmKeyLabel`.
Releasing a key is two-phase, through `prepareKeyReleases`. The provider's optional
`prepareKeyRelease` resolves what it needs (AWS KMS decrypts the connection and builds its client)
before the CA rows are deleted, and the returned function runs after the delete commits. The order
matters: a project hard delete cascades away project-scoped connections and the project KMS key in
the same transaction. Keys are released on CA delete, on project hard delete, and when CA creation
fails after its key was made. AWS KMS schedules deletion with a 30-day window; HSM keeps its key. A
failure is logged, never thrown, so the original outcome stands.

### OIDC issuer (outbound workload identity federation)

`services/oidc-issuer` signs short-lived JWTs that cloud providers exchange for access tokens, so a
connection needs no stored client secret. Each org is its own issuer at
`/api/v1/oidc-issuer/organizations/<orgId>`, with public discovery and JWKS routes under `.well-known`.
The issuer URL and each consumer's `sub` format are one-way doors: customers copy both into their provider.

- **Keys are reserved `sign-verify` `kms_keys` rows named `oidc-issuer-*`, not a new `keyUsage`.** The
  CMEK router accepts any `KmsKeyUsage`, so a new value would be creatable through the public API.
  Customers cannot create reserved keys, which is what makes the name prefix safe.
- **Keys are created on the first sign, never on a JWKS fetch**, so existing orgs need no backfill.
- **The second newest key signs.** The newest is published a full 24h period before it takes over, and
  rotation keeps at most three keys. It runs under a Redis lock, so no database connection is held while
  RSA keys are generated; the lock is renewed while it runs, and nothing is written once it is lost.
- **The JWKS is cached in Redis for 10 minutes**, because building it decrypts every key on an anonymous
  route. The 24h lead makes a stale set safe. Empty sets are never cached, in Redis or over HTTP.
- **Fresh keys are read on the primary.** Signing and the JWKS a rotation caches pass a `tx` to
  `getPublicKey` and `signWithKmsKey`, because a read replica may not have a key created moments earlier.

### Enterprise (EE) Features

Enterprise code lives in `src/ee/`:
- `src/ee/services/` — 60+ service modules (access approval, audit log, dynamic secrets, external KMS, gateway, KMIP, LDAP, OIDC, PAM, PKI, SAML, SCIM, secret approval/rotation/replication, etc.)
- `src/ee/routes/v1/` — 63 EE route files; `src/ee/routes/v2/` — 10 v2 route files

EE routes register before community routes so they can override/extend endpoints. Feature gating via license service (`src/ee/services/license/license-service.ts`) which validates online/offline licenses, caches feature sets in keystore with 5-minute TTL, and exposes `getPlan()` to check feature availability.

**PAM**: Before working on any `pam-*` service or router, read [`src/ee/services/pam/AGENTS.md`](src/ee/services/pam/AGENTS.md) for a high-level map of the PAM backend — module layout, permission model, and non-obvious invariants. It is intentionally a concept map, not a spec: read the referenced code for implementation detail. If you add a feature, keep any addition there brief (a concept or invariant, not code mechanics).

**Certificate discovery**: before working on `pki-discovery-*` or `pki-installation-*`, read [`src/ee/services/pki-discovery/AGENTS.md`](src/ee/services/pki-discovery/AGENTS.md). Linux Server discovery splits work between the backend and the gateway's certificate scanner in the CLI repo, and keystore passwords live on installations, not jobs.

**Agent Vault**: the same applies to the `agent-vault-*` services and routers; the concept map is [`src/ee/services/agent-vault/AGENTS.md`](src/ee/services/agent-vault/AGENTS.md). PAM and Agent Vault are the two **org-scoped products**: one implicit project per org, resolved lazily, whose roles collapse to admin or member. Anything that branches on `ProjectType.PAM` (metering emits, predefined roles, the billable-project count, invite grants) almost always needs an Agent Vault arm too.

**Secret Scanning** is single-project (see the root `AGENTS.md`): `secret-scanning-v2-project-bootstrap.ts` creates the project with the org when it has a creator to make admin (like PAM and Agent Vault), `secret-scanning-v2-project-resolver.ts` picks the active project and lazily creates it, with every org admin as project admin, for older orgs and for orgs created from the admin console, whose admins are only invited after the org exists, and routes that take `projectId` read `req.internalSecretScanningProjectId`. A data source covers the resources it has rows for (added by a user or discovered from a push); its `config` only says where to look (Bitbucket workspace, GitLab group), never which resources, so scans, "included" state and GitLab account-scope webhooks all key off rows. Stored configs may still carry the old `includeRepos` / `includeProjects` keys, which nothing reads.

**Secret scanning scans and GitHub pull request checks**:
- A scan's `trigger` (`SecretScanningScanTrigger`) records what started it, separate from `type` (`historical` / `realtime`). `metadata` (jsonb) holds trigger-specific data, is parsed by trigger, and is never returned raw by the API.
- `secret-scanning-v2-queue.ts` stays provider-agnostic. Provider behavior goes behind optional hooks on the data source factory (`getRealtimeScanReport` / `getScanReport` for reporting a scan back, `processEvent` for webhook events beyond pushes), never behind a provider check in the queue.
- PR checks are realtime scans with `trigger: pull-request`, gated on `isScanNewCommitsEnabled`. Webhook handlers only enqueue; `processGitHubPullRequestEvent` does the work. The check run is created before the scan, with the scan's ID as its `external_id`, which is how re-runs and skip actions find the scan.
- Every exit of a PR scan closes its check (including the stuck-scan reaper, which also fails realtime scans left `queued`), since a check left open blocks merging when it is required.
- Fork PRs aren't scanned: they get a `skipped` check under the same name, unless the commit already has one of our checks (checks belong to the commit, so it would replace a real result).

**Dynamic secret lease secrets needed at revoke time go in `dynamic_secret_leases.encryptedLeaseData`**, never in `externalEntityId` or `config` (both plaintext, and `externalEntityId` is returned by every lease route and logged in audit events). A provider opts in by listing the `create()` `data` keys in `persistedLeaseFields`; the lease service encrypts them with the project's SecretManager key and every revoke path passes them back as `metadata.leaseData`. Lease routes return `SanitizedDynamicSecretLeaseSchema` so the column never reaches a response. Secret *config* fields are listed separately in `DYNAMIC_SECRET_SECRET_FIELDS` (`providers/redact.ts`), as dotted paths so nested secrets work (`clientAuth.clientSecret`): reads strip them via `redactStoredInputs`, and an update that omits one keeps the stored value via `restoreOmittedSecretFields`, because the update merge is shallow.

**Gateways: there is only one generation.** Gateway v1 (`ee/services/gateway`, `lib/gateway`, the QUIC
transport over `@infisical/quic`, and `/api/v1/gateways`) is gone; `gateway-v2` and `gateway-pool` are the
whole story, and `lib/gateway-v2/types.ts` owns `GatewayProxyProtocol` / `GatewayHttpProxyActions`. What
survives is DB-only, and deliberately: the `gateways`, `org_gateway_config` and `project_gateways` tables
and the `gatewayId` columns on `dynamic_secrets`, `identity_kubernetes_auths` and
`identity_auth_templates` are still populated but never read or written, so the removal stays revertible.
Those three tables' `TableName` members exist for that reason alone.

Two consequences when touching a gateway dial path. Resolve the gateway with
`gatewayV2Service.getPlatformConnectionDetailsByGatewayId`, and when it returns nothing **throw**
(`getMissingGatewayMessage` in `lib/gateway-v2/gateway-errors.ts`) rather than continuing: every one of
these call sites sits in front of an `if (gatewayId)` guard whose else-branch dials the target host
directly, so falling through turns a dangling gateway reference into a silent bypass of the network
boundary the gateway exists to enforce. And `app_connections.gatewayId` is **not** a v1 column — unlike the
three above it never grew a `gatewayV2Id`, so that one column carries v2 ids and must stay.

**Any new path that attaches an individual gateway must call `assertIndividualGatewayAllowed`**
(`ee/services/gateway-pool/gateway-pool-policy-fns.ts`) next to its `AttachGateways` check. It enforces the
org-level `requireGatewayPools` setting. Pass the gateway the resource already had as `previousGatewayId`,
because clients re-send unchanged values on every save and resources created before the setting was turned
on must stay editable. The check reads the setting, not the plan, so it keeps applying after a downgrade.
Only exempt a mode that refuses pools outright, the way gateway Kubernetes auth in Gateway review mode does
(`$assertCanAttachProxy` in `resource-auth-method-service.ts`), or the policy removes that mode entirely.

### Audit Log Storage

Audit logs live in **one** store at a time. When a ClickHouse client is configured and
`CLICKHOUSE_AUDIT_LOG_ENABLED` is on (its default), `insertBatch` in `audit-log-queue.ts` writes only to
ClickHouse and Postgres `audit_logs` receives nothing new. So **every reader of audit logs has to pick
the store the same way** (`CLICKHOUSE_AUDIT_LOG_ENABLED && clickhouseAuditLogDAL`), as `auditLogService`,
the audit report generators and insights do. A reader that only queries Postgres goes silently empty on
ClickHouse instances, with no error anywhere; that is how the project insights cards broke. Postgres rows
written before the switch are not backfilled, and readers do not merge the two stores.

Two things to get right in a ClickHouse aggregate. `createdAt` is a `DateTime64(6)` with no column
timezone, so pin day grouping and bound parameters to `'UTC'` or they follow the server's timezone. And
the table is a `ReplacingMergeTree`: a retried batch inserts the same `id` twice and the copy goes away
only at some later merge, so read with `FINAL` when an exact count matters.

### Secret Read Activity

`ee/services/secret-read-activity/` answers "who has read this secret" for the per-secret access sheet and
the Insights Unused Secret Access card. It does not use audit logs: ClickHouse is optional on self-hosted
and the events cannot say which folders a recursive read returned. Instead it keeps its own table,
`secret_read_activity`, one row per (object, reader) holding the last read time. The write path (producer,
stream drain and both crons) lives in `secret-read-activity-queue.ts`, like `audit-log-queue.ts`; the service
owns the two read endpoints and hands `recordRead` / `recordBulkRead` through to the queue.

- **Write path.** Read routes call `recordBulkRead` / `recordRead` with `void`, so they never fail or slow a
  read. A bulk read that returned whole folders (no tag or metadata filter, imports and references included)
  records its folder, plus every non-reserved subfolder when recursive, and does so even on a 304. A
  narrower bulk read records the ids of the secrets it returned, so the secrets it left out are not credited.
  A narrow 304 carries no secrets and records nothing, which is safe only because ETags are stored per UTC day,
  so each client's first read of the day is a full response. Single reads record the secret. A read with
  references unexpanded is stored as `secret-unexpanded` and credits only that secret, not the values it
  references, which is why `objectType` is part of the primary key. A read that expands references with the reader's
  personal overrides (v4 bulk with `includePersonalOverrides`, v4 single read of a personal secret) records the
  returned secrets plus the ones its references resolved to, all as `secret-unexpanded`: matching references by key
  would credit a shared secret an override replaced. The expander reports a secret's referenced ids through
  `onSecretExpanded` only once that secret's expansion succeeds, tagged with the secret, so a failed expansion
  credits nothing and the single read passes on only the returned secret's (imports expand every imported secret).
  The bulk read caches them with its result (only for these reads, so every other cached payload and ETag is
  unchanged) so a cache hit replays them. A Redis `SET NX` gate (25h TTL) keyed on
  the reader, the day and the request (or the hash of the returned ids) lets only the first identical read
  per day through. It is keyed on the request, not the client's ETag, since older clients never send one; a folder
  read is also keyed on the response's ETag, so a read that returns more after an access change is recorded again
  the same day. Gated reads go to a
  Redis stream drained the way the audit log ingest stream is (collect, write, then trim, under a
  non-blocking lock), by the `SecretReadActivityFlush` cron every minute into an upsert.
- **Partitioned by month, no foreign keys, no index on `lastReadAt`.** The table is range-partitioned on
  `readMonth` (the UTC month of `lastReadAt`, part of the primary key), so a reader has one row per month and
  `findLastReads` folds them into the latest. The daily `SecretReadActivityPrune` cron creates the current and
  next three months' partitions and drops a month once all of it is older than the 30-day window, since nothing
  reads before it. Never prune with `DELETE`: at this table's size that is a full scan plus vacuum. Partition DDL
  takes an exclusive lock on the whole table, so it runs under a short `lock_timeout` and retries on the next run.
  Partitions use `fillfactor = 90` and `lastReadAt` is in no index, which together keep the upsert a HOT update.
  Rows of deleted objects age out with their month. A move creates new ids, so the window
  starts no earlier than the secret's and its folder's creation (`trackedSince`), nor before the table existed.
- **Read path.** A read counts when it reaches the secret through its folder, an import of it, a secret
  referencing it, or the source of a replication import (imports and references check the reader's own access
  to the source, so revoking it would break them). A personal secret referencing it counts only when the personal secret
  itself is read, not its folder (a read without overrides leaves personal values out), and nothing referencing the
  personal secret is followed: a reference resolves to the shared secret without overrides. The card computes the whole project once and caches it
  (`KeyStoreTtls.InsightsUnusedAccessCacheInSeconds`), grouping actors by identical rules so each rule set is checked once
  per secret. The per-secret endpoint checks the caller's access to the secret before building its reach, which
  decrypts every secret that could reference it.
- **Only a full window is judged.** Tracking starts at the later of the migration that created the table and the
  project's creation, and reads from before it are unknown, so nothing counts as unused access until tracking has run
  30 days (`getUnusedAccessFrom`). `judgedFrom` is always the start of the last 30 days, and a secret's `trackedSince`
  starts no earlier than tracking did, so before then no secret covers the window; the card skips the scan and
  caches nothing, and the access sheet gives the `tracking-too-new` reason. Every response carries `unusedAccessFrom`
  so the UI can say when results start. The card leaves out project admins (users
  and identities with the Admin role, directly or through a group, from `findAdminActorIds`): they can read
  everything by design. Their reads are still recorded, so the access sheet's Last Read stays true for them. A
  pair is listed once the secret (`trackedSince`) and the actor's access to that secret both predate `judgedFrom`.
  Access is dated per secret (`createAccessDating`): each actor's sources (every role assignment and project-wide
  privilege, from `getProjectPermissions`' `accessSources`; each group they are in, from `permissionForActor` with
  `groupsOnly` so placeholders hold the member's details; each folder grant) carry the date
  `findAccessSourceDates` gives them, and a secret's access dates from the oldest source that grants it on its own,
  so a change only restarts the window for the secrets it opened. An edit to a custom role's rules dates that role
  for every secret it gives, since which secrets an edit opened is not recorded. Expired access is not a source, but
  an ended restriction may have given access back, so access dates no earlier than an expired folder grant in its
  folder, a folder grant edited since its creation in its folder, or an expired temporary role or privilege across
  all of its holder's access (what it held back is not worked out). Only the current secret's source checks are
  kept, so the scan's memory does not grow with the project. Only an actor with a
  source newer than `judgedFrom` is checked per secret, and each source once per secret across actors. A read from
  before the reader had access to a secret is dropped for that secret (`readsByActorId`): reads are credited by
  folder, and a folder read then could not have returned it. A read recorded against the secret itself
  (`lastSecretReadAt`) always counts, so a role change does not erase it. The per-secret sheet shows the plain fact
  instead: a read, "No reads", or "No reads yet" with the reason.
- **The access sheet.** The graph lives only in the secret's access sheet, served by
  `GET /insights/:projectId/secrets/read-activity/:secretName` (the fixed segment comes first so a secret named
  `reports` or `summary` cannot hit those routes). It returns `actors`: everyone who can read the value, admins
  included, each with `lastReadAt`, `isProjectAdmin`, `accessSince`, and a `readStatus` (`read`, `unused`,
  `not-judged`) with a `notJudgedReason` (`project-admin`, `access-too-new`, `secret-too-new`) from
  `getReadStatus`. The API returns codes and dates only; the UI writes the wording. Readers who lost access
  ("ghost readers") are not computed or returned.
- **The Insights card is per actor** (a user or machine identity; a group is never a row, only an access path).
  `summarizeSecretAccess` (in `secret-read-activity-fns.ts`) is the one place a secret's readers and unread readers
  are derived, from the project's access loaded once by `$loadProjectAccess`; both the per-secret
  endpoint and the project scan use it. `$tallyUnusedAccess` scans every secret once and tallies, per actor, how many
  secrets it can read, how many it has not read and the environments involved; `$computeUnusedAccess`
  ranks the tallies into rows (`accessibleSecretCount`, `unusedSecretCount`). Each row carries `accessPaths` as data: `roles` it holds directly (`id`/`slug`/`name`,
  where a custom role has the slug `custom` and its own id), `groups` it belongs to with the roles each one gives,
  `additionalPrivileges` as `id`/`name` (project-wide only), and `folderAccess`: the actor's own active folder grants
  (`id`/`folderId`/`environment`/`secretPath`/`role`). A folder grant is stored as an additional privilege with a
  `folderId`, which the member listings filter out, so `getProjectPermissions` returns them as
  `folderAccessByActorId` from the grants it already loads. The UI decides how to label all of them. Custom role ids and names come from
  `getProjectPermissions`, so the scan makes no role lookup of its own. Each person is checked with one permission merged across their direct membership and every group
  they are in (`getProjectPermissions().permissionForActor`, built from getProjectPermission's own steps by
  `buildMergedProjectPermissionRules`), so a deny in one role holds against an allow in another, and placeholders
  such as `{{identity.username}}` are filled from that person's details (looked up for group-only members only
  when a group role holds one). It
  is cached per project for a day (`insights-cache:<projectId>:unused-access`, under a per-project lock on a cold
  cache): every actor's row, plus the unread secret ids for the 200 actors with the most, capped at 200 each; an
  actor past that is scanned for alone when opened and cached per actor. Served by
  `GET /insights/:projectId/secrets/unused-access` (ranked by unread count, searchable by name) and
  `/unused-access/:actorType/:actorId` (`user` or `identity`), whose secrets go through a per-caller DescribeSecret
  recheck. The audit event keeps `principalType`/`principalId`/`principalName` for the viewed actor, so they do not
  read as the event's own actor. The scans are synchronous CPU work, so they `await setImmediate()` (from
  `node:timers/promises`) between secrets to let other requests on the instance run.

### Free Text in Audit Events

A name, reason, comment or justification can carry ANSI escapes, bidi overrides or zero-width
characters. They are valid JSON but rewrite a terminal line, reorder text in a SIEM, or make two values
look identical. Two layers handle them, both built on `src/lib/validator/log-safe-text.ts`:

- **The route rejects them.** Wrap any free-text field that reaches an audit event in `auditSafeText`
  (`src/server/lib/schemas.ts`), so the caller gets a 422 naming the problem and can fix the input:

  ```ts
  name: auditSafeText(z.string().trim().min(1).max(255)),
  reason: auditSafeText(z.string().trim().max(500), { allowMultiline: true }).optional(),
  ```

- **The sink strips them.** `audit-log-queue.ts` runs actor and event metadata through
  `sanitizeLogPayload` and `ipAddress`, `userAgent` and `projectName` through `sanitizeLogText`. They
  strip control, ANSI, bidi and zero-width characters, turn CR and U+2028/U+2029 into LF, drop lone
  surrogates (Postgres jsonb rejects them, failing the whole batch), and suffix metadata keys that
  collide after cleaning (`email~2`) instead of dropping one. This covers what the API cannot reject
  (IdP claims, user agents, legacy rows), so do not strip values yourself before logging.

Rules for the route check:

- **`allowMultiline: true` for textarea fields** (reasons, comments, justifications). It keeps tab, LF
  and CR; single-line fields reject them.
- **Keep the bound inside the wrapper.** `auditSafeText` takes a `ZodString`, so `.max()`, `.trim()` and
  `.min()` go on the inner schema and `.optional()`, `.nullable()` and `.describe()` go outside.
- **Only validate a value the caller is setting.** A schema check on an editable field blocks every edit
  of a row that already holds a legacy value, because clients resend the whole body. For updates, check
  in the service with `containsLogUnsafeCharacters` and `LOG_UNSAFE_TEXT_MESSAGE`, and only when the
  value differs from the stored one, as `identity-service.ts` and `project-template-service.ts` do.
  Write-once fields (approval comments, justifications, break-glass reasons) can use the schema directly.
- **Never put it on a response schema.** Stored rows predate the check and would fail serialization.

### Audit Log Event Classes and Settings

Every `EventType` belongs to exactly one class in
`src/ee/services/audit-log/audit-log-event-classes.ts`: `management`, `authentication`,
`authorization` (only `PERMISSION_DENIED`), or `data-access`. The class is derived from the event
type at write and read time, so stored rows carry no class column. **A new event type is
`management` unless you add it to one of the explicit lists**, and `audit-log-event-classes.test.ts`
fails if a type lands in two lists. Reads, lists, dashboards, insights views, CMEK use operations
and the dynamic secret lease lifecycle are data access; VIEW_AUDIT_LOGS and privileged session
lifecycle are management on purpose.

Every class but management can be turned off per scope, and scopes do not inherit: an org (root or sub-org) has its own
rows for org-level events, each project has its own rows for its events, and a scope without a row uses
the default in `AUDIT_LOG_EVENT_CLASS_DEFAULTS` (data access on, authorization off). The rows live in
`audit_log_settings` (one per scope and class, `projectId` null for the org scope) behind
`audit-log-settings-service.ts`. `getEffectiveSettings(orgId, projectId?)` caches per scope, not per
org: one key for the org's rows plus `shouldUseNewPrivilegeSystem`, one key per org and project
(`{}` when it has no rows), read together in one `MGET` for 10 minutes. Never build a value that
holds every project in an org, since every event would fetch and parse it. Each write clears only its own scope's key, and
the lookup never throws: a failure records everything.
Enforcement is `isAuditLogEventEnabled` in the settings service, called from `buildStreamEntry` in
`audit-log-queue.ts` with the settings memoized per request so a batch of events costs one read.
Suppressed events are dropped silently and do not count on the dropped counter. Management is
always on: the helper returns true for it before looking at any row, `toSettings` reports it as
enabled, and the update methods reject any request that names it, so the change that turns a
class off is itself always recorded. An update is a full replacement: `PUT` must name every class in
`CONFIGURABLE_AUDIT_LOG_EVENT_CLASSES` exactly once, and the service deletes the scope's rows and
inserts the new set, so there is no merge with what was stored before.

`PERMISSION_DENIED` is recorded by the `onError` hook in
`src/server/plugins/audit-log-permission-denied.ts` for every CASL `ForbiddenError` and
`PermissionBoundaryError` (not `ForbiddenRequestError`, which verifyAuth and plan gates also throw),
only for orgs on the new privilege system whose plan has audit log retention, and collapsed per
actor, project, action, subject, route and method for one minute. `recordPermissionDenied` on the
audit log service never throws to the request. Because a legacy org can never record a denial, the
settings update methods reject a request that turns the authorization class on for one
(`assertAuthorizationClassAllowed`), and the UI locks the toggle with a link to the upgrade, so the
restriction is surfaced in the API error, the response's `shouldUseNewPrivilegeSystem`, the UI, and
the docs rather than stored as a setting that does nothing.

The collapse itself is generic. `createCollapsedAuditLog` on the audit log service takes any
`TCreateAuditLogDTO` plus `collapseKeyParts` (the event type is always part of the key) and an
optional `collapseWindowSeconds` (default 60). The first event per key is written at once and
schedules a delayed `AuditLogCollapsedFlush` job; repeats inside the window only bump a keystore
counter scoped to that window's start (which the window key holds as its value, so consecutive
windows and a late flush never share a counter), and the job writes one summary event with `suppressedRepeats`, `suppressedFrom` and
`suppressedUntil` in its metadata when the window closes, so a burst that stops is still accounted
for. To collapse another event, call it instead of `createAuditLog` and add
`TAuditLogCollapseSummary` to that event's metadata type so the summary fields are typed.

`CERTIFICATE_ISSUANCE_FAILED` is recorded by `recordCertificateIssuanceFailure`
(`services/certificate-common/certificate-issuance-audit-fns.ts`), collapsed the same way, and it
never throws. The synchronous paths record it only when the caller passes `auditLogInfo` to
`issueCertificateFromProfile`, `signCertificateFromProfile`, `orderCertificate` or `renewCertificate`,
so a new route that issues certificates must pass it. ACME and SCEP record their own failures with
their own actor, so they must not pass `auditLogInfo` to those methods. When code that created a
certificate request rethrows, `tagErrorWithCertificateRequest` links the event to that request.
Asynchronous failures are recorded by `recordCertificateRequestFailure`
(`services/certificate-request/certificate-request-fns.ts`) with a `PLATFORM` actor. Mark a request
failed through `certificateRequestService.updateCertificateRequestStatus`, which records it once on
the transition out of pending, or call `recordIssuanceFailure` if you write the status yourself.

### Server Plugins

Key plugins in `src/server/plugins/`:
- `error-handler.ts` — global error handling with OpenTelemetry metrics
- `fastify-zod.ts` — in-house Zod-to-OpenAPI transformation
- `audit-log.ts` — request audit logging to queue
- `api-metrics.ts` — OpenTelemetry metrics collection
- `inject-rate-limits.ts` — per-route rate limiting
- `secret-scanner.ts` / `secret-scanner-v2.ts` — secret scanning webhooks
- `serve-ui.ts` — frontend asset serving
- `swagger.ts` — Swagger/OpenAPI UI
- `maintenanceMode.ts` — maintenance mode middleware
- `ip.ts` — IP extraction and validation

### Telemetry / Metrics

OpenTelemetry metric setup lives in `src/lib/telemetry/`. Instruments are defined in `metrics.ts` (resolved lazily so they bind to the real MeterProvider installed by `instrumentation.ts` after boot).

**Meter split by cardinality:**
- **`InfisicalCore`** — the meter for all new metrics. A strict attribute allowlist (`INFISICAL_CORE_METER_ATTRIBUTES` in `telemetry-attributes.ts`) is applied via an SDK View, so **only bounded labels survive** — HTTP method, parameterized `http.route` template, and low-cardinality enums. This is the choke point for our own call sites: any attribute passed at a call site that isn't in the allowlist is silently dropped.
- **Legacy `Infisical` / `API` / `SecretSyncs` / `PkiSyncs` / `Integrations`** — carry unbounded per-actor labels (`HIGH_CARDINALITY_METER_NAMES`). Disabled wholesale via `OTEL_DROP_HIGH_CARDINALITY_METERS=true` in multi-tenant/cloud.
- **`@opentelemetry/instrumentation-http`** — the second allowlist (`HTTP_INSTRUMENTATION_METER_ATTRIBUTES`). `instrumentation.ts` defaults `OTEL_SEMCONV_STABILITY_OPT_IN` to the stable HTTP semconv, because the old conventions label the server metric with the raw `Host` header. An operator's explicit `http/dup` is honoured instead (it is the OTel migration path, emitting both name sets while dashboards move over), which is why the allowlist also carries the old `http.method` / `http.status_code` / `http.flavor` / `http.scheme` names — without them the dup'd metric arrives with an empty attribute set. The `net.*` host and peer names stay off the list in both conventions.

**Recording is fire-and-forget.** Every `.add()` / `.record()` and every `record*Metric` helper is wrapped in `safely()` in `metrics.ts`, so a broken exporter, a bad instrument name, or a config read before `initEnvConfig()` can never throw into the code being measured. A measurement is an observation of the work, never a step in it — so call sites do not need their own try/catch, and must not treat a metric as something that can fail. The swallow is silent because the logger is itself initialised from config.

**A new instrument goes on `InfisicalCore` and carries only bounded attributes.** The per-actor labels on the legacy meters are a deliberate exception, not a precedent: they are allowed only through `highCardinalityMeter`, so that `OTEL_DROP_HIGH_CARDINALITY_METERS` can switch them off. Do not put unbounded attributes on any other meter, and do not acquire a meter outside `src/lib/telemetry/` — Oxlint blocks both `@opentelemetry/*` imports and `getMeter` access there, so use `highCardinalityMeter` for per-actor instruments and `resolveCoreMeter` for `InfisicalCore` observable gauges.

The gate has to sit at the call site because **a `DROP` aggregation does not bound memory; only an attributes processor does.** The SDK filters attributes *before* hashing them (so the allowlist View is bounded) but consults the aggregator *after* (so a dropped data point has already been keyed by its full attribute set). Under cumulative temporality — which `OTEL_EXPORT_TYPE=prometheus` mandates — `TemporalMetricProcessor` then retains one entry per distinct attribute set, with no cardinality cap, for the lifetime of the process. A meter whose data points are dropped therefore still leaks heap if anything records to it, which is why the flag stops the recording (`shouldRecordHighCardinalityMetrics` in `metrics.ts`) *and* the View strips attributes. With the flag off — the self-hosted default — that retention is the operator's informed choice; the tradeoff is documented in the monitoring guide.

**Rules for InfisicalCore metrics:**
- **No per-tenant / per-actor identifiers** as labels — no org id, user id/email, identity id, ip, user agent, request id, or free-form values (e.g. environment slug). These scale series count with customer count, which breaks CloudWatch's 1000-datapoint-per-OTLP-request limit and drives per-GB ingestion cost. Use the **audit log table** for per-org / per-actor breakdowns.
- Adding a new label means adding it to the allowlist in `telemetry-attributes.ts`. Only add **bounded** keys (fixed enums / static route templates), and document why.
- `http.route` must be the parameterized template (`req.routeOptions.url`), never the raw request path. `api-metrics.ts` skips routes generated by `@fastify/static` for the same reason: in `STANDALONE_MODE` `serve-ui.ts` registers it with `wildcard: false`, so every built asset gets its own route and `http.route` would be a content-hashed filename.

### PostHog Product Analytics

Separate from the OpenTelemetry metrics above. `src/services/telemetry/telemetry-service.ts` captures product events; the events listed in `POSTHOG_AGGREGATED_EVENTS` are too high-volume to send one-per-occurrence, so they are buffered in Redis and rolled up by the `TelemetryAggregatedEvents` cron every 10 minutes.

**Buffered events live in one Redis stream per (event type, bucket)** — `telemetry-agg-stream:<event>:<bucket>`, 30 buckets, bucket chosen by hashing the `distinctId`. Two invariants hold that shape together:

- **Never discover buffered events by pattern.** The previous layout wrote one Redis key per event and the cron found them with `getKeysByPattern` per (event type, bucket), so each run cost `events × buckets` full keyspace walks — 240 walks over a ~440k-key keyspace, ~73s of Redis engine CPU every 10 minutes, and it grew every time an event was added to the aggregation list. The stream layout is read by key, so the cost tracks the number of pending events instead of the size of the keyspace. Adding an event type to `POSTHOG_AGGREGATED_EVENTS` must stay free of keyspace scans.
- **A `distinctId` must always hash to the same bucket.** Each shard is aggregated independently, so a `distinctId` split across shards produces one aggregated PostHog event per shard instead of one overall.

Draining is at-least-once: a shard is trimmed (`XTRIM MINID`) only after the PostHog client has *delivered* its batch, so a run that throws before that point retries the whole batch on the next tick. Handing the batch to `capture` is not delivery — that only enqueues it in the SDK's in-memory buffer, and the stream holds the only durable copy, so the drain awaits `flush()` before trimming. **Two posthog-node behaviours make that flush work, and removing either silently breaks the guarantee without failing a test:**

- **`capture()` does not enqueue inline.** It resolves a promise chain first (`prepareEventMessage(...).then(...)`), so in the tick the capture loop ends the SDK's queue is still empty, `_flush()` returns at `if (!queue.length)`, and `flush()` resolves *successfully having sent nothing* — after which the drain trims. Delivery would then happen, if at all, on the SDK's own 10s interval, so a restart or a failing PostHog inside that window loses the batch instead of retrying it next tick. The drain therefore yields a macrotask (`settleCapturedEvents`) between the last `capture` and the `flush`. Awaiting the publish is not enough: the chain is several hops deep, and only a full macrotask yield drains it regardless of depth.
Both are guarded by `telemetry-posthog-delivery.test.ts`, which drives the real client against a local HTTP server and asserts the batch is on the wire before the trim. A mocked client cannot see either behaviour, so an SDK upgrade that changed them would otherwise break delivery with every unit test still green.

- **The queue defaults to 1000 entries and evicts the *oldest* on overflow**, logged at `info`. A drain enqueues one event per aggregation group with nothing draining in between, so the default drops the front of any shard that aggregates past it. The client is constructed with `maxQueueSize` sized to the collect ceiling × `BUCKET_CONCURRENCY`. Do not switch to `captureImmediate` to sidestep this: it POSTs one event per call (~200k requests where batching sends ~2k) and swallows delivery errors, so the drain would lose its only failure signal. A rejected flush therefore costs a duplicated batch at worst, where trimming first would have lost it outright. One run drains at most 50k entries per shard, so a backlog is worked off over several ticks instead of being pulled into the cron's memory at once. That ceiling bounds the footprint of one shard; `BUCKET_CONCURRENCY` bounds how many of them are in flight, so the two multiply and both have to stay low. Raising either buys wall-clock the run does not need, since it is Redis-RTT-bound over 240 mostly-small shards and finishes well inside the cron's 8-minute handler timeout.

**Two independent bounds keep a shard from growing without limit, and both are load-bearing:**

- **Count**, on the write path — `MAXLEN ~` 100k entries per shard.
- **Age**, at the top of every cron run — each shard is trimmed to a 30-minute retention window before it is read. This trim sits *outside* the drain's error scope deliberately: a publish path that throws on every tick still has to age entries out, or the shard parks at its `MAXLEN` cap with nothing bounding how long buffered analytics sits in Redis. It is why a broken drain costs 30 minutes of product analytics instead of unbounded Redis memory.

Shards are reached only by iterating `POSTHOG_AGGREGATED_EVENTS` × the 30 buckets, so a shard stops being trimmed the moment it leaves that product: removing an event type from the list, lowering the bucket count, or rolling back past this layout all orphan live shards. **Every shard therefore carries a 1-hour `EXPIRE`**, which is what reaps those orphans. It is set two ways, and both are needed:

- **On the write path**, in the same `MULTI` as the `XADD`, so a shard has an age bound from the moment it is created. Relying on the cron alone leaves a window where a freshly created shard has no TTL at all — and an instance whose cron never runs (a rollback, an event type dropped from the list, telemetry disabled on the reader side) would keep that shard forever.
- **On every cron run**, refreshed on each shard it visits, so a shard the drain is still working keeps its deadline pushed out.

Two properties make the TTL safe to rely on:

- **It must stay above the retention window.** On a shard that is still being written the expiry is a second, coarser deadline racing the age trim. At 1 hour against 30 minutes the age trim always wins, and the TTL only ever fires on a shard that has gone quiet and that the cron no longer visits. Shortening it toward the retention window, or lengthening the cron's 10-minute interval past it, would start deleting shards out from under live writers.
- **It reaps, it does not migrate.** An orphaned shard's buffered entries are dropped, not drained. To hand an event type off cleanly, leave it in `POSTHOG_AGGREGATED_EVENTS` for one release so the cron empties it first.

**Every bound above is silent when it bites, so all four limits are instrumented** (`recordProductAnalytics*Metric` in `lib/telemetry/metrics.ts`, labelled by event type only — the bucket id would multiply the series by 30). The retention trim reports how many entries it aged out, the parse step reports what it could not read back, and each drained shard reports the backlog it left behind, measured with `XLEN` after the drain trim (skipped entirely when OTel collection is off, since that round trip buys nothing else). Backlog is the leading signal: it rises before retention drops start, and a shard sitting near the `MAXLEN` cap is also shedding entries on write, which nothing can count. **Do not change one of these limits without reading those metrics first** — that is what they exist for, and the operator-facing version is in `docs/self-hosting/guides/monitoring-telemetry.mdx`.

Nothing reads the pre-stream `telemetry-event-*` keys, so a deploy that changes this layout drops whatever is still buffered. That is acceptable for product analytics, and it is the reason there is no migration path to maintain.

### Instance Root Encryption Key (rotation)

`ENCRYPTION_KEY` wraps the in-DB root key in `kms_root_config`, which wraps everything else. It is
rotatable, and three invariants hold that up.

**The sentinel row always holds the active key.** `kms_root_config` can hold up to three rows, but
`KMS_ROOT_CONFIG_UUID` is always the current one. That id is no longer "the config row", it is a
compatibility handle: an app version predating rotation looks the row up by id and knows nothing about
staged keys or retained copies, so keeping the active key there is what lets such a version boot. New
code never looks rows up by id — it **trial-decrypts** in a fixed order (sentinel, staged, retained), so
`kekLabel` is never a lookup key. It exists on both tables purely as a human label, derived from the key so
an operator can recompute it and match an archived key to a backup; nothing resolves a row by it.

**A rotation is inert until a pod boots with the new key.** `POST /admin/encryption/root-key/rotations` writes
a *staged* row and does not touch the sentinel, so generating a key changes nothing and discarding it is a row
delete. `$resolveRootKey` promotes it on the first boot that decrypts it: the sentinel takes the new
ciphertext, the old one moves to a retained copy, and **every** staged row is dropped (an abandoned staged
row is a live working key, so a replaced staged key left in someone's clipboard must not be able to promote
itself later). There is no rollback after promotion, only the retention window during which the old key still
boots.

**The legacy tier is pinned, not rotated.** `project_bots`, `user_encryption_keys.serverEncryptedPrivateKey`,
`secret_blind_indexes` and `org_bots` encrypt straight from the env var. `kms_legacy_encryption_keys` snapshots
those env values under the root key at boot, and `crypto.ts` / `encryption.ts` read the snapshot instead of
`process.env`, which is what decouples that tier from the environment. The snapshot holds **both** the
post-FIPS-relabel values (used for writes, so ciphertext is unchanged) and the pre-relabel ones (tried on
decrypt, because the relabel at `env.ts:746-748` overwrites its target unconditionally). That tier
is never rotated; `infisical.legacy_root_key.usage` is the evidence for when it can be deleted.

Consequences worth knowing:

- **A migration must never call `*WithRootEncryptionKey` or `buildSecretBlindIndexFromName`.** Migrations run
  before `kmsService.startService`, so they cannot reach the snapshot and fall back to `process.env`, which on
  a rotated instance is the wrong key: decrypts fail the auth tag, encrypts silently write unreadable rows.
  Oxlint blocks this under `src/db/migrations/`; the pre-existing call sites carry a file-level disable
  explaining why they are safe.
- **Exactly one retained key survives a promotion, enforced at promotion, not by the GC.** A second
  rotation before the first was completed would otherwise leave an older wrapper of the root key that
  `getRootKey` never reports (it returns only the newest), so an operator removing "the previous key" is
  told the rotation is finished while a leaked older `ENCRYPTION_KEY` still opens the database. The cost is that an
  instance two rotations behind cannot restart; staging a key warns about that and deliberately does not
  block, since an operator responding to a leak has to be able to rotate again immediately.
- **`updateEncryptionStrategy` refuses while a rotation is in flight.** A switch to HSM would not otherwise be
  enforced, since a pod with the old env key would still trial-decrypt a retained software copy and boot
  without touching the device.
- **`lastResolvedAt` can prove presence, never absence.** An instance stamps it at boot only when it resolves a
  *superseded* row, which is positive evidence a straggler still holds that key and makes both the
  expiring-key delete and the GC decline. An instance that never restarts never stamps, so the retention window is what covers it.
  That is the deliberate limit: getting it wrong costs an instance that fails its next restart with an error
  naming the key it needs, not lost data.

### Database Configuration

Knex config in `src/db/knexfile.ts`. Loads `.env.migration` then `.env`. Supports `DB_CONNECTION_URI` or individual host/port/user/name/password fields. Optional SSL via `DB_ROOT_CERT` (base64-encoded CA cert). Connection pool: min 2, max 10. Migrations table: `infisical_migrations`. Separate audit log DB supported via `auditlog-migration:*` scripts. ClickHouse for analytics (optional).

Migrations in `src/db/migrations/`. Auto-generated Zod schemas in `src/db/schemas/`.

## Wiring a New Feature (Checklist)

1. Create service module in `src/services/<name>/` (or `src/ee/services/<name>/` for EE) with DAL, service, and types files
2. If adding DB tables: create migration via `npm run migration:new`, run it, then `npm run generate:schema`
3. Wire in `src/server/routes/index.ts`: instantiate DAL → instantiate service → add to `server.decorate("services", {...})`
4. Create router in `src/server/routes/v<N>/` (or `src/ee/routes/v<N>/` for EE) and register it
5. Review the whole change against [`CODE_QUALITY.md`](CODE_QUALITY.md)
6. Run `make reviewable-api` to verify lint + types
