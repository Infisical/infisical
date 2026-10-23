# OpenAPI spec

The OpenAPI spec is built from the route schemas by a generator, never by the server
while it handles requests. Building it on request blocked a production event loop for
about 20 seconds per task, because the YAML alone is 30MB.

## Two specs

| | Public spec | Full spec |
|---|---|---|
| Contents | Routes with `hide: false`, hidden fields removed | Every route and every field |
| Read by | Customers, the docs site, the breaking-change check | The Go suite in `tests/`, to generate its client |
| Served by | A built image | A server running from source |

## How the files are built

`generate-openapi.ts --out <dir>` registers every API route on a bare Fastify instance
(`build-openapi-spec.ts`), then writes Brotli and gzip copies of the JSON, the YAML and
one JSON file per `ApiDocsTags` value, plus `manifest.json` (`build-openapi-artifacts.ts`).
`npm run build` runs it into `dist/openapi`, so every image carries the public spec. CI
runs it from source (`npm run generate:openapi`).

## How the files are served

`openapi-plugin.ts` streams the files, picking Brotli, then gzip, then decompressing gzip
on the fly for clients that accept neither. A `?tag=` that is not an `ApiDocsTags` slug is
answered with a 400. `registerOpenApiDocs` decides at boot where the files come from:

- `dist/openapi/manifest.json` exists: serve it.
- No files and `NODE_ENV` is not `production` (running from source): `@fastify/swagger`
  records this server's own routes with the full-spec transform, and the first request
  for each file builds it in memory with the same code the generator uses. This is how
  the dev stack serves the full spec, and how `make generate-client` in `tests/` gets it.
- No files and `NODE_ENV` is `production`: refuse to boot. `NODE_ENV` defaults to `production`, so `npm run dev` on the host needs `NODE_ENV=development`. The generator also fails when `INFISICAL_RUN_MODES` lacks `api`, since the spec would hold only `/api/status`.

## Invariants

- Every API route is registered through `server/routes/register-api-routes.ts`. A route
  registered anywhere else is missing from the image's spec, even though dev docs show it.
- Registering a router must not touch `server.services`, the database or Redis. The
  generator registers routers with stub services and no connections.
- A running server never registers the API routes a second time. Some routers keep state
  at module level (eg the passport strategies in `sso-router.ts`), and a second
  registration rebinds it. Only the generator, in its own process, calls
  `buildOpenApiSpec`.
- A production server never builds the spec. It serves files or refuses to boot.
