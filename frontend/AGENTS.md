# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

This is the **frontend** package of the Infisical monorepo — a React 19 SPA built with Vite 8, TanStack Router, React Query, and Tailwind CSS v4.

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
- **`src/components/v3/`** — Latest shared UI component library (preferred). Contains `generic/` (Accordion, Alert, Button, Dialog, Select, Table, etc.) and `platform/` (domain-specific components such as `PageHeader`, scope icons, `ProjectPermissionSubjects`, and `SecretManagerResources`). **Always use v3 components.** Policy group tiles look up `getProjectPermissionSubjectPresentation`. Secret Manager overview resources (name/slug/icon/color) come from `SecretManagerResources`, which points at that subject catalog.
- **Navigable rows and cards** — A table row, card or command item that opens a page is a real link, so cmd/ctrl+click, middle-click and "Open link in new tab" work: set `linked` on `TableRow` or `Card` and put a `RowLink` in the main cell (`CommandItemLink` inside a `CommandItem`). Never navigate from a row's `onClick`. Controls inside a linked row are lifted above the link automatically; mark a non-interactive tooltip anchor (a badge) with `data-row-interactive`. Certificate Manager and Secret Scanning URLs have no project id, so links into a specific instance go through `getInstancePinningLink` (`helpers/project.ts`), whose legacy URL redirect pins the instance in the new tab. When you touch a row that still navigates from `onClick`, move it onto `linked`. See the Table "Example: Linked Rows" story.

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

Organization switching resets the query cache centrally in `pages/middlewares/inject-org-details.tsx`, after authentication succeeds and before tenant data loads. `hooks/api/organization/cache.ts` tracks the active organization per `QueryClient` and removes all queries except the exact auth-token, user-profile, server-config, and session-announcement keys. Removing queries also cancels pending query results, including queries whose keys omit the organization. Same-organization navigation keeps the cache, and the organization layout remounts on organization changes to reset local UI state. Keep tenant cache cleanup at this boundary rather than adding feature-specific removal lists to individual organization selectors. Logout paths must use `clearSession` to remove user-specific cache entries while preserving public server configuration for the login page.

Organization switchers use `helpers/organizationSwitch.ts` to retain safe sections and tabs while dropping resource IDs, action parameters, and legacy suborganization search state. Pass the current location through `navigateUserToOrg` only for organization switches; initial login keeps its Projects landing page. Explicit destinations take precedence, and MFA route handoffs retain the requested destination through `redirect_to`.

### Product Analytics

Use `@app/lib/analytics` for new frontend product analytics. Define the event and its typed properties in the shared catalog, then capture it through the method matching its scope so required grouping is applied automatically. Do not call the legacy `Telemetry` wrapper directly from new code or define event names as local strings.

Read [`../ANALYTICS.md`](../ANALYTICS.md) before adding or changing an event. It defines naming, ownership between frontend and backend producers, property cardinality and privacy rules, and lifecycle semantics. Frontend events describe UI exposure and intent; decisive product outcomes belong to backend telemetry so web activity is not double-counted against CLI, machine identity, or other clients.

#### PostHog feature flags and A/B tests

- Put each experiment in `src/components/analytics/experiments/<experiment>/`, with its flag key, typed variants, assignment hook, and focused Vitest coverage kept together. Shared lifecycle code belongs in `src/lib/analytics/experiments/`.
- Resolve PostHog flags through `resolveFeatureFlagVariant`. It performs a fresh lookup after flags load and owns timeout, error fallback, late-callback suppression, unsubscribe, and unmount cancellation. Set exposure-event behavior deliberately, and persist only values that the experiment resolver recognizes as real assignments.
- Define the eligible population before initializing PostHog. Excluded flows must not request the flag or emit the experiment conversion. An eligible user who completes after assignment fails can be attributed as `unassigned`; an ineligible user must not be counted.
- Keep an assignment sticky for the full conversion path, including redirects or region changes. Register dedicated conversion events and typed properties in `@app/lib/analytics`; do not reuse a broader event with different semantics or default unenrolled users into the control cohort.
- Allow forced variants only in local development or pull-request previews. Production cloud domains must use PostHog assignment, and self-hosted instances must not initialize cloud experiments.
- Create the PostHog flag and experiment as inactive drafts. Validate variant keys, exposure, conversion events, and metrics against a preview deployment before anyone launches the experiment separately from the code rollout.

### State Management

- **Server state**: TanStack React Query (query key factories in each API domain)
- **Global app state**: React Context providers in `src/context/` — User, Organization, Project, OrgPermission, ProjectPermission, ServerConfig, Subscription
- **Local component state**: Zustand stores

### Permissions

CASL-based (`@casl/ability`). Contexts: `OrgPermissionContext` and `ProjectPermissionContext` in `src/context/`. Access via `useOrgPermission()` / `useProjectPermission()` hooks. HOC gates: `src/hoc/withPermission/` and `withProjectPermission/`.

### Styling

Tailwind CSS v4 with PostCSS. Dark theme configured via CSS custom properties in `src/index.css` (`@theme` directive). Custom breakpoint `dashboard: 1100px`. Typography roles: IBM Plex Sans is the default product UI face (`font-sans`); Alliance No. 2 Regular is for headings (`font-alliance`); JetBrains Mono is the functional mono (`font-mono`) for code, values, identifiers, and technical microcopy. See the root `DESIGN.md` for typography roles. Colors use semantic roles from `src/index.css`, including surfaces, content, structure, status, scope, and product/resource accents.

### Layouts

9 layout components in `src/layouts/` — `AdminLayout`, `OrganizationLayout`, `SecretManagerLayout`, `PkiManagerLayout`, `KmsLayout`, `PamLayout`, etc. Layouts handle sidebar navigation and page chrome for their product area.

### Org-scoped products

PAM and Agent Vault live at `/organizations/$orgId/<slug>` over a single implicit project, so their URLs carry no `$projectId`. Their layout's `beforeLoad` publishes `implicitProjectId` and `implicitProductType` into route context, and `useImplicitProjectId()` / `useImplicitProduct()` read them back off the matched routes. **Anything that decides whether a `useProject()` caller renders must use `useImplicitProduct()`, never the pathname.** The router changes location before it swaps matches, so a pathname gate mounts a frame early on the way in and unmounts a frame late on the way out, leaving the component asking for a project the router no longer resolves — which throws into `ErrorPage`. Reading the matches keeps these products in step with `useParams`, which is match-derived and is what every other product's gate already uses. The gates that matter today are `OrgSidebar`'s `isInsideProject`, the `ProjectSelect` wrapper, and `OrganizationCommandMenu` in `RootCommandMenu.tsx`, which had exactly this bug when it arrived from main with a pathname check; `getOrgScopedProductFromPath` remains correct for the cosmetic uses behind no `useProject` (navbar scope, `useScopeVariant`, `TypeSelect`).

A new org-scoped product therefore needs: a `<product>ProjectId` on the `Organization` type, an entry in `ORG_SCOPED_PRODUCT_TYPES` and `getOrgScopedProductFromPath` (`helpers/project.ts`), and a layout `beforeLoad` that bootstraps the id, patches it into the cached org, and returns both `implicitProjectId` and `implicitProductType` (see `pages/agent-vault/layout.tsx`). Use `isOrgScopedProduct(type)` rather than adding another pathname check; the sidebar, navbar, project switcher and nav links all key off it.

Agent Vault onboards admins through one progress source, `useAgentVaultSetupProgress` (`components/agent-vault/SetupChecklist`): proxy connected, access bundle, service, session. Its queries run only for admins, since listing every session is admin-only on the server, and it reports `nextStep` and `isFailed`. The sidebar checklist, the product's index route (`redirects/agent-vault-index-redirect.tsx`, which opens on `nextStep` and falls back to Sessions when the progress can't be read) and the sample session's setup button all read it, so link into Agent Vault through `/organizations/$orgId/agent-vault`, not straight to a page. Going to a step goes through `useOpenAgentVaultSetupStep`: the page it lands on opens its own create dialog or sheet through `useAgentVaultCreateIntent` and a `?create=true` flag the page clears, so give any new step's page that hook rather than a dialog in the checklist. The Sessions page shows a hard-coded sample session (`SampleSessionSheet`) while an admin's org has no session, or while a member has none of their own.

Certificate Manager is org-scoped too (`/organizations/$orgId/cert-manager/...`), but legacy orgs can hold several instances, so its layout resolves the project from instance state instead of an org field, through `resolveCertManagerProjectId` (`helpers/certManagerActiveProject.ts`): the `infisical-cm-active-project-<orgId>` cookie while the user is a member of that instance, else the active instance. The product switcher and the 403 page use the same helper. The layout writes the resolved id back to the cookie, because `inject-cert-manager-project-id.ts` resolves requests that name no project from it, and reloads the page when the resolved instance changes within one page load, since several cert-manager queries are not keyed by project. Consequences: anything that sends someone into a *specific* instance (the instance picker, a project-scoped identity row, a gateway's discovery row) sets that cookie first, since the URL can't say which; old `/projects/cert-manager/$projectId/...` URLs (emails and alerts sent before the move, bookmarks; the backend now links to `/cert-manager/...`, except legacy PKI Alerts V2 and the legacy-deprecation email) go through `redirects/cert-manager-project-url-redirect.tsx`, which pins the named instance and strips the id. In multi-instance orgs each tab also tags its Certificate Manager API requests with the instance it shows (`setTabCertManagerProjectId`, read by the `apiRequest` interceptor), because the cookie is shared across tabs; single-instance orgs send no project id. Shared views that pick project vs org scope from the URL use `useRouteProjectId()`, which also returns Certificate Manager's implicit project.

### Single-project products

Secret Scanning has one active project per org (see the root `AGENTS.md`). Members are sent straight into it, and UI for orgs with older projects is gated on `isMultiInstance` from `useGetSecretScanningInstanceState`.

## Conventions

- App browser titles use `PageTitle` from `@app/components/PageTitle`, which applies the localized `common.head-title` format (`Page | Infisical`) without suspending loading/error fallbacks. Pass a page label, not an already branded string. Keep one title mounted per screen, including loading, empty, and denied states; place it outside permission guards when necessary. The static HTML title is handed off before React mounts, preserving a no-JS fallback without duplicates. Custom-branded public sharing keeps its existing native, unbranded title; its loading title must not assume Infisical branding before configuration resolves. Use resource names only, never secret values or tokens.
- TypeScript 7. Oxlint (`.oxlintrc.json`, type-aware via the `--type-aware` CLI flag) lints and Oxfmt (`.oxfmtrc.json`) formats, sorts Tailwind classes, and orders imports: builtins and react/external packages → `@app/` → internal → relative → styles → other side-effect imports. Oxlint honours `eslint-disable` comments, and `npm run lint` fails on a disable comment that suppresses nothing, so remove one when the code it covered goes away. Some rules from the old ESLint config have no Oxlint equivalent and are no longer enforced: `import/no-extraneous-dependencies` (declare every package you import in `package.json` yourself), `no-restricted-syntax` (`for...of` is allowed), `@typescript-eslint/naming-convention`, the TanStack Router route property order rule, and the Storybook plugin rules. Editor setup lives in `frontend/.vscode/` and `frontend/.zed/`.
- Forms use `react-hook-form` with `@hookform/resolvers` (Zod schemas).
- Search params validated with `zodValidator()` from `@tanstack/zod-adapter`.
- Toasts: call `createNotification({ title?, text, type, callToAction?, copyActions? })` from `@app/components/notifications`. Backed by **sonner** (the v3 `Toaster` in `components/v3/generic/Toast`), mounted once via `NotificationContainer` in `pages/root.tsx`. `react-toastify` has been removed, so do not reintroduce it.
- Overlays: `DialogContent`, `SheetContent`, `AlertDialogContent`, and `ConfirmationAlertDialog` own dismissal, focus, and pending behavior, so callers add no Escape, outside-click, focus-return, or stacking code. Compose every Dialog and Sheet as header, body, and footer as in their stories, with actions (including wizard navigation) in `DialogFooter` or `SheetFooter` rather than a hand-rolled bordered row. A nested popup (`Combobox`, `Select`, `DropdownMenu`, `Tooltip`, `HoverCard`, `Popover`) takes the first Escape or outside click and the next one reaches the overlay, so keep `onEscapeKeyDown` only for product behavior such as a discard guard. Pass the submit or parent mutation's pending state as `isPending` on the content and the submit `Button` instead of guarding `onOpenChange`; while it is true, Escape, outside clicks, the close button, and every `DialogClose` or `SheetClose` are inert. A plain `AlertDialog` with `confirmationValue` locks the same way when given `isPending`. Closing returns focus to the opener, or to a `DropdownMenu` trigger when one of its items opened the overlay, so add no refs or `onCloseAutoFocus` handlers and no `autoFocus` inside the overlay: `autoFocus` moves focus before the overlay records its opener, and the overlay already focuses the first field. Keep the caller's `reset()` or state clearing on close. `ConfirmationAlertDialog` is the typed-confirmation pattern: it resets the typed value on open and close, submits on Enter only when it matches `confirmKey`, locks while `onConfirm` is in flight, and stays open when `onConfirm` rejects so the global mutation error toast reports the failure. When `onConfirm` opens a second dialog instead of closing, check that dialog's focus return. See the Dialog "Example: Nested Popups and Pending Close" story and the `Combobox` creation stories.
- Component lifecycle: deprecate a shared component or prop with `@deprecated` on the exported API, naming the supported replacement and any limits, and tag its Storybook metadata `deprecated` when a story exists. Search `src/components` for `@deprecated` to find current deprecations. Keep deprecation, consumer migration, and removal as separate changes unless the task combines them, and do not add a second component library beside `components/v3`.
- Unsaved changes: use `useDiscardChangesGuard` with `DiscardChangesAlertDialog` when dismissing an overlay editor would remove unsaved form changes. Wire dismiss/close to `requestDiscard`. Do not use `window.confirm`. Do not use `useNavigationBlocker` — that hook is secrets batch-mode only.
