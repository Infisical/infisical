---
name: testing-secrets-ui
description: Test the Infisical secrets management UI end-to-end. Use when verifying secret CRUD operations, URL encoding fixes, or frontend API layer changes.
---

# Testing Secrets Management UI

## Prerequisites

- Docker and Docker Compose installed
- The repo cloned locally

## Setting Up Local Dev Environment

1. Start the full stack:
   ```bash
   make up-dev
   ```
   This runs `docker-compose.dev.yml` which starts PostgreSQL, Redis, backend (Fastify), frontend (React/Vite), and Nginx.

2. Wait for all containers to be healthy. The app runs on `http://localhost:8080`.

3. **Common issue: Migration lock**
   If the backend fails to start with "Migration table is already locked", unlock it:
   ```bash
   docker exec -i infisical-dev-db psql -U infisical -d infisical -c "UPDATE infisical_migrations_lock SET is_locked = 0;"
   docker exec -i infisical-dev-db psql -U infisical -d infisical -c "UPDATE infisical_migrations_startup_lock SET is_locked = 0;"
   docker restart infisical-dev-api
   ```
   Wait ~15 seconds for migrations to complete.

4. Create a test account at `http://localhost:8080/signup` (local dev has no email verification).

5. Create a test organization and project after signup.

## Testing Secret CRUD Operations

### Create Secret
- Navigate to a project's Secret Dashboard (Project Overview page)
- Click "+ Add Secret" to open the Create Secret modal
- Fill in Environment (defaults to Development), Key, and Value
- Click "Create Secret"
- The modal uses the `createSecret` function from `frontend/src/hooks/api/secrets/mutations.tsx`

### Update Secret (Inline Edit)
- On the dashboard, click the secret's key field to edit it inline
- Change the key or value
- Click the save icon (floppy disk) that appears
- This uses the `useUpdateSecretV3` mutation from `mutations.tsx`

### Testing URL Encoding
When testing that special characters in secret keys are handled correctly:
- Try creating/updating secrets with `/`, `%`, `#`, `?`, `&` in the key name
- Verify the browser network tab shows the key is URL-encoded (e.g., `/` becomes `%2F`)
- Check backend logs: `docker logs infisical-dev-api 2>&1 | grep "secret"` to confirm the encoded URL
- The error should be a "Validation Error" (Fastify param validation), NOT "Route not found"

## Key Files

- `frontend/src/hooks/api/secrets/mutations.tsx` — Secret create/update/delete mutations
- `frontend/src/hooks/api/secrets/queries.tsx` — Secret query hooks
- Backend logs: `docker logs infisical-dev-api`
- Database: `docker exec -it infisical-dev-db psql -U infisical -d infisical`

## Devin Secrets Needed

No external secrets are required for local dev testing. The local environment uses:
- Database: PostgreSQL with user `infisical` (configured in docker-compose.dev.yml)
- All services run locally via Docker
