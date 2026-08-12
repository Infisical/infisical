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

Route middleware chain: root → `authenticate` → `inject-org-details` → org-layout → product-specific layouts (secret-manager-layout, cert-manager-layout, kms-layout, etc.).

Middleware pages in `src/pages/middlewares/`: `authenticate.tsx` (auth guard + redirect), `inject-org-details.tsx` (org context), `restrict-login-signup.tsx` (prevents auth pages when logged in).

### Pages / Views / Components Hierarchy

- **`src/pages/`** — Route-level components organized by product feature (secret-manager, cert-manager, kms, pam, secret-scanning, organization, project, admin, auth). Each has `route.tsx` + page component + local `components/`.
- **`src/views/`** — Reusable page-level UI composed into multiple pages. Pages import views with configuration props.
- **`src/components/v3/`** — Latest shared UI component library (preferred). Contains `generic/` (Accordion, Alert, Button, Dialog, Select, Table, etc.) and `platform/` (domain-specific components such as `PageHeader` and scope icons). **Always use v3 components for new code.** Only use v2 components when a v3 equivalent does not exist.
- **`src/components/v2/`** — Legacy shared UI components built on Radix UI primitives + Tailwind. Uses `cva` (class-variance-authority) for variants and `tailwind-merge` for class conflict resolution. Being superseded by v3 — do not use for new features if a v3 alternative exists.

### API Layer (React Query + Axios)

Each API domain in `src/hooks/api/` (100+ domain folders) follows this structure:
- **`queries.tsx`** — Query key factory pattern: keys return `[{ params }, "domain-label"]`. Export named query hooks (`useGetSecrets`, etc.) and raw fetch functions.
- **`mutations.tsx`** — `useMutation` hooks that invalidate relevant query keys on success via `queryClient.invalidateQueries()`.
- **`types.tsx`** — Request/response DTOs.

HTTP client in `src/config/request.ts`: Axios instance with automatic token injection and 401/403 interceptors.

#### React Query Global Defaults (`src/hooks/api/reactQuery.tsx`)

The `QueryClient` sets these global defaults for all queries:
- **`staleTime: 60_000`** (60 seconds) — data fetched within the last 60s is considered fresh and won't be refetched on component mount/remount. This prevents redundant API calls during normal page navigation. Queries that need real-time data (e.g., identity auth configs, dynamic secret leases) override this with `staleTime: 0`.
- **`refetchOnWindowFocus: false`** — queries do not refetch when the browser tab regains focus.
- **`retry: 1`** — failed queries retry once.

Mutation failures are reported globally by `MutationCache.onError` using the server error message. Do not add another error `createNotification` in a mutation `catch` or `onError`, because it produces duplicate toasts. Local error handling may still restore optimistic state, keep a dialog open, or perform other control flow without displaying a second notification.

When adding new queries, consider whether the default 60s staleTime is appropriate:
- For data that changes only on explicit user action (secrets, folders, org metadata): the 60s default is fine or could be longer.
- For data that must always be fresh (auth configs, lease TTLs): override with `staleTime: 0, gcTime: 0`.
- For rarely-changing data (server config, user profile): use `staleTime: Infinity` as the context providers do.

### State Management

- **Server state**: TanStack React Query (query key factories in each API domain)
- **Global app state**: React Context providers in `src/context/` — User, Organization, Project, OrgPermission, ProjectPermission, ServerConfig, Subscription
- **Local component state**: Zustand stores

### Permissions

CASL-based (`@casl/ability`). Contexts: `OrgPermissionContext` and `ProjectPermissionContext` in `src/context/`. Access via `useOrgPermission()` / `useProjectPermission()` hooks. HOC gates: `src/hoc/withPermission/` and `withProjectPermission/`.

### Styling

Tailwind CSS v4 with PostCSS. Dark theme configured via CSS custom properties in `src/index.css` (`@theme` directive). Custom breakpoint `dashboard: 1100px`. Typography roles: Inter is the default product UI face, Alliance is the display face, `font-mono` remains the functional application mono, and `font-jetbrains-mono` is reserved for decorative technical microcopy. See the root `DESIGN.md` before assigning a non-default face. Color palette: primary (blue), mineshaft (dark gray), bunker (darker bg), success/warning/danger/info.

### Graph views (React Flow)

Three graphs exist and they are not interchangeable, so extend the closest one rather than starting over:

- `components/permissions/AccessTree/` — role to folder access, in the role editor. Dagre-laid out, and the
  source of the reusable pieces (`positionElements`, `ShowMoreButtonNode`, progressive disclosure in its
  hook).
- `components/secrets/SecretReferenceDetails/` — reference *dependencies* of a secret, with cycle handling.
- `pages/secret-manager/BlastRadiusPage/` — everything that touches one secret. Fixed three-band layout
  (principals, secret, destinations) with a detached ghost-reader band, so it positions nodes explicitly in
  `utils/buildGraph.ts` instead of using dagre: the bands are column math, and a hierarchical layout fights
  them.

Conventions the blast radius view depends on, worth preserving if you touch it:

- **Solid edge means observed, dashed means entitled but not seen in the window.** With no activity data
  every edge stays dashed, because unknown is not the same as unused.
- **Ghost readers are drawn with no edge to the secret.** They have no current path, and drawing one would
  misrepresent the access model.
- **Folder-precision read counts render with a leading `~`** and a `folder-level` badge. The backend sends
  `precision`; the client applies the tilde. Never format the count server-side.
- **A cluster is not truncation.** `+N principals` folds nodes that are still counted in every total and
  expands in place; a truncation banner reports a rendering cap with the not-drawn breakdown. Keep the two
  visually and verbally distinct.
- **The initial fit frames the three bands, not the ghost band.** Ghost readers hang below the entitled
  column with no edges, so including them in `fitView` zooms every other node down to accommodate them.
  They stay one pan away, and the header stat tile is what guarantees the count is never missed.
- **The wheel belongs to the page.** The canvas sits in a scrolling page, so `zoomOnScroll` is off and
  `preventScrolling` is false; zoom lives on the controls and pinch. Otherwise scrolling past the graph
  traps the reader inside it.
- **Badge text size is never overridden.** v3 badges carry `text-xs`, and node heights in
  `utils/buildGraph.ts` are sized around that rather than shrinking the badges to fit.
- **The Explain panel navigates, it does not mutate.** Revoking access from a read-only graph would put a
  destructive action two clicks from a hover, so the actions link to the role editor and access page, which
  own those flows and their guards.

### Layouts

9 layout components in `src/layouts/` — `AdminLayout`, `OrganizationLayout`, `SecretManagerLayout`, `PkiManagerLayout`, `KmsLayout`, `PamLayout`, etc. Layouts handle sidebar navigation and page chrome for their product area.

## Conventions

- ESLint flat config (ESLint 9+) with airbnb-typescript + prettier. Double quotes enforced.
- Import ordering via `simple-import-sort`: node builtins → react/external packages → `@app/` → internal → relative → styles.
- Forms use `react-hook-form` with `@hookform/resolvers` (Zod schemas).
- Search params validated with `zodValidator()` from `@tanstack/zod-adapter`.
- Toasts: call `createNotification({ title?, text, type, callToAction?, copyActions? })` from `@app/components/notifications`. Backed by **sonner** (the v3 `Toaster` in `components/v3/generic/Toast`), mounted once via `NotificationContainer` in `pages/root.tsx`. `react-toastify` has been removed, so do not reintroduce it.
