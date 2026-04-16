# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the **frontend** package of the Infisical monorepo — a React 18 SPA built with Vite 6, TanStack Router, React Query, and Tailwind CSS v4.

## Essential Commands

All commands run from the `frontend/` directory:

- `npm run dev` — start dev server on port 3000
- `npm run build` — TypeScript check + Vite production build
- `npm run lint:fix` — ESLint autofix (double quotes, simple-import-sort with 7 groups)
- `npm run type:check` — TypeScript type check only (`tsconfig.app.json`)
- `make reviewable-ui` (from repo root) — runs `lint:fix` + `type:check` (run before PRs)
- `npm run storybook` — Storybook on port 6006

Path alias: `@app/*` maps to `./src/*`.

## Architecture Overview

### Routing (TanStack Router v1)

Virtual file routes defined in `src/routes.ts` using a functional DSL (`route()`, `index()`, `layout()`, `middleware()`). The generated route tree is in `src/routeTree.gen.ts` (do not edit manually — regenerated on dev server start or when `src/routes.ts` changes).

Each page directory has a `route.tsx` that defines its route:
```tsx
createFileRoute(path)({ component, validateSearch: zodValidator(schema), beforeLoad })
```

Route middleware chain: root → `authenticate` → `inject-org-details` → org-layout → product-specific layouts (secret-manager-layout, cert-manager-layout, kms-layout, ssh-layout, etc.).

Middleware pages in `src/pages/middlewares/`: `authenticate.tsx` (auth guard + redirect), `inject-org-details.tsx` (org context), `restrict-login-signup.tsx` (prevents auth pages when logged in).

### Pages / Views / Components Hierarchy

- **`src/pages/`** — Route-level components organized by product feature (secret-manager, cert-manager, kms, ssh, pam, organization, project, admin, auth, ai). Each has `route.tsx` + page component + local `components/`.
- **`src/views/`** — Reusable page-level UI composed into multiple pages. Pages import views with configuration props.
- **`src/components/v3/`** — Latest shared UI component library (preferred). Contains `generic/` (Accordion, Alert, Button, Dialog, Select, Table, etc.) and `platform/` (domain-specific components). **Always use v3 components for new code.** Only use v2 components when a v3 equivalent does not exist.
- **`src/components/v2/`** — Legacy shared UI components built on Radix UI primitives + Tailwind. Uses `cva` (class-variance-authority) for variants and `tailwind-merge` for class conflict resolution. Being superseded by v3 — do not use for new features if a v3 alternative exists.

### API Layer (React Query + Axios)

Each API domain in `src/hooks/api/` (100+ domain folders) follows this structure:
- **`queries.tsx`** — Query key factory pattern: keys return `[{ params }, "domain-label"]`. Export named query hooks (`useGetSecrets`, etc.) and raw fetch functions.
- **`mutations.tsx`** — `useMutation` hooks that invalidate relevant query keys on success via `queryClient.invalidateQueries()`.
- **`types.tsx`** — Request/response DTOs.

HTTP client in `src/config/request.ts`: Axios instance with automatic token injection and 401/403 interceptors.

### State Management

- **Server state**: TanStack React Query (query key factories in each API domain)
- **Global app state**: React Context providers in `src/context/` — User, Organization, Project, OrgPermission, ProjectPermission, ServerConfig, Subscription
- **Local component state**: Zustand stores

### Permissions

CASL-based (`@casl/ability`). Contexts: `OrgPermissionContext` and `ProjectPermissionContext` in `src/context/`. Access via `useOrgPermission()` / `useProjectPermission()` hooks. HOC gates: `src/hoc/withPermission/` and `withProjectPermission/`.

### Styling

Tailwind CSS v4 with PostCSS. Dark theme configured via CSS custom properties in `src/index.css` (@theme directive). Custom breakpoint `dashboard: 1100px`. Font: Inter. Color palette: primary (blue), mineshaft (dark gray), bunker (darker bg), success/warning/danger/info.

### Layouts

13 layout components in `src/layouts/` — `AdminLayout`, `OrganizationLayout`, `SecretManagerLayout`, `CertManagerLayout`, `KmsLayout`, `SshLayout`, `PamLayout`, etc. Layouts handle sidebar navigation and page chrome for their product area.

## Conventions

- ESLint flat config (ESLint 9+) with airbnb-typescript + prettier. Double quotes enforced.
- Import ordering via `simple-import-sort`: node builtins → react/external packages → `@app/` → internal → relative → styles.
- Forms use `react-hook-form` with `@hookform/resolvers` (Zod schemas).
- Search params validated with `zodValidator()` from `@tanstack/zod-adapter`.
