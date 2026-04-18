# Infisical Local Development Setup Guide for Mac

This guide walks you through setting up the Infisical monorepo for local development on macOS.

## Prerequisites

Before you begin, ensure you have the following installed on your Mac:

- **Git** — for cloning the repository ([download](https://git-scm.com/downloads))
- **Docker** — for running containerized services ([Docker Desktop for Mac](https://www.docker.com/products/docker-desktop))
- **Node.js** — version with npm >=11.10.0 (manage with nvm or brew)
- **Make** — typically pre-installed on macOS; verify with `make --version`

Estimated time to complete: **15-20 minutes**

## Step 1: Clone the Repository

```bash
git clone https://github.com/Infisical/infisical.git
cd infisical
```

## Step 2: Set Up Environment Variables

The repo includes example environment files. Copy the development example to `.env`:

```bash
cp .env.dev.example .env
```

The `.env` file includes default sample values for local development:
- **ENCRYPTION_KEY** — sample encryption key (safe for dev only)
- **AUTH_SECRET** — sample JWT signing key (safe for dev only)
- **Database credentials** — default user/password for PostgreSQL
- **SITE_URL** — set to `http://localhost:8080` for local Docker setup
- **Redis URL** — configured to use the Docker Redis service

**Note:** For development with Docker Compose, you don't need to modify the `.env` file unless you want to customize database credentials or enable specific integrations (GitHub OAuth, LDAP, SSO, etc.).

## Step 3: Start the Full Stack with Docker Compose

The easiest way to get running is to use Docker Compose, which starts all services (PostgreSQL, Redis, ClickHouse, Backend, Frontend, Nginx):

```bash
make up-dev
```

This command:
- Builds and starts the backend (Fastify API server)
- Builds and starts the frontend (React SPA)
- Spins up PostgreSQL 14, Redis, and ClickHouse
- Runs Nginx as a reverse proxy
- Automatically runs database migrations

**First time setup note:** The initial build may take 5-10 minutes as Docker pulls images and installs dependencies.

### Wait for Services to Be Ready

Once the containers are running, monitor the logs to ensure everything is healthy:
- Watch for `backend` to log that it's listening on port 4000
- Watch for `frontend` to indicate the Vite dev server is running
- Once both are ready, proceed to the next step

### Access Infisical

Open your browser and navigate to:

```
http://localhost:8080
```

You should see the Infisical login page. Create a new account to get started.

## Alternative: Hybrid Local + Docker Approach (Advanced)

If you prefer to run the backend and frontend locally (with faster reload times) while keeping services in Docker, you'll need to run them separately:

### Terminal 1: Start Services Only

```bash
docker compose -f docker-compose.dev.yml up db redis clickhouse nginx -d
```

This starts only the infrastructure services, leaving ports for local backend/frontend development.

### Terminal 2: Backend Development

Navigate to the backend directory and start the dev server:

```bash
cd backend
npm install
npm run dev
```

The backend dev server:
- Watches for TypeScript changes
- Rebuilds and restarts automatically
- Runs on `http://localhost:4000`
- Outputs formatted logs via pino-pretty

### Terminal 3: Frontend Development

Navigate to the frontend directory and start the dev server:

```bash
cd frontend
npm install
npm run dev
```

The frontend dev server:
- Runs Vite on port 3000
- Provides hot module reloading (HMR)
- Auto-rebuilds on file changes

### Access the Application

With the hybrid setup, Nginx still proxies requests to both servers at `http://localhost:8080`.

## Repository Structure

```
infisical/
├── backend/                    # Fastify 4 API (TypeScript, PostgreSQL, BullMQ)
│   ├── src/
│   ├── package.json
│   ├── CLAUDE.md              # Backend developer guide
│   └── Dockerfile.dev.fips
├── frontend/                   # React 18 SPA (Vite, TanStack Router, Tailwind CSS)
│   ├── src/
│   ├── package.json
│   ├── CLAUDE.md              # Frontend developer guide
│   └── Dockerfile.dev
├── docs/                       # Documentation site (Mintlify)
├── docker-compose.dev.yml      # Development services
├── docker-compose.prod.yml     # Production deployment
├── Makefile                    # Convenient make commands
├── CLAUDE.md                   # Root developer guide
└── .env.dev.example            # Sample development environment variables
```

## Essential Development Commands

Run these commands from the repository root unless noted otherwise.

### Build & Quality Checks (Before Submitting PRs)

```bash
# Check and fix frontend code
make reviewable-ui

# Check and fix backend code
make reviewable-api

# Check and fix both
make reviewable
```

These commands run linting and TypeScript type checking. Always run these before submitting pull requests.

### Backend Commands (from `backend/` directory)

```bash
# Start dev server with auto-reload
npm run dev

# Run unit tests
npm run test:unit

# Run end-to-end tests (requires running services)
npm run test:e2e

# Create a new database migration
npm run migration:new

# Run pending migrations
npm run migration:latest-dev

# Regenerate Zod types from the database
npm run generate:schema

# Lint and fix code
npm run lint:fix

# Type check (uses 8GB heap)
npm run type:check
```

### Frontend Commands (from `frontend/` directory)

```bash
# Start dev server
npm run dev

# Production build
npm run build

# Lint and fix code
npm run lint:fix

# Type check
npm run type:check

# Run Storybook (component library)
npm run storybook
```

### Docker Compose Commands (from repository root)

```bash
# Start development environment with auto-rebuild
make up-dev

# Stop and remove containers
make down

# Start with LDAP services (for LDAP testing)
make up-dev-ldap

# Start with metrics (Prometheus, Grafana, OpenTelemetry)
make up-dev-metrics

# Start with SSO (Keycloak for OAuth testing)
make up-dev-sso

# View logs
docker compose -f docker-compose.dev.yml logs -f

# View logs for specific service
docker compose -f docker-compose.dev.yml logs -f backend
```

## Database Access & Tools

The development environment includes several tools for managing your local instance:

### PgAdmin (PostgreSQL Management UI)

Access the database admin interface at `http://localhost:5050`

- **Email:** `admin@example.com`
- **Password:** `pass`
- The PostgreSQL service is already configured in the left sidebar

### Redis Commander (Redis Management UI)

Access the Redis admin interface at `http://localhost:8085`

- Browse keys, view data structures, and run Redis commands
- Useful for debugging queue jobs and caches

### MailHog (Local SMTP Server & Email Testing)

Access the email UI at `http://localhost:8025`

- Captures all emails sent during development
- View email content without actually sending
- Useful for testing email-based flows (password reset, invitations, etc.)

### ClickHouse (Analytics/Audit Log Storage)

- Native protocol: `localhost:9000`
- HTTP UI: `http://localhost:8123`
- **Username/Password:** `infisical` / `infisical`
- Used for storing audit logs in the application

## Troubleshooting

### Services Won't Start

**Issue:** Docker Compose fails with port conflicts or resource errors

**Solutions:**
- Ensure no other services are using ports 5432, 6379, 4000, 3000, or 8080
- Increase Docker's memory allocation in Docker Desktop settings (recommend 6GB+)
- Run `docker system prune` to free up space if disk is full
- Restart Docker Desktop completely

### Containers Crash Immediately

**Issue:** Backend or frontend containers exit right after starting

**Solutions:**
- Check logs: `docker compose -f docker-compose.dev.yml logs backend`
- Ensure `.env` file is correctly copied from `.env.dev.example`
- Verify all required environment variables are set (at minimum: `ENCRYPTION_KEY`, `AUTH_SECRET`, `DB_CONNECTION_URI`)
- The backend may take a moment to initialize; wait 30 seconds and check again

### Database Migration Errors

**Issue:** Migration fails when containers start

**Solutions:**
- Check PostgreSQL is fully ready: `docker compose -f docker-compose.dev.yml logs db`
- Manually run migrations:
  ```bash
  # Inside backend container
  npm run migration:latest-dev
  ```
- If corrupted, reset the database volume:
  ```bash
  docker volume rm infisical_postgres-data
  make down
  make up-dev
  ```

### Frontend Not Loading at localhost:8080

**Issue:** Nginx returns 502 or blank page

**Solutions:**
- Verify backend is running: `curl http://localhost:4000/api/v1/health` should return JSON
- Verify frontend is running: check `docker compose -f docker-compose.dev.yml logs frontend`
- Wait 30-60 seconds for services to fully initialize
- Refresh your browser with Cmd+Shift+R to clear cache

### Hybrid Setup — Backend Can't Connect to Database

**Issue:** Backend logs show connection timeout to PostgreSQL

**Solutions:**
- Ensure Docker Compose services are running: `docker compose -f docker-compose.dev.yml ps`
- Verify `DB_CONNECTION_URI` in `.env` uses the correct host. For local dev, it should be:
  - With Docker services: `postgres://infisical:infisical@localhost:5432/infisical`
  - Adjust the host if running in a Docker network
- Check the password matches what's in `.env`: default is `infisical`

## Key Architectural Patterns

### Backend (Fastify + TypeScript + PostgreSQL)

- **Service Factory Pattern:** No IoC container; manual dependency injection with explicit wiring in `src/server/routes/index.ts`
- **DAL Layer:** `*-dal.ts` files provide typed CRUD operations via `ormify()`
- **Auth Modes:** JWT (user sessions), IDENTITY_ACCESS_TOKEN (machine-to-machine), SCIM_TOKEN, MCP_JWT
- **Permissions:** CASL-based authorization with project and org-level rules
- **Queues:** BullMQ for async jobs (secret rotation, audit logs, integrations, etc.)
- **Path Alias:** `@app/*` maps to `./src/*`

For detailed backend architecture, see `backend/CLAUDE.md`

### Frontend (React 18 + Vite + TanStack Router)

- **Routing:** TanStack Router v1 with virtual file-based routes in `src/routes.ts`
- **State Management:** React Query for server state, React Context for global app state, Zustand for local state
- **API Layer:** Query key factories per domain in `src/hooks/api/*/`, Axios HTTP client with auth injection
- **Components:** v3 components (modern) in `src/components/v3/`, v2 legacy components being phased out
- **Styling:** Tailwind CSS v4 with dark theme support
- **Path Alias:** `@app/*` maps to `./src/*`

For detailed frontend architecture, see `frontend/CLAUDE.md`

## Next Steps

1. **Explore the codebase:**
   - Backend: Start with `backend/src/services/` to understand service patterns
   - Frontend: Start with `frontend/src/pages/` to understand page structure

2. **Read the architecture guides:**
   - `backend/CLAUDE.md` — comprehensive backend patterns and file organization
   - `frontend/CLAUDE.md` — comprehensive frontend patterns and components
   - `CLAUDE.md` — cross-cutting concerns and full-stack patterns

3. **Create your first feature:**
   - Follow the "Wiring a New Full-Stack Feature" checklist in the root `CLAUDE.md`
   - Start with a small feature to understand the patterns

4. **Run quality checks before pushing:**
   ```bash
   make reviewable
   ```

5. **Review the documentation site locally:**
   - Check `/infisical/docs/` for feature documentation
   - Reference API docs to understand available endpoints

## Getting Help

- **Slack Community:** Join the official Slack for questions: https://infisical.com/slack
- **GitHub Issues:** Report bugs or feature requests: https://github.com/Infisical/infisical/issues
- **Documentation:** Full docs available at https://infisical.com/docs
- **Contributing Guide:** https://infisical.com/docs/contributing/getting-started

## License

Infisical is released under the MIT License. Enterprise features in the `ee/` directory require a license.

Happy developing!
