# Local Development Setup Guide for Infisical on macOS

Great! You've cloned the Infisical repo. I'll walk you through getting it running for local development. Let's go step-by-step.

## Prerequisites Check

Before we start, make sure you have these installed:

1. **Docker and Docker Compose** — needed to run PostgreSQL, Redis, and other services
2. **Node.js 20** — the project requires Node 20
3. **Git** — already done since you cloned the repo

If you're missing any of these, install them first:
- Docker Desktop for Mac: https://www.docker.com/products/docker-desktop
- Node.js: https://nodejs.org/ (use a version manager like `nvm` or `asdf` if you prefer)

## Step 1: Set Up Environment Variables

In the repo root, copy the dev example environment file:

```bash
cp .env.dev.example .env
```

The `.env.dev.example` file includes sensible defaults for local development, including pre-configured:
- **ENCRYPTION_KEY** — Base64-encoded key for encrypting/decrypting secrets
- **AUTH_SECRET** — JWT signing secret
- **DB_CONNECTION_URI** — PostgreSQL connection string pointing to the dev database
- **REDIS_URL** — Redis connection string
- **SITE_URL** — set to `http://localhost:8080`

**Important:** These defaults are fine for local development only. Never use them in production.

## Step 2: Start All Services

From the repo root, run:

```bash
docker compose -f docker-compose.dev.yml up --build --force-recreate
```

This will spin up the entire dev stack:

- **Nginx** (http://localhost:8080) — main entry point
- **PostgreSQL** (port 5432) — primary database
- **Redis** (port 6379) — caching and job queues
- **ClickHouse** (port 8123) — audit log storage
- **Backend API** (port 4000) — Fastify server with live reload
- **Frontend** — React dev server with hot module replacement
- **MailHog** (http://localhost:8025) — email testing UI
- **PgAdmin** (http://localhost:5050) — database management
- **Redis Commander** (http://localhost:8085) — Redis debugging

On first run, this will take a few minutes to build all services. Watch the logs for any errors.

## Step 3: Access the Application

Once all services are running (watch the Nginx logs for "ready" and the frontend for "ready in Xms"), open your browser:

```
http://localhost:8080
```

You'll be prompted to create an initial admin account. Follow the signup flow to get started.

## Step 4: (Optional) Add OAuth Login for Development

If you want to test GitHub, Google, or GitLab login locally, add these to your `.env`:

```
CLIENT_ID_GITHUB_LOGIN=<your-github-oauth-app-client-id>
CLIENT_SECRET_GITHUB_LOGIN=<your-github-oauth-app-client-secret>
CLIENT_ID_GOOGLE_LOGIN=<your-google-oauth-client-id>
CLIENT_SECRET_GOOGLE_LOGIN=<your-google-oauth-client-secret>
CLIENT_ID_GITLAB_LOGIN=<your-gitlab-application-id>
CLIENT_SECRET_GITLAB_LOGIN=<your-gitlab-application-secret>
```

Restart the backend and frontend after adding these (or restart the whole stack with Ctrl+C and rerun the docker compose command).

## Useful Development Commands

Before submitting pull requests, run these to lint and type-check:

```bash
make reviewable-api      # Lint + type-check the backend
make reviewable-ui       # Lint + type-check the frontend
```

For database work:

```bash
cd backend && npm run migration:new         # Create a new migration
cd backend && npm run generate:schema       # Regenerate Zod types from DB
```

## Optional: Testing Services

The dev stack includes optional services for testing SSO, LDAP, and metrics. Start them with Docker Compose profiles:

```bash
# LDAP testing (OpenLDAP + phpLdapAdmin)
docker compose -f docker-compose.dev.yml --profile ldap up --build

# SSO testing (Keycloak)
docker compose -f docker-compose.dev.yml --profile sso up --build

# Metrics (Prometheus + Grafana)
docker compose -f docker-compose.dev.yml --profile metrics up --build

# Combine multiple profiles
docker compose -f docker-compose.dev.yml --profile ldap --profile sso up --build
```

## Troubleshooting Common Issues

**Port conflicts**: If port 8080 is already in use, you'll see an Nginx error. Check with:
```bash
lsof -i :8080
```
Kill the conflicting process or change Nginx's port in the compose file.

**Docker memory issues**: The full dev stack uses ~4GB RAM. If services are crashing, increase Docker Desktop's memory limit in Preferences → Resources → Memory.

**Database won't start**: If the backend fails with database errors, wipe and restart:
```bash
docker compose -f docker-compose.dev.yml down -v
docker compose -f docker-compose.dev.yml up --build --force-recreate
```

**Frontend not loading**: The Vite dev server takes a moment to compile. Wait for the "ready" message in the logs before refreshing the browser.

## Key Paths in the Repo

- `docker-compose.dev.yml` — dev orchestration configuration
- `.env.dev.example` — environment variable template
- `backend/` — Fastify API server (see `backend/CLAUDE.md` for architecture details)
- `frontend/` — React SPA (see `frontend/CLAUDE.md` for patterns)
- `backend/src/db/migrations/` — database migration files
- `CLAUDE.md` — root architecture documentation

## Next Steps

Once everything is running:

1. Create your first admin account via the signup prompt
2. Explore the UI and create a project to store secrets
3. Check out `backend/CLAUDE.md` and `frontend/CLAUDE.md` for code architecture
4. Start making changes — both the backend and frontend have live reload enabled, so your changes should reflect instantly

You're all set! If you hit any issues during setup, let me know and I can help troubleshoot.
