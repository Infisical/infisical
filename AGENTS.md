## Cursor Cloud specific instructions

### Overview

Infisical is an open-source secret management platform (monorepo). Key services:

| Component | Tech | Port |
|-----------|------|------|
| Backend | Fastify/Node.js 20 (TypeScript) | 4000 |
| Frontend | React/Vite (TypeScript) | 3000 (proxied via nginx) |
| PostgreSQL 14 | Database | 5432 |
| Redis | Cache/Queue | 6379 |
| Nginx | Reverse proxy | 8080 (main entry) |

### Running the dev environment

The standard dev flow uses Docker Compose. See `Makefile` targets and `docker-compose.dev.yml`.

**Critical: FIPS Dockerfile incompatibility.** The `docker-compose.dev.yml` references `Dockerfile.dev.fips` for the backend, which builds OpenSSL with FIPS support. This causes a `CSPRNG` assertion crash in the Cursor Cloud (nested Docker/Firecracker) environment. To work around this, temporarily change `dockerfile: Dockerfile.dev.fips` to `dockerfile: Dockerfile.dev` in `docker-compose.dev.yml` before running `make up-dev`. Revert before committing.

**Critical: ENCRYPTION_KEY format.** The `.env.dev.example` uses a base64-encoded `ENCRYPTION_KEY` (`VVHnGZ0w98WLgISK4XSJcagezuG6EWRFTk48KE4Y5Mw=`). The backend treats `ENCRYPTION_KEY` as raw UTF-8 (44 bytes), but AES-256-GCM requires exactly 32 bytes. Use a 32-character hex string instead (e.g., `ENCRYPTION_KEY=f13dbc92aaaf86fa7cb0ed8ac3265f47`). Alternatively, use `ROOT_ENCRYPTION_KEY` (which is decoded from base64).

### Starting services

```bash
# 1. Copy env and fix ENCRYPTION_KEY
cp .env.dev.example .env
# Edit .env: change ENCRYPTION_KEY to a 32-char string (see above)

# 2. Temporarily switch backend Dockerfile (Cursor Cloud only)
# In docker-compose.dev.yml, change Dockerfile.dev.fips -> Dockerfile.dev

# 3. Start all services
make up-dev
# Or: docker compose -f docker-compose.dev.yml up --build

# 4. Access at http://localhost:8080
# Admin signup: http://localhost:8080/admin/signup
```

### Lint and test commands

- **Backend lint:** `cd backend && npm run lint`
- **Frontend lint:** `cd frontend && npm run lint`
- **Backend type check:** `cd backend && npm run type:check`
- **Frontend type check:** `cd frontend && npm run type:check`
- **Backend unit tests:** `cd backend && npm run test:unit`
- **Backend e2e tests:** `cd backend && npm run test:e2e` (requires test DB)
- **Make targets:** `make reviewable-api`, `make reviewable-ui`, `make reviewable` (lint + type check)

### Package manager

Uses **npm** with lockfiles at root, `backend/`, and `frontend/`. Node.js 20 is required (matches Dockerfiles).

### Important notes

- Backend build takes 5-10 minutes on first Docker build due to SoftHSM2, Oracle Instant Client, and other native dependencies.
- The backend ESLint is configured with `--max-old-space-size=8192` and can take 3-4 minutes to complete.
- The `.env` file must be at the repo root. Docker Compose reads it via `env_file: .env`. For native dev, symlink it to `backend/.env` and `frontend/.env`.
- The pre-commit hook (`husky`) runs `infisical scan` which requires the Infisical CLI. This is optional for development.
