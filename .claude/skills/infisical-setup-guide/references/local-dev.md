# Local Development Setup

Guide the user through running Infisical from source for local development and contribution.

## Prerequisites

- Docker and Docker Compose (required for databases and supporting services)
- Node.js (the project uses Node 20)
- Git (to clone the repo)

## Steps

### 1. Clone the repository

```bash
git clone https://github.com/Infisical/infisical.git
cd infisical
```

### 2. Set up environment variables

Copy the dev example env file:

```bash
cp .env.dev.example .env
```

The `.env.dev.example` file includes sensible defaults for local dev (including a FIPS-compatible base64 encryption key). These defaults are fine for local development only — never use them in production or any internet-accessible deployment. The critical variables are:

| Variable | Purpose | Default value |
|----------|---------|---------------|
| `ENCRYPTION_KEY` | Base64-encoded 256-bit key for encrypting/decrypting secrets | `VVHnGZ0w98WLgISK4XSJcagezuG6EWRFTk48KE4Y5Mw=` |
| `AUTH_SECRET` | Base64-encoded JWT signing secret | `5lrMXKKWCVocS/uerPsl7V+TX/aaUaI7iDkgl3tSmLE=` |
| `DB_CONNECTION_URI` | PostgreSQL connection string | `postgres://infisical:infisical@db:5432/infisical` |
| `REDIS_URL` | Redis connection string | `redis://redis:6379` |
| `SITE_URL` | Base URL of the application | `http://localhost:8080` |

The defaults work out of the box for local dev — no changes needed unless you want OAuth login or SMTP.

### 3. Start all services

```bash
docker compose -f docker-compose.dev.yml up --build --force-recreate
```

This spins up:

- **Nginx** (port 8080) — reverse proxy, the main entry point
- **PostgreSQL** (port 5432) — primary database
- **Redis** (port 6379) — caching and BullMQ job queues
- **ClickHouse** (port 8123) — audit log storage
- **Backend API** (port 4000) — Fastify server with live reload
- **Frontend** — React dev server with hot module replacement
- **MailHog** (port 8025 UI, port 1025 SMTP) — email testing
- **PgAdmin** (port 5050) — database management UI
- **Redis Commander** (port 8085) — Redis debugging UI

### 4. Access the application

Once all services are running, open **http://localhost:8080** in your browser. You'll be prompted to create an initial admin account.

### Optional services

The dev compose file includes optional services you can uncomment:

- **OpenLDAP + phpLdapAdmin** (ports 389, 636, 6433) — for testing LDAP authentication
- **Keycloak** (port 8088) — for testing OIDC/SAML SSO flows
- **Prometheus + Grafana** (ports 9090, 3005) — metrics and monitoring
- **OpenTelemetry Collector** — distributed tracing

### Optional: OAuth login for dev

To enable GitHub/Google/GitLab login locally, set these in `.env`:

```
CLIENT_ID_GITHUB_LOGIN=<your-github-oauth-app-client-id>
CLIENT_SECRET_GITHUB_LOGIN=<your-github-oauth-app-client-secret>
CLIENT_ID_GOOGLE_LOGIN=<your-google-oauth-client-id>
CLIENT_SECRET_GOOGLE_LOGIN=<your-google-oauth-client-secret>
```

## Useful dev commands

| Command | Purpose |
|---------|---------|
| `make reviewable-api` | Lint + type-check the backend (run before PRs) |
| `make reviewable-ui` | Lint + type-check the frontend (run before PRs) |
| `cd backend && npm run migration:new` | Create a new database migration |
| `cd backend && npm run generate:schema` | Regenerate Zod types from DB schema |

## Common issues

- **Port conflicts**: If port 8080 is taken, the Nginx proxy won't start. Check with `lsof -i :8080`.
- **Docker memory**: The full dev stack uses ~4GB RAM. Increase Docker Desktop memory if services crash.
- **Database migrations**: If the backend fails to start with DB errors, try `docker compose -f docker-compose.dev.yml down -v` to wipe volumes and start fresh.
- **Frontend not loading**: The frontend dev server takes a moment to compile. Wait for the Vite "ready" message in logs before refreshing.

## Key repo paths

- `docker-compose.dev.yml` — dev orchestration file
- `.env.example` — environment variable template
- `backend/` — Fastify API server (see `backend/CLAUDE.md`)
- `frontend/` — React SPA (see `frontend/CLAUDE.md`)
- `backend/src/db/migrations/` — database migration files
