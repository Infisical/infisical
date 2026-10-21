# Backend testing

Paths are relative to `backend/`. Read [`backend/AGENTS.md`](../AGENTS.md) and [`backend/CODE_QUALITY.md`](../CODE_QUALITY.md) first.

## Testing

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

### Writing e2e tests with `testUtils`

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

### Faking a third-party provider

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

### FIPS test image and the prebuilt toolchain

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
