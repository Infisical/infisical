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
- `pages/secret-manager/BlastRadiusPage/` — everything that touches one secret. Primary entry is a wide
  right drawer (`BlastRadiusSheet`) over the secrets list; the standalone route renders the same
  `BlastRadiusPanel` so a shared link lands on an identical view. Fixed three-band layout (principals,
  secret, destinations) positioned explicitly in `utils/buildGraph.ts`: the bands are column math, and
  both dagre and `fitView` fight them.

Conventions the blast radius view depends on, worth preserving if you touch it:

- **Solid edge means observed, dashed means entitled but not seen in the window.** With no activity data
  every edge stays dashed, because unknown is not the same as unused.
- **Ghost readers are drawn with no edge to the secret.** They have no current path, and drawing one would
  misrepresent the access model.
- **Folder-precision read counts render with a leading `~`** and a `folder-level` badge. The backend sends
  `precision`; the client applies the tilde. Never format the count server-side.
- **Every entitled principal is drawn — do not reintroduce clustering.** A `+N principals` cluster node for
  the unused ones existed and was removed: the condition that triggered it (no reads in the window) is
  exactly the condition under which *every* principal qualifies, so on a secret nobody had read the entire
  column collapsed into one box and the graph showed nothing. The drawing cap is the only thing that keeps
  nodes off the canvas, and it reports itself in the legend with a `Draw more` control.
- **No `fitView`. The canvas is sized to the content, not the content zoomed to the canvas.**
  `buildGraph` lays nodes out in top-left coordinates and returns `contentWidth` / `contentHeight`, which
  become the canvas min-size; the viewport stays at 1:1. Auto-fitting raced node measurement and kept
  settling on a transform that clipped the tallest column, and a `ResizeObserver` refit only made the
  race less frequent. Column gaps are tuned so all three columns fit the drawer without panning.
- **Ghost readers are nodes in the entitled column, under a `bandLabel` node, with no edges.** They belong
  in that column because that is where a reader looks for people, and the band label plus a wider gap is
  what separates them once there are no edges to distinguish them. They are excluded from the vertical
  centring so the secret stays aligned with the principals that actually connect to it, and
  `contentHeight` takes the max of the centred columns and the ghost stack's bottom.
- **Band labels are nodes, not overlays, and they carry the column headers too.** `Entitled · N`,
  `Secret`, `Destinations · N` and `Ghost readers · N` are all `bandLabel` nodes, each with a one-line
  explanation of what its column means. They were a fixed bar above the canvas, which could not explain
  anything without stealing a row from the graph and did not scroll with the column it named. As nodes they
  take part in the same column math as everything else — positioning a band absolutely against a centred
  stack is what put it on top of the last principal the first time it was tried. `COLUMN_TOP` reserves the
  header's height, and `contentWidth` allows for a label that runs past its column.
- **The header is one sentence** (`summarizeBlastRadius`), not a card plus a stat row. Clauses that would
  read as padding are dropped rather than rendered as zeroes.
- **Anything opened from a dropdown item is deferred a tick.** Radix closes the menu in the same tick it
  selects, and treats that teardown as an outside-press on a dialog opened synchronously.
- **The wheel belongs to the page.** The canvas sits in a scrolling page, so `zoomOnScroll` is off and
  `preventScrolling` is false; zoom lives on the controls and pinch. Otherwise scrolling past the graph
  traps the reader inside it.
- **Zoom controls are ours, outside the scroll container.** React Flow's `<Controls>` positions itself
  against the canvas, which here is sized to the content, so once the content outgrew the viewport the
  controls sat below the fold and scrolled away. `BlastRadiusGraph` owns the scrolling element and renders
  a `ZoomControls` sibling next to it, driven by `useReactFlow`. Reset goes to 1:1 rather than `fitView`,
  which is the thing this layout exists to avoid.
- **Badge text size is never overridden.** v3 badges carry `text-xs`, and node heights in
  `utils/buildGraph.ts` are sized around that rather than shrinking the badges to fit.
- **Principal detail is a popover anchored on the node** (`PrincipalPopover`), not a second panel. The
  explanation sits beside the thing it explains, and the graph keeps the width. It follows from that that
  there is exactly one detail surface: a table row switches to Graph mode and selects rather than opening a
  differently-shaped panel of its own.
- **The popover navigates, it does not mutate.** Revoking access from a read-only graph would put a
  destructive action two clicks from a hover, so the actions link to the role editor and access page, which
  own those flows and their guards.
- **A popover inside a React Flow node needs two things, or its close button silently does nothing.** Both
  were real bugs, and both look identical from the outside:
  1. **Stop propagation on the content.** `PopoverContent` is portalled out of the canvas in the DOM, but a
     React portal still propagates events through the *React* tree — so a click inside it reached React
     Flow's node handler and re-selected the node in the same tick that the close button cleared it. A DOM
     listener on `.react-flow` sees nothing, which makes this very hard to spot; the tell is that the state
     setter runs and the selected id never changes.
  2. **Mount the content only while open** (`{isSelected && <PopoverContent …>}`). Radix's `Presence`
     unmounts on `animationend`, and the exit animation here never completes, so a popover with
     `data-state="closed"` stayed on screen indefinitely.
- **Selection lives in `SelectedPrincipalContext`, not in React Flow.** React Flow keeps selection in its own
  store and ignores a `selected: false` handed to it in the `nodes` array, so the panel's state has to reach
  the node another way. `elementsSelectable={false}` keeps React Flow out of it entirely.
- **Handlers reach nodes through context, never through node `data`.** React Flow holds on to the node
  objects it was first given, so a callback in `data` stays bound to a component instance that may no longer
  exist and calling it sets state on nothing. `data` is for values that describe the node.

### Layouts

9 layout components in `src/layouts/` — `AdminLayout`, `OrganizationLayout`, `SecretManagerLayout`, `PkiManagerLayout`, `KmsLayout`, `PamLayout`, etc. Layouts handle sidebar navigation and page chrome for their product area.

## Conventions

- ESLint flat config (ESLint 9+) with airbnb-typescript + prettier. Double quotes enforced.
- Import ordering via `simple-import-sort`: node builtins → react/external packages → `@app/` → internal → relative → styles.
- Forms use `react-hook-form` with `@hookform/resolvers` (Zod schemas).
- Search params validated with `zodValidator()` from `@tanstack/zod-adapter`.
- Toasts: call `createNotification({ title?, text, type, callToAction?, copyActions? })` from `@app/components/notifications`. Backed by **sonner** (the v3 `Toaster` in `components/v3/generic/Toast`), mounted once via `NotificationContainer` in `pages/root.tsx`. `react-toastify` has been removed, so do not reintroduce it.
