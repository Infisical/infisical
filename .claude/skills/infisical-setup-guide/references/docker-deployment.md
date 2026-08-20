# Docker Deployment Guide

Guide the user through self-hosting Infisical with Docker. There are two main approaches — help the user pick the right one.

## Choosing a deployment method

| Method | Best for | What's included |
|--------|----------|----------------|
| **Docker Compose** (`docker-compose.prod.yml`) | Trying out Infisical, small teams, dev/staging environments | Backend + PostgreSQL + Redis, all in one compose file |
| **Standalone Docker** (`Dockerfile.standalone-infisical`) | Production deployments with managed databases | Just the Infisical app — you provide external PostgreSQL + Redis |

**Rule of thumb**: If the user wants to get started quickly or doesn't have existing database infrastructure, recommend Docker Compose. If they're deploying to production with cloud-managed databases (RDS, ElastiCache, etc.), recommend standalone.

---

## Option A: Docker Compose deployment

### Prerequisites

- Docker 20.10+ and Docker Compose 2.0+
- Minimum 2 CPU cores, 4GB RAM, 20GB disk (recommended: 4 cores, 8GB RAM, 50GB+ SSD)

### Steps

#### 1. Download the compose file

```bash
curl -o docker-compose.prod.yml https://raw.githubusercontent.com/Infisical/infisical/main/docker-compose.prod.yml
```

Or if the user has the repo cloned, it's already at the root: `docker-compose.prod.yml`.

#### 2. Create the environment file

```bash
# Download the template
curl -o .env https://raw.githubusercontent.com/Infisical/infisical/main/.env.example
```

Then edit `.env` and set these **required** variables:

**Important**: The user must generate `ENCRYPTION_KEY` and `AUTH_SECRET` themselves (e.g. by running the commands below in their own terminal). Do not generate these values on the user's behalf — they are sensitive cryptographic secrets that should never appear in logs, chat history, or version control. Guide the user to run the commands, but let them handle the output.

| Variable | How to generate | Notes |
|----------|----------------|-------|
| `ENCRYPTION_KEY` | `openssl rand -hex 16` | 32-char hex string. **Save this — you need it to decrypt secrets.** |
| `AUTH_SECRET` | `openssl rand -base64 32` | JWT signing secret |
| `POSTGRES_PASSWORD` | Choose a strong password | Used by the bundled PostgreSQL |
| `DB_CONNECTION_URI` | `postgres://infisical:<password>@db:5432/infisical` | Must match POSTGRES_PASSWORD |
| `REDIS_URL` | `redis://redis:6379` | Default for bundled Redis |
| `SITE_URL` | `https://your-domain.com` | The URL users will access |

#### 3. Start the stack

```bash
docker compose -f docker-compose.prod.yml up -d
```

This starts three containers:

- **Backend** (port 80 → internal 8080) — the Infisical application
- **PostgreSQL** — persistent data (volume: `pg_data`)
- **Redis** — caching and job queues (volume: `redis_data`)

#### 4. Verify it's running

```bash
docker compose -f docker-compose.prod.yml ps
curl http://localhost/api/status
```

Open `http://localhost` (or your SITE_URL) to create the initial admin account.

### Production hardening

- **HTTPS**: Put an Nginx reverse proxy with Let's Encrypt in front, or use a cloud load balancer
- **Firewall**: Only expose ports 80/443. Keep PostgreSQL (5432) and Redis (6379) internal
- **Backups**: `docker exec <postgres-container> pg_dump -U infisical infisical > backup.sql`
- **SMTP**: Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM_ADDRESS`, `SMTP_FROM_NAME` for email invitations and password resets
- **Monitoring**: Enable OpenTelemetry with `OTEL_TELEMETRY_COLLECTION_ENABLED=true`
- **Never delete `pg_data` volume** — it contains all your encrypted secrets

### Upgrading

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

The backend runs database migrations automatically on startup.

---

## Option B: Standalone Docker image

### When to use this

The standalone image (`infisical/infisical`) contains only the application code. You provide your own PostgreSQL and Redis. This is the right choice when:

- You have managed databases (AWS RDS, GCP Cloud SQL, Azure Database)
- You need horizontal scaling (multiple app containers behind a load balancer)
- You're deploying to Kubernetes, ECS, Cloud Run, or similar orchestrators

### Steps

#### 1. Pull the image

```bash
docker pull infisical/infisical:latest
```

For FIPS 140-2 compliance, pull the FIPS image instead:

```bash
docker pull infisical/infisical-fips:latest
```

#### 2. Set required environment variables

**Standard (non-FIPS) deployment:**

| Variable | Purpose |
|----------|---------|
| `ENCRYPTION_KEY` | 32-char hex string — user runs `openssl rand -hex 16` in their terminal |
| `AUTH_SECRET` | JWT signing secret — user runs `openssl rand -base64 32` in their terminal |

**FIPS deployment:** `ENCRYPTION_KEY` must be a base64-encoded 256-bit key instead of hex. The user should run `openssl rand -base64 32` to generate it.
| `DB_CONNECTION_URI` | PostgreSQL connection string to your external database |
| `REDIS_URL` | Redis connection string to your external Redis |
| `SITE_URL` | Public URL where Infisical will be accessed |

#### 3. Run the container

```bash
docker run -d \
  --name infisical \
  -p 80:8080 \
  -e ENCRYPTION_KEY=<your-key> \
  -e AUTH_SECRET=<your-secret> \
  -e DB_CONNECTION_URI=postgres://user:pass@your-db:5432/infisical \
  -e REDIS_URL=redis://your-redis:6379 \
  -e SITE_URL=https://your-domain.com \
  infisical/infisical:latest
```

#### 4. Verify

```bash
curl http://localhost/api/status
```

### What's inside the standalone image

The image is a multi-stage build that bundles:

- Frontend (Vite production build, served statically)
- Backend (Node.js 20 Fastify server)
- Database drivers: Oracle Instant Client, FreeTDS (MSSQL), ODBC
- SMB client (for Windows file share integrations)
- Infisical CLI (for internal operations)
- Runs as non-root user (UID 1001) for security

### Scaling

To run multiple instances, make sure all instances share the same `ENCRYPTION_KEY` and `AUTH_SECRET`, and point to the same PostgreSQL and Redis. Use a load balancer in front.

---

## Key repo paths

- `docker-compose.prod.yml` — production compose file
- `docker-compose.dev.yml` — development compose file (not for production)
- `Dockerfile.standalone-infisical` — standalone image build
- `Dockerfile.fips.standalone-infisical` — FIPS-compliant variant
- `.env.example` — environment variable template
- `docs/self-hosting/` — detailed self-hosting documentation
- `docs/self-hosting/configuration/envars.mdx` — full environment variable reference
