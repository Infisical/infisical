# Local Development & Testing

## Running Infisical Locally

Use `make up-dev` (or `docker compose -f docker-compose.dev.yml up --build -d`) to spin up the full stack on `localhost:8080`.

### Known Gotchas

1. **FIPS Dockerfile may not work for local dev**: `docker-compose.dev.yml` defaults to `Dockerfile.dev.fips` which builds a FIPS-compliant OpenSSL. This can cause `PBKDF2/SASL` authentication failures when connecting to the local PostgreSQL container. If you see errors like `OperationError: The operation failed for an operation-specific reason: Deriving bits failed` in the backend logs, switch to the non-FIPS Dockerfile:
   ```bash
   # In docker-compose.dev.yml, change:
   #   dockerfile: Dockerfile.dev.fips
   # to:
   #   dockerfile: Dockerfile.dev
   ```
   Then rebuild: `docker compose -f docker-compose.dev.yml up --build backend -d`

2. **ENCRYPTION_KEY format**: The `.env` file needs `ENCRYPTION_KEY` as a 32-character hex string (e.g., `f13dbc92aaaf86fa7cb0ed8ac3265f47`). If it's in base64 format, the backend will crash with `RangeError: Invalid key length`. Check `.env.example` for the correct format.

3. **Migration lock stuck**: If the backend crashes during startup, the migration lock table (`infisical_migrations_lock`) may remain locked. Symptoms: `MigrationLocked: Migration table is already locked`. Fix:
   ```bash
   docker compose -f docker-compose.dev.yml exec db psql -U infisical -d infisical \
     -c "UPDATE infisical_migrations_lock SET is_locked = 0;"
   docker compose -f docker-compose.dev.yml restart backend
   ```
   If all else fails, nuke volumes and start fresh: `docker compose -f docker-compose.dev.yml down -v` then `up --build -d`.

4. **Build time**: The backend Docker image takes 7-15 minutes to build from scratch (compiles OpenSSL and SoftHSM from source). Subsequent builds use cache and are much faster.

### First-Time Setup

After `make up-dev`, the app redirects to `/admin/signup` to create the first Super Admin account. Use any email/password — SMTP is not required for local dev (emails go to MailHog at `localhost:8025`).

## Testing Frontend Changes

- The frontend runs on Vite inside Docker with hot reload. Changes to `frontend/src/` are reflected automatically.
- The Navbar is in `frontend/src/layouts/OrganizationLayout/components/NavBar/`.
- After creating the admin account, navigate to an organization page to see the full Navbar with all buttons.

## Lint & Type Check

```bash
cd backend && npm run type:check
cd frontend && npm run type:check
```

Or use `make reviewable-api` / `make reviewable-ui` for lint:fix + type:check.

## Services & Ports

| Service | Port |
|---------|------|
| App (via Nginx) | 8080 |
| Backend API | 4000 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| MailHog (SMTP UI) | 8025 |
| ClickHouse | 8123 |
| Redis Commander | 8085 |
| pgAdmin | 5050 |
