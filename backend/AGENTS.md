# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the **backend** package of the Infisical monorepo — a Fastify 4 API server with TypeScript, PostgreSQL via Knex, and BullMQ queues.

The backend code quality guide is imported below, so it is always in context for work in this package. **Check every change against it, whatever the change is, before calling the task done.** This file covers _where_ code goes and _which_ pattern to follow; the quality guide covers the minimum any implementation has to handle. It is a deliberately non-exhaustive floor, so the topics it happens to cover are not a filter for whether it applies.

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

#### Every API change gets a blackbox test plan

Before implementing any change to the API (a new or changed route, status code, error message, response
shape, mail, third-party call, or a queue or cron effect a client can observe), plan what it needs in the
root [`tests/`](../tests/AGENTS.md) suite, the Go blackbox tests that call a real Infisical over HTTP, and
put that list in the plan: which tests under `tests/suites/<product or area>/` (or `tests/suitesisolated/`
when the change writes instance-wide state) to add or update, the actor each
claim is about, and the rejection cases (each also checking nothing changed). Read `tests/AGENTS.md`
first.

- Split by what the test needs: client-observable behaviour goes in `tests/`; anything needing our
  Postgres or Redis, an internal service, or a mocked module goes in `e2e-test/`; pure functions get unit
  tests.

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
Oracle Instant Client, the FIPS OpenSSL 3.1.2 build and the PQC OpenSSL 3.5.9 build) live in
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
  guarantee. It is _not_ the FIPS product image; that one is `infisical/infisical-fips`,
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

The entire dependency graph is manually wired in `src/server/routes/index.ts` (5k+ lines, so search by name), in this order: DAL instantiation (each DAL factory receives the `db` client), service instantiation (each factory receives its DALs + other services), `server.decorate("services", {...})` exposing them as `server.services.*`, then route registration, where `registerV<N>EERoutes` is registered before `registerV<N>Routes` for each API version.

See `secretServiceFactory` in `src/services/secret/secret-service.ts` for a representative factory with ~20 dependencies. See `src/services/user/user-service.ts` for a simpler example (~8 dependencies).

### DAL Layer (Data Access)

Each service has a `*-dal.ts` that wraps `ormify()` (defined in `src/lib/knex/index.ts`). `ormify()` provides typed CRUD methods: `findById`, `find`, `findOne`, `create`, `insertMany`, `batchInsert`, `upsert`, `updateById`, `update`, `deleteById`, `delete`, `countDocuments`, `transaction`.

DALs extend these with custom queries — typically complex joins using Knex query builder and `sqlNestRelationships()` for nested entity mapping. All methods accept an optional `tx` parameter for transaction threading.

**Read replica pattern**: Read methods use `db.replicaNode()` (e.g., `(tx || db.replicaNode())(tableName)`), while writes always hit the primary (`(tx || db)(tableName)`). See any `ormify()` method in `src/lib/knex/index.ts` for the pattern.

`updateById` and `update` support atomic `$incr` and `$decr` operators alongside regular field updates.

**A dropped column does not fail type checking if the insert is built in a `.map()`.** TypeScript's
excess-property check only fires on a fresh object literal at the assignment site, so a stale field
survives when the literal is returned from a callback:

```ts
insertMany(names.map((name) => ({ name, role: "member", orgId }))); // compiles, then 500s at runtime
insertMany([{ name, role: "member", orgId }]); // TS2353
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

#### SSO session binding

A session minted by a SAML, OIDC or LDAP login carries `issuingRootOrgId`, the root org whose IdP
issued it (`processProviderCallback` sets it; own-credential sessions never have it). An org that
enforces SSO admits only sessions its own IdP issued: `validateOrgSSO` compares the claim with the
org's root org on every user permission check, reading it from `userAuthInfo` in the request context
(only when the check is for the requester), so it covers `selectOrganization`, OAuth consent, and a
session that was already open when enforcement was turned on. Members who can bypass SSO are let
through, and a token with no claim (issued before it existed) is taken at its auth method. Enforcement
is org policy, not a permission: the permission service reads `authEnforced`, `googleSsoAuthEnforced`
and `bypassOrgAuthEnabled` per request from the root org (`getOrgSsoPolicy`, through the same
`orgFindById` request memo the auth layer fills), never from `permissionDAL.getPermission` or the
cached project permission, so a change applies on the next request. A sub-org has no enforcement of its
own and follows its root, and only a root org role can bypass it, so a sub-org admin role exempts no
one. The project permission cache holds only that role-derived bypass answer.

**Every path that issues or re-issues a user token must carry the claim forward** (MFA, refresh,
signup, org deletion, delegated OAuth codes and tokens). A dropped claim reads as a pre-claim token
and passes every org's enforcement. `selectOrganization` audits the refusal
(`SELECT_ORGANIZATION_REFUSED`) by catching the `FOREIGN_SSO_SESSION_ERROR_NAME` error
`getOrgPermission` throws.

#### MFA for SSO logins

**Before changing `ssoMfaTrust`, `idp-mfa-signal.ts`, the SSO callbacks' MFA handling or `isIdpMfaTrusted`,
read [`src/services/auth/AGENTS.md`](src/services/auth/AGENTS.md).** For code elsewhere: `isIdpMfaTrusted`
(`auth-fns.ts`) is the only reader of the setting, and an IdP's MFA verdict never sets `isMfaVerified`, which
still means "proved a factor to Infisical" (step-up and PAM MFA rely on it).

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

- **A `POST` that only reads keeps it.** Nine endpoints are `POST` solely because a lookup needs a request
  body: `POST /v1/identities/search`, `POST /v2/identities/search`, `POST /v2/identities/search/count`,
  the two `memberships/details` routes, and the dashboard's `secrets-overview`, `secrets-details`,
  `secrets-deep-search` and `secrets-by-metadata`, which carry search terms users paste secret values
  into and so keep them out of URLs. All nine check a CASL read ability.
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

**The token endpoint answers in RFC 6749 §5.2 shape** through `OauthTokenError` (`oauth-token-error.ts`),
not the house envelope. Every `return` in its handler's `try` must be awaited, and a new way to refuse a
subject must throw `UnauthorizedError` or `ForbiddenRequestError`, which `toOauthTokenError` maps by class
(the grant's rejected-grant code: `invalid_grant` on redirect and refresh, `invalid_request` on token
exchange); `BadRequestError` maps to `invalid_request`, and anything else becomes an opaque `server_error`.
Throw `OauthTokenError` directly where that default is wrong (`invalid_client`, `unauthorized_client`,
PKCE or redirect-URI mismatch, `invalid_scope`, `invalid_target`).

**Token exchange** (`oauth-token-exchange-fns.ts`) trusts the org's OIDC SSO config plus the client's
`tokenExchangeAudience`. `getOrgPermission` is **not** a membership check (it ignores `isActive` and
`status`), so `exchangeSubjectToken` checks membership itself, as must any future non-interactive way of
minting a user token. A new client field that carries federation trust goes in both
`hasWithdrawnTokenExchangeTrust` and `hasClientAuthorityChanged`, so narrowing it revokes issued tokens.

**The exchange re-reads the client after creating its own session** (`findByIdForUpdate` +
`hasClientAuthorityChanged`, re-running the sweep), because a withdrawal's `revokeSessionsByUserAgent` sweep
only reaps sessions that already exist. Keep that read locking and on the primary, and keep each withdrawal's
client write and its sweep in one transaction: a plain read sees the pre-withdrawal row until that transaction
commits, after its sweep has already scanned past the new session.

### User Aliases: Provisioning Identifiers and IdP Profile Sync

**Before touching `user-alias-fns.ts`, SCIM user handlers, SAML, OIDC or LDAP login, or any invite / removal
path that resolves people by identifier, read
[`src/services/user-alias/AGENTS.md`](src/services/user-alias/AGENTS.md).**
In short: resolve by exact `users.username` first and only then by `resolveUsersBySsoExternalId`; match
`externalId` exactly (never case-folded), scoped by org and alias type; treat ambiguity as an error.

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

**Folder RBAC (folder-scoped privileges)**: `additional_privileges` rows with a `folderId` + `role` (`SecretFolderRole` in `folder-roles.ts`) ride in the same cached permission blob, covered by a per-project folder-permission version counter appended to the fingerprint (`getProjectPermissionFingerprint`). A grant's path comes from the folder tree, so a rename changes what it allows without touching its row. Therefore:

- **Call `permissionService.invalidateProjectFolderPermissionCache`** from folder-access grant create/update/delete and from every folder rename, move or delete path.
- **Membership teardowns must not call it**: the membership row they delete is already in the fingerprint. This holds only while a teardown reaps grants in exactly the projects the actor is losing.
- `buildFolderScopedPrivilegeRules` emits a deny of every secretPath-capable subject at the granted path followed by the folder role's allows. Adding a secretPath-scoped subject or action fails `folder-scoped-privilege-rules.test.ts` until you extend `FOLDER_SCOPED_DENY_RULES`.

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
const project = await requestMemoize(`project:findById:${projectId}`, () =>
  projectDAL.findById(projectId),
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

**Do NOT use BullMQ repeatable jobs or `JobScheduler` for recurring/cron-pattern work.** All scheduled/periodic tasks must use the cron manager (see below). The previous BullMQ-repeatable pattern has been migrated off, and `queueServiceFactory` actively cleans up stale repeatable queues and schedulers on boot (`staleQueueNames` in `src/queue/queue-service.ts`) — re-introducing a BullMQ repeatable will collide with that cleanup and cause double execution.

Queue handler factories (e.g., `src/services/secret/secret-queue.ts`) follow the same DI pattern as services — they receive DALs and services as dependencies.

`queueService.start(name, handler, opts)` accepts `concurrency` (per-worker parallelism ceiling) and BullMQ's `limiter: { max, duration }` (fleet-wide throughput cap, coordinated via Redis). Use both to **rate-shape DB-heavy background work** so a large backlog drains as an even plateau instead of a burst — see `src/services/project/project-cleanup-queue.ts`. The cron cadence must not be the pacer; load is bounded by `concurrency × per-job cost`, and the limiter caps steady throughput.

**`INFISICAL_RUN_MODES` gates the consumer, never the producer.** `start()` creates the BullMQ `Queue` for every queue in every run mode, and only skips creating the `Worker` when the queue isn't consumed by this pod: `secret-scanning` covers `SECRET_SCANNING_QUEUES`, `general-workers` covers everything else. This invariant is what makes splitting the fleet safe — an API-only pod runs no workers at all but must still be able to enqueue, since `queue()` silently no-ops on an uninitialized queue (`await q?.add(...)`) and would otherwise drop every job destined for another pod's worker. It also means `upsertJobScheduler` works from any pod, so boot-time scheduling needs no run-mode branch.

`QUEUE_WORKERS_ENABLED` and `QUEUE_WORKER_PROFILE` were replaced by `INFISICAL_RUN_MODES` and no longer exist.

**Worker heartbeats detect a fleet nobody deployed**, since an ungated producer means an `api`-only deployment silently queues work nothing consumes. In `src/lib/worker-heartbeat/worker-heartbeat.ts`: a `general-workers` pod `startReporting`s itself into a per-worker-type sorted set scored by its heartbeat deadline (60s beat, 5-minute TTL), and an `api` pod that doesn't run the fleet `startMonitoring`s it, logging an error while no instance reports. Observation only — never wire it into `/api/status`; a deployment missing its workers must still serve API traffic.

### Scheduled Jobs (Cron Manager)

Recurring work runs through the cron manager in `src/lib/cron/cron-job.ts` (`cronJobFactory`). A single instance is constructed in `src/server/routes/index.ts` and injected as `cronJob` into any service that needs to schedule periodic work. The factory exposes `register`, `start`, and `stop`; `start` is called once after construction, and `stop` is invoked during graceful shutdown to drain in-flight handlers.

**Only `general-workers` pods start the manager's timers**, so only they execute a scheduled handler; every pod still calls `register`. The separate `cronJobs` array in `src/server/routes/index.ts` is deliberately **not** gated: those refresh the process's own caches (license, env overrides), not fleet work.

**Per-process refreshes use `startLocalRefresh` (`src/lib/cron/local-refresh.ts`), never the cron manager and never a raw `new CronJob`.** The cron manager runs a job once per fleet, which would leave every other pod's in-memory state stale; a wall-clock cron pattern makes every pod fire in the same second. The helper starts each process at a random offset within one interval (random per process on purpose, unlike the manager's deterministic hash), skips a tick while the previous run is in flight, logs and swallows errors, and unrefs its timers. Its `stop()` handle is what goes in `cronJobs`. It records `infisical.local_refresh.*` on the `InfisicalCore` meter, labelled by `name` as `job.name`, so a new refresh needs no metric code; keep `name` a fixed string. A failing refresh keeps retrying on every tick rather than giving up after N failures, because stopping would freeze the pod's state at whatever it last loaded. The `consecutive_failures` gauge (reset on success) is the alerting signal.

**Why this exists instead of BullMQ repeatables**: cron runs are coordinated across pods via a slot-election scheme (5 participant slots backed by Redis SET NX/PX) plus per-run redlocks, so each fire executes exactly once across the fleet without the orphaned-scheduler / duplicate-execution failure modes the BullMQ `JobScheduler` had. The manager also handles crash recovery via lease TTLs, hang recovery via per-handler timeouts, and bounded exponential backoff that won't overlap with the next scheduled fire.

**Registering a cron job**:

1. Add a new entry to the `CronJobName` registry at the top of `src/lib/cron/cron-job.ts`. All cron names must be defined there — don't pass raw strings.
2. In the owning service/queue file, take `cronJob: TCronJobFactory` as a dependency and call `cronJob.register(...)` from an `init()` (or `start*()`) method:

   ```ts
   import { CronJobName, TCronJobFactory } from "@app/lib/cron/cron-job";

   export const myServiceFactory = ({
     cronJob,
   }: {
     cronJob: TCronJobFactory;
   }) => {
     const init = () => {
       cronJob.register({
         name: CronJobName.MyJob,
         pattern: "*/5 * * * *", // standard cron, UTC
         runHashTtlS: 60 * 60, // how long the run hash lives in Redis
         enabled: !appCfg.isSecondaryInstance, // gate per-deploy if needed
         maxAttempts: 3, // optional, default 3
         handler: async () => {
           /* work */
         },
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
  - **Jitter** spreads pickup, and is _derived, never configured_: a job's window is `JITTER_INTERVAL_FRACTION` (0.25) of its own cron interval, capped by the factory's `maxJitterMs` (5 min), so a `*/5` job gets 75s and anything at or past a 20-minute interval gets the full 5 min. Two things follow from the fraction being below 1: a run can never reach its own next fire, and the first retry always fits (worst case `0.25 x interval + 30s backoff + 1s`, under `interval` for anything above ~41s, and cron cannot fire faster than every 60s). The offset within the window is `sha256(name) % window`, never random: every pod computes a run's eligibility independently and the run id is keyed on the _unjittered_ fire, so a per-pod offset would break the Redis enqueue dedup and the lease logic. Only the pending-zset score carries the offset; the run id and `scheduled_at` are unchanged. Development wiring passes `maxJitterMs: 0` so a job runs when its pattern says. `register` rejects anything but a 5-field pattern: the retry model assumes minute granularity, and a 6-field pattern firing every 30s would have its first retry land past its own next fire. Sub-minute recurring work belongs on a `setInterval` or a queue, as the event outbox relay does.

**When to use cron vs. queue**:

- Scheduled/recurring (every N minutes, daily at X, cron pattern) → `cronJob.register(...)`.
- One-shot or event-triggered work (enqueued from a request handler or another job) → BullMQ queue + worker.
- A cron handler that fans out per-tenant work typically _enqueues BullMQ jobs_ for each unit of work rather than doing the work inline — keep the cron tick fast and let the queue worker handle parallelism and retries for the actual payload.

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

**Before writing a consumer or changing the outbox itself, read
[`src/services/event-outbox/AGENTS.md`](src/services/event-outbox/AGENTS.md)** (retry ownership,
`isFinalAttempt`, fenced claims, ordering). In short: delivery is at-least-once with best-effort ordering,
and one event's failure must never escape `handle` (use `runEventsSerially` / `runEventsConcurrentlyByKey`).

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

### Org Access Reconcile (second outbox consumer)

Lives in `src/services/org/`: `org-membership-events.ts` (event contract), `org-access-reconcile-consumer.ts`
and `org-access-sweep-queue.ts`, with queries on `org-dal.ts`. The rule: **an actor keeps project
memberships in an org only while they have a direct org row there or are in a group that has one.** A user
can reach a sub-org only through a linked root group, so code removing a group membership can't tell by
itself whether the actor still reaches the org.

Rules for code outside the consumer:

- **Every removal of an org path emits its fact event in the same tx**
  (`com.infisical.organization.<group-membership|group-link|group|membership>.removed.v1`, contracts in
  `org-membership-events.ts`). Group events snapshot orgs (always via `groupDAL.findGroupOrgIds`) and members
  at removal time, paged at 100 because payloads over 16 KiB roll back the removal.
- **What leaving an org's projects takes away is defined once**, in
  `projectAccessRevokeService.revokeActorsInOrgs`. Don't add another copy of that list.
- **Removing an actor from an org tears down synchronously, through one path per actor kind:**
  `deleteOrgMembershipsFn` for users and `$removeIdentityFromOrg` (`membership-identity-service.ts`) for
  identities. Both tear down only groups the removed org owns; a root group linked into a sub-org belongs to
  the root and survives.
- **Every path that writes a project or resource membership calls `lockAndAssertActiveOrgAccess`**
  (`services/org/org-access-fns.ts`) inside its own transaction, before the write. A new path that grants an
  org path outside the `group-fns.ts` helpers takes `orgDAL.lockActorsForOrgAccess` (root org first, then
  sorted actors, so callers can't deadlock). Org-membership pre-checks outside the transaction stay only for
  their error messages; they don't close the race.
- **Pick the right helper on `org-dal.ts`:** `findActorsWithActiveOrgAccess` ("can we grant now", used by
  every add path and candidate list; a deactivated direct member stays out even if a group holds the org)
  versus `findActorsWithOrgAccess` (ignores deactivation, reconcile
  consumer only, so deactivating someone doesn't reap their rows).
- Group-only members can hold direct project memberships; project invite routes pass
  `skipUsersWithOrgAccess` so they aren't turned into direct org members.
- This is not the enforcement path (token validation already rejects actors without org membership), and
  the daily `org-access-reconcile-sweep` cron is a backstop. End-to-end coverage:
  `e2e-test/routes/v1/org-access-reconcile.spec.ts`.

### Organization Deletion

Every organization delete (the org's own admin, a server admin, a sub-org's parent) goes through
`orgDeletionService.deleteOrganization` (`services/org/org-deletion-service.ts`), never `orgDAL.deleteById`
directly. It runs the cross-table cleanups and emits `OrganizationModifiedEventV1` (`org-events.ts`) inside
the delete transaction; `license-org-deleted-consumer.ts` then tells the license server to cancel the
subscription, retrying through the outbox. A delete that skips the service leaves the customer billing.

### Soft-Delete + Async Cleanup

Resources whose deletion cascades across many/large tables use a **soft-delete + paced async hard-delete** pattern instead of a synchronous cascade in the request path.

Pattern:

- **Soft-delete columns** on the table: `deleteAfter`, `softDeletedAt`, `deletedByActorType`, `deletedByActorId`, plus a **partial index** `WHERE deleteAfter IS NOT NULL` (tiny, ~zero write cost on the live path). The DELETE handler sets `deleteAfter` (one UPDATE) and returns immediately. Set `deleteAfter = now()` for "real delete" UX (reaped on the next worker tick) or `now + grace` for a restore window. The actor pair follows the same `(actorType, actorId)` pattern used by audit logs — extensible to any `ActorType` without schema changes.
- **Hide soft-deleted rows from every read.** Override the `ormify` base `findById`/`findOne`/`find` to append `.whereNull("deleteAfter")`, and add explicit `*IncludingExpired` escape hatches used only by the cleanup worker/restore. Patch all custom read queries too — **especially any count feeding a plan/quota limit** (e.g. `countOfOrgProjects`), or soft-deleted rows wrongly count against limits. For unique columns, keep the value reserved while the row is restorable so a restore brings it back unchanged, and refuse creating or renaming to it with a message naming the pending-deletion holder (environments and Secret Manager projects do this with their slug). On an immediate purge, free it so the resource can be recreated right away (projects rename the slug to `del-<random>`).
- **`Environment.deleteAfter` ≠ `Project.deleteAfter` — filter both.** The two soft-deletes are independent: soft-deleting a project does NOT soft-delete its environments. Many DALs already filter `Environment.deleteAfter` (from the env soft-delete) — that does **not** exclude a soft-deleted *project*'s data. So any **cron / cross-project enumeration** must also filter `Project.deleteAfter`: the rotation/sync/reminder queue queries, and cross-project listings (project/identity memberships, group projects, org product stats). External side effects are the dangerous case — without it, a soft-deleted project's secrets get rotated, synced, or reminded on during the cleanup window. Per-project reads resolved through `projectDAL.findById` are protected upstream (it returns nothing for a soft-deleted project).
- **Cron discovery + paced worker** (cron fans out to BullMQ): the cron selects the oldest `LIMIT N` expired rows (`ORDER BY deleteAfter ASC`) and enqueues one job each with a deterministic `jobId` (dedupe → queue stays bounded at ~N; never enqueue the whole backlog). The worker (`concurrency` + `limiter`) does the actual delete, re-reading via the **primary** under a per-resource lock to defeat replica-lag/restore races.
- **Chunk-deleting child rows: check inbound FKs first.** Reference implementation: `services/secret-v2-bridge/secret-tree-hard-delete-fns.ts` (project/env hard-delete workers).
  - `CASCADE` / `SET NULL` inbound FKs → safe to chunk.
  - `DEFERRABLE NO ACTION` → only if you delete the referencing rows in the **same transaction**; hard-delete paths only (never live deletes).
  - Non-deferrable `NO ACTION` / `RESTRICT` → neither path is safe: it breaks the final cascade too (next bullet). Migrate the FK to `DEFERRABLE INITIALLY DEFERRED` first.
  - Each batch: own transaction + `SET LOCAL statement_timeout`.
- **A non-deferrable `NO ACTION`/`RESTRICT` inbound FK is unsafe under cascading deletes; make it `DEFERRABLE INITIALLY DEFERRED`.** It is checked at end of _statement_, so within one cascading `DELETE` a parent branch can be processed before a sibling branch deletes the referencer, raising "update or delete on X violates FK on Y". When a CASCADE child of the deleted root is itself referenced by `NO ACTION`/`RESTRICT` FKs, declare those FKs `.deferrable("deferred")` so the check runs at COMMIT after the cascade completes (a _direct_ parent delete is still blocked while a referencer remains). Audit **all** inbound `NO ACTION`/`RESTRICT` FKs of such a parent, not just one.
- **Index every inbound FK before chunk-deleting a large table** (see the FK index rule under Database): an unindexed child means one seq-scan _per deleted parent row_, which blows past `statement_timeout`. For a mostly-NULL nullable FK, a partial index `WHERE col IS NOT NULL` serves the cascade lookup at a fraction of the size/write cost.
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
logger.error(
  { sessionId, err },
  `Failed to get connection details [sessionId=${sessionId}]`,
);

// Also acceptable: identifiers in message only
logger.info(
  `getPlan: Process done for [orgId=${orgId}] [projectId=${projectId}]`,
);

// NOT preferred: identifiers only in structured object, not in message
logger.error({ sessionId, err }, "Failed to get connection details");
```

**Never log an outbound URL verbatim — a URL is often itself a credential.** Incoming-webhook providers put the bearer secret in the path (`https://hooks.slack.com/services/T…/B…/<secret>`, Discord, Teams, Telegram) and many APIs accept a token as a query param, so a raw URL in a log line ships a working credential to the log sink. Pass it through `sanitizeUrlForLog` from `@app/lib/logger` first (`src/lib/logger/sanitize-url.ts`): it keeps only the origin, strips userinfo and the fragment, redacts the entire path, and redacts every query value. Token formats can't be recognised reliably, so the path is redacted by default for every host rather than sniffed with heuristics. The global axios response interceptor (`src/lib/config/request.ts`) and `safeRequest`'s dispatch log already do this.

Note that `logger.ts` also has a `redactedKeys` list applied to structured-object fields up to depth three. It only matches by key name, so it does **not** help with a secret embedded in a `url` field.

### Certificate soft delete

**Before changing certificate deletion, the expiry cleanup job, renewal or certificate syncs, read
[`src/services/certificate/AGENTS.md`](src/services/certificate/AGENTS.md).** For code elsewhere:
- Delete only through `softDeleteCertificates` (`certificate-fns.ts`); nothing hard deletes certificates, so
  the row stays.
- A new query over `certificates` filters `whereNull("deletedAt")` unless it deliberately shows deleted rows.
- Deletion is not revocation: CRL and OCSP keep deleted certificates, the licence quota still counts an
  issued one until it expires or is revoked, and a deleted certificate is never renewed
  (`assertCertificateNotDeleted`).

### Certificate revocation: CRL and OCSP

**Before touching `certificate-authority-ocsp` or `certificate-authority-crl`, read
[`src/ee/services/certificate-authority-ocsp/AGENTS.md`](src/ee/services/certificate-authority-ocsp/AGENTS.md).**
One rule binds code elsewhere: **any new path that revokes a certificate must bump
`internal_certificate_authorities.ocspGeneration` in the same transaction as the status write** (as
`revokeCert` does), or cached OCSP responses keep answering `good`.

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

### Cross-signed CA certificates and issued chains

An internal CA holds at most one cross-signed certificate (`certificate_authority_cross_signed_certs`),
managed by `ee/services/certificate-authority-cross-signed-cert/`. Every leaf issuance path builds its stored chain with `getIssuedCaCertChain` (`certificate-authority-fns.ts`),
which swaps in the copy. Trust-anchor endpoints (CA certificate download, AIA, EST cacerts, SCEP GetCACert)
keep using `getCaCertChain`, so they still return the self-signed CA.

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
- **Every signed token is audit logged** (`issue-oidc-token`, with the connection's ID and name) inside
  `signToken`, so a new consumer gets it for free and never logs on its own.
- **Connections sign for their own ID only.** `signToken` takes the connection, not a subject, and builds
  `app-connection:<id>` itself, and the token is only ever sent to the provider's token endpoint, never
  returned to a caller. Never let a caller choose the ID: a deleted connection's ID would
  regain whatever the provider still trusts. So the connection is created first, without a token exchange,
  and reconnecting verifies it once the customer has added the federated credential. The Azure Key Vault
  `managed-identity` method is the reference consumer: copy its `getManagedIdentityAccessToken`, which
  caches the provider's access token in the credentials like the secret-based methods do.
- **The API returns the values the customer copies.** Connection responses carry
  `credentials.federatedCredential` (issuer URL, subject, audience), built on every read by
  `addAppConnectionFederatedCredential` and never stored, so the UI and Terraform read them rather than rebuild them.
  The issuer is null when `SITE_URL` is unset, so reading a connection never fails on it.

### Enterprise (EE) Features

Enterprise code lives in `src/ee/`:

- `src/ee/services/` — service modules (access approval, audit log, dynamic secrets, external KMS, gateway, KMIP, LDAP, OIDC, PAM, PKI, SAML, SCIM, secret approval/rotation/replication, etc.)
- `src/ee/routes/v1/`, `src/ee/routes/v2/` — EE route files

EE routes register before community routes so they can override/extend endpoints. Feature gating via license service (`src/ee/services/license/license-service.ts`) which validates online/offline licenses, caches feature sets in keystore with 5-minute TTL, and exposes `getPlan()` to check feature availability.

**PAM**: Before working on any `pam-*` service or router, read [`src/ee/services/pam/AGENTS.md`](src/ee/services/pam/AGENTS.md) for a high-level map of the PAM backend — module layout, permission model, and non-obvious invariants. It is intentionally a concept map, not a spec: read the referenced code for implementation detail. If you add a feature, keep any addition there brief (a concept or invariant, not code mechanics).

**Certificate discovery**: before working on `pki-discovery-*` or `pki-installation-*`, read [`src/ee/services/pki-discovery/AGENTS.md`](src/ee/services/pki-discovery/AGENTS.md). Linux Server discovery splits work between the backend and the gateway's certificate scanner in the CLI repo, and keystore passwords live on installations, not jobs.

**Agent Vault**: the same applies to the `agent-vault-*` services and routers; the concept map is [`src/ee/services/agent-vault/AGENTS.md`](src/ee/services/agent-vault/AGENTS.md). Agent Vault projects are user-created like any other project type, but their roles collapse to admin or member like PAM's, they have their own identities meter, and they stay out of the billable-project count. So a branch on `ProjectType.PAM` for metering, predefined roles or the billable-project count usually needs an Agent Vault arm too; one about the implicit project does not.

**Secret Scanning** is single-project (see the root `AGENTS.md`): `secret-scanning-v2-project-bootstrap.ts` creates the project with the org when it has a creator to make admin (like PAM), `secret-scanning-v2-project-resolver.ts` picks the active project and lazily creates it, with every org admin as project admin, for older orgs and for orgs created from the admin console, whose admins are only invited after the org exists, and routes that take `projectId` read `req.internalSecretScanningProjectId`. A data source covers the resources it has rows for (added by a user or discovered from a push); its `config` only says where to look (Bitbucket workspace, GitLab group), never which resources, so scans, "included" state and GitLab account-scope webhooks all key off rows. Stored configs may still carry the old `includeRepos` / `includeProjects` keys, which nothing reads.

**Secret scanning scans and GitHub pull request checks**: before changing scan triggers,
`secret-scanning-v2-queue.ts` or the PR check flow, read
[`src/ee/services/secret-scanning-v2/AGENTS.md`](src/ee/services/secret-scanning-v2/AGENTS.md). The queue stays
provider-agnostic: provider behavior goes behind hooks on the data source factory, never a provider check in the
queue.

**Dynamic secret lease secrets needed at revoke time go in `dynamic_secret_leases.encryptedLeaseData`**, never in `externalEntityId` or `config` (both plaintext, and `externalEntityId` is returned by every lease route and logged in audit events). A provider opts in by listing the `create()` `data` keys in `persistedLeaseFields`; the lease service encrypts them with the project's SecretManager key and every revoke path passes them back as `metadata.leaseData`. Lease routes return `SanitizedDynamicSecretLeaseSchema` so the column never reaches a response. Secret _config_ fields are listed separately in `DYNAMIC_SECRET_SECRET_FIELDS` (`providers/redact.ts`), as dotted paths so nested secrets work (`clientAuth.clientSecret`): reads strip them via `redactStoredInputs`, and an update that omits one keeps the stored value via `restoreOmittedSecretFields`, because the update merge is shallow.

**Deleting a honey token row without revoking it leaks its AWS IAM user.** Revocation needs the project KMS
key, so it must run before the project is gone (`honey-token-cleanup-service.ts`): folder and environment
deletes leave a folderless row (`folderId` is `SET NULL`) that the `HoneyTokenCleanup` queue
(`honey-token-cleanup-queue.ts`) reaps, and
`deleteProject` and `deleteOrganizationById` revoke and mark the rows revoked before deleting, leaving the rows
to the `projectId` cascade (so a failed delete leaves them, correctly marked revoked).

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

`ee/services/secret-read-activity/` answers "who has read this secret" from its own month-partitioned
`secret_read_activity` table, not audit logs. Its design is documented in the module's code comments. Two
rules for code elsewhere: a secret read route calls `recordRead` / `recordBulkRead` with `void` (it never
throws and must not slow the read), and the table is pruned by dropping partitions, never with `DELETE`.

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

The gate has to sit at the call site because **a `DROP` aggregation does not bound memory; only an attributes processor does.** The SDK filters attributes _before_ hashing them (so the allowlist View is bounded) but consults the aggregator _after_ (so a dropped data point has already been keyed by its full attribute set). Under cumulative temporality — which `OTEL_EXPORT_TYPE=prometheus` mandates — `TemporalMetricProcessor` then retains one entry per distinct attribute set, with no cardinality cap, for the lifetime of the process. A meter whose data points are dropped therefore still leaks heap if anything records to it, which is why the flag stops the recording (`shouldRecordHighCardinalityMetrics` in `metrics.ts`) _and_ the View strips attributes. With the flag off — the self-hosted default — that retention is the operator's informed choice; the tradeoff is documented in the monitoring guide.

**Rules for InfisicalCore metrics:**

- **No per-tenant / per-actor identifiers** as labels — no org id, user id/email, identity id, ip, user agent, request id, or free-form values (e.g. environment slug). These scale series count with customer count, which breaks CloudWatch's 1000-datapoint-per-OTLP-request limit and drives per-GB ingestion cost. Use the **audit log table** for per-org / per-actor breakdowns.
- Adding a new label means adding it to the allowlist in `telemetry-attributes.ts`. Only add **bounded** keys (fixed enums / static route templates), and document why.
- `http.route` must be the parameterized template (`req.routeOptions.url`), never the raw request path. `api-metrics.ts` skips routes generated by `@fastify/static` for the same reason: in `STANDALONE_MODE` `serve-ui.ts` registers it with `wildcard: false`, so every built asset gets its own route and `http.route` would be a content-hashed filename.

### PostHog Product Analytics

`src/services/telemetry/telemetry-service.ts` captures product events, separate from the OpenTelemetry metrics above. **Before changing `POSTHOG_AGGREGATED_EVENTS` or the Redis stream aggregation, read [`src/services/telemetry/AGENTS.md`](src/services/telemetry/AGENTS.md)**: removing an event type from that list orphans its buffered shards, and the drain must never discover events by key pattern.

### Instance Root Encryption Key (rotation)

`ENCRYPTION_KEY` wraps the in-DB root key in `kms_root_config` and is rotatable; the design is documented
in `kms-service.ts` and `kms-root-config-dal.ts`. Two rules for code elsewhere:

- **`KMS_ROOT_CONFIG_UUID` always holds the active key** so app versions predating rotation can boot. New
  code never looks a root config row up by id or by `kekLabel`; it trial-decrypts (sentinel, staged, retained).
- **Migrations must never call `*WithRootEncryptionKey` or `buildSecretBlindIndexFromName`**: they run before
  `kmsService.startService`, so they fall back to the environment key, which on a rotated instance is wrong:
  decrypts fail the auth tag and encrypts silently write unreadable rows. Oxlint blocks this under
  `src/db/migrations/`.

### Database Configuration

Knex config in `src/db/knexfile.ts`. Loads `.env.migration` then `.env`. Supports `DB_CONNECTION_URI` or individual host/port/user/name/password fields. Optional SSL via `DB_ROOT_CERT` (base64-encoded CA cert). Connection pool: min 2, max 10. Migrations table: `infisical_migrations`. Separate audit log DB supported via `auditlog-migration:*` scripts. ClickHouse for analytics (optional).

Migrations in `src/db/migrations/`. Auto-generated Zod schemas in `src/db/schemas/`.

## Wiring a New Feature (Checklist)

1. Create service module in `src/services/<name>/` (or `src/ee/services/<name>/` for EE) with DAL, service, and types files
2. If adding DB tables: create migration via `npm run migration:new`, run it, then `npm run generate:schema`
3. Wire in `src/server/routes/index.ts`: instantiate DAL → instantiate service → add to `server.decorate("services", {...})`
4. Create router in `src/server/routes/v<N>/` (or `src/ee/routes/v<N>/` for EE) and register it
5. Plan the blackbox tests in the root `tests/` suite (see "Every API change gets a blackbox test plan")
6. Review the whole change against [`CODE_QUALITY.md`](CODE_QUALITY.md)
7. Run `make reviewable-api` to verify lint + types
