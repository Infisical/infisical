# FIPS test image and the prebuilt toolchain

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

## Building the dev stack without GHCR

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
