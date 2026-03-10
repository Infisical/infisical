# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Infisical is an open-source secret management platform. The repository is a monorepo with:
- `backend/` — Node.js/Fastify API server (TypeScript)
- `frontend/` — React web UI (TypeScript, Vite, TanStack Router)

Enterprise features live under `backend/src/ee/` and `frontend/src/ee/`.

## Commands

### Full Dev Environment (Docker)
```bash
make up-dev              # Start full dev stack (PostgreSQL, Redis, backend, frontend)
make down                # Stop all containers
```

### Backend (`cd backend`)
```bash
npm run dev              # Start dev server with watch mode
npm run build            # Build with tsup
npm run lint             # ESLint (max-warnings 0)
npm run lint:fix         # ESLint with auto-fix
npm run type:check       # TypeScript check
npm run test:unit        # Run unit tests
npm run test:e2e         # Run E2E tests
npm run test:unit -- path/to/file.test.ts  # Run a single test file
```

### Frontend (`cd frontend`)
```bash
npm run dev              # Start Vite dev server
npm run build            # Type check + Vite build
npm run lint             # ESLint
npm run type:check       # TypeScript check
```

### Both at Once
```bash
make reviewable          # lint:fix + type:check on both frontend and backend
```

### Database Migrations (`cd backend`)
```bash
npm run migration:new -- <name>   # Create a new migration
npm run migration:latest          # Run pending migrations
npm run migration:rollback        # Rollback last migration
npm run migration:status          # Show migration status
npm run db:reset                  # Rollback all + re-run (dev only)
```

### Code Generation (`cd backend`)
```bash
npm run generate:component   # Scaffold a new service module
npm run generate:schema      # Regenerate TypeScript types from DB schemas
```

## Architecture

### Backend Service Pattern

Every feature follows the same layered pattern:

1. **Schema** (`db/schemas/`) — Zod schema auto-generated from the DB table, defines the entity shape.
2. **DAL** (`*-dal.ts`) — Data Access Layer wrapping Knex queries. Built with `ormify()` helper for standard CRUD, extended with custom queries.
3. **Service** (`*-service.ts`) — Business logic. Exported as a factory function taking DALs and other services as dependencies.
4. **Router** (`*-router.ts`) — Fastify route definitions. Validates input with Zod, calls the service, returns the response.
5. **Types** (`*-types.ts`) — DTOs (input/output shapes) and shared TypeScript types for the module.

Example dependency injection pattern:
```typescript
// service factory accepts typed deps and returns the service methods
export const myServiceFactory = ({ myDAL, permissionService, kmsService }: TMyServiceFactoryDep) => {
  const doThing = async (dto: TDoThingDTO, actor: OrgServiceActor) => { /* ... */ };
  return { doThing };
};
export type TMyService = ReturnType<typeof myServiceFactory>;
```

Services are wired together in `backend/src/main.ts`.

### Permissions (CASL-based RBAC)

Use `permissionService.getProjectPermission()` or `getOrgPermission()`, then assert with:
```typescript
ForbiddenError.from(permission).throwUnlessCan(
  ProjectPermissionActions.Create,
  ProjectPermissionSub.SomeResource
);
```

Permission subjects and actions are defined in `backend/src/ee/services/permission/`.

### Database

- **ORM:** Knex with raw SQL for complex queries.
- **Schema types** are generated from `db/schemas/` — do not edit those files manually; run `npm run generate:schema` after a migration.
- **Migrations** live in `backend/src/db/migrations/` and run against both the main DB and (optionally) an audit log DB.
- Tables use `snake_case`; TypeScript types use `camelCase` (conversion handled by Knex).

### API Routes

- Routes are versioned: `v1`, `v2`, `v3`, `v4` under `backend/src/server/routes/`.
- EE routes are under `backend/src/ee/routes/`.
- All route schemas use Zod via the `fastify-zod` plugin.
- The root route registrar is `backend/src/server/routes/index.ts`.

### Frontend Architecture

- **Routing:** TanStack Router with file-based routing. `routeTree.gen.ts` is auto-generated — do not edit manually.
- **Server state:** TanStack Query (React Query) for API calls and caching.
- **Global state:** React Context (`UserContext`, `OrgContext`, `ProjectContext`) + Zustand for lightweight client state.
- **Forms:** React Hook Form + Zod for validation.
- **UI components:** Radix UI (headless) + TailwindCSS 4. Shared components live in `frontend/src/components/`.

### Path Aliases

- Backend: `@app/*` maps to `backend/src/*`
- Frontend: `@` maps to `frontend/src/`

## Key Conventions

- **DTOs** are `Pick<>` or `Partial<Pick<>>` of entity types, not inline `{ field: type }` objects.
- **Errors** — use custom error classes from `backend/src/lib/errors.ts` (e.g., `NotFoundError`, `BadRequestError`). Route-level error handling is in `backend/src/server/plugins/error-handler.ts`.
- **Env config** — all environment variables are accessed through typed config from `backend/src/lib/config/env.ts`, never `process.env` directly.
- **Logging** — use the Pino logger injected via Fastify's `request.log` or the app-level logger, not `console.log`.
- **Encryption** — sensitive fields at rest use the KMS service (`backend/src/services/kms/`). Secrets are encrypted before DB insert.
