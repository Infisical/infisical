# SecretDashboardPage Removal Plan

**Decision:** `SecretDashboardPage` is the old single-environment secrets dashboard. Do **not** migrate it to v3. Remove the page and route. Keep Overview (`/overview`) as the secrets UI.

**Status (2026-08-04):** Removal steps §1–§5 are **done**. Remaining work is Overview v3 migration (§6 / §5 migration bullets) for non-rotation surfaces.

**Canonical old route:**
`/organizations/$orgId/projects/secret-management/$projectId/secrets/$envSlug`

**Retarget destination:**
`/organizations/$orgId/projects/secret-management/$projectId/overview`
with search params such as `{ environments: [envSlug], secretPath, search?, filterBy?, dynamicSecretId? }`
(mirror `QuickSearchSecretItem` / Overview quick search).

---

## Progress checklist

| Step | Status |
|---|---|
| 1. Delete already-dead files (§1.4 + §4) | Done |
| 2. Extract constants + store + CollapsibleSecretImports + MetadataForm | Done |
| 3. Move Overview-owned shared modals / dynamic-secret / CommitForm | Done |
| 4. Retarget all `/secrets/$envSlug` navigation (§2.1) | Done |
| 5. Remove route + `SecretDashboardPage` page-only tree (§1) | Done |
| 6. Continue Overview v3 migration (live Overview surface only) | Partial — rotations done; Overview rows/shell/lease chrome still mix v2 |

### Actual extraction homes (landed)

| Module | Home |
|---|---|
| `HIDDEN_SECRET_*` | `frontend/src/components/secrets/constants.ts` |
| Batch/pending store | `frontend/src/pages/secret-manager/shared/secretBatch.store.tsx` |
| `CollapsibleSecretImports` | `frontend/src/components/secrets/CollapsibleSecretImports.tsx` |
| Dynamic secret create/edit/lease + provider form + sheet | `frontend/src/components/dynamic-secrets/` |
| `CommitForm`, Folder/import/Vault/Doppler/Replicate | `frontend/src/pages/secret-manager/shared/` |
| `MetadataForm` | `frontend/src/components/MetadataForm/` |
| `RowType` (QuickSearch) | Overview’s own `RowType` from `OverviewPage.tsx` |
| Path breadcrumb | `frontend/src/components/navigation/SecretPathBreadcrumb.tsx` (retargeted to Overview) |

### Rotation v3 (Overview-facing) — done

- Create + edit use `SecretRotationSheet` (unsaved-changes guard)
- Rotate / Reconcile / Delete use v3 `AlertDialog`
- View generated credentials uses v3 `Dialog`
- Status badge + credential display on v3 Tooltip / IconButton / Detail
- No remaining `@app/components/v2` imports under `secret-rotations-v2/`

### Still open

- Overview still imports v2 `PageHeader` (documented DESIGN.md exception until a v3 page header exists)

### Cleanup landed (2026-08-04)

- Vault role import: 4 near-duplicate modals collapsed into `VaultRoleImportModal` (v3 Dialog + Field + FilterableSelect); thin named re-exports kept for call sites
- `VaultSecretImportModal` + `VaultConnectionAndNamespaceFields` migrated off FA/v2/`mineshaft`
- Dynamic-secret lease UIs, `MetadataForm`, Overview search/rows/migration chrome, shared replicate/commit/import forms, secret reference/diff, breadcrumb, and rotation parameter FA icons migrated to v3/lucide/semantic tokens

---

## 1. Fully drop (page + page-only surface) — DONE

Deleted with the page after shared modules were extracted/retargeted.

### 1.1 Page shell & route registration — DONE

| Path | Action |
|---|---|
| `frontend/src/pages/secret-manager/SecretDashboardPage/SecretDashboardPage.tsx` | Deleted |
| `frontend/src/pages/secret-manager/SecretDashboardPage/route.tsx` | Deleted |
| `frontend/src/routes.ts` — `route("/secrets/$envSlug", ...)` | Removed |
| `frontend/src/const/routes.ts` — `SecretManager.SecretDashboardPage` | Removed |
| `frontend/src/routeTree.gen.ts` | Regenerated (Vite watcher) |

### 1.2–1.3 Page-only folders / SecretListView — DONE

Entire `SecretDashboardPage/` tree removed after extraction.

### 1.4 Already dead inside SecretDashboardPage — DONE

| Path | Status |
|---|---|
| `.../components/DynamicSecretDialog/**` | Deleted |
| `.../SecretListView/GenRandomNumber.tsx` | Deleted |
| `.../ActionBar/CreateDynamicSecretForm/components/LoadFromVaultBanner.tsx` | Deleted |

### 1.5 Possibly orphan navigation chrome — DONE

| Path | Notes |
|---|---|
| `frontend/src/components/navigation/NavHeader.tsx` | Confirmed unused; deleted |

---

## 2. Retarget / extract (shared dependencies) — DONE

### 2.1 Route / navigation retargets — DONE

All listed callers now target Overview (`environments` / `secretPath` / `search` / `filterBy` / optional `dynamicSecretId` as appropriate). Breadcrumb renamed to `SecretPathBreadcrumb`.

### 2.2–2.3 Shared modules — DONE

Moved to homes listed in **Actual extraction homes** above; importers updated.

---

## 3. Recommended extraction destinations

See **Actual extraction homes** (landed). Historical suggestions kept for context:

| Module | Suggested home |
|---|---|
| `HIDDEN_SECRET_*` constants | `frontend/src/components/secrets/constants.ts` or `hooks/api/secrets/constants.ts` |
| `SecretMainPage.store.tsx` | `frontend/src/pages/secret-manager/shared/` or a dedicated store module (rename off “SecretMainPage”) |
| `CollapsibleSecretImports.tsx` | `frontend/src/components/secrets/` or Overview selection/edit area |
| Dynamic secret create/edit/lease + provider form + sheet | `frontend/src/components/dynamic-secrets/` (preferred) or `OverviewPage/components/` |
| `CommitForm`, Folder/import/Vault/Doppler/Replicate modals | `OverviewPage/components/` or `frontend/src/pages/secret-manager/shared/` |
| `MetadataForm.tsx` | `frontend/src/components/` (generic; not Overview-specific) |
| `SecretMainPage.types.ts` / `RowType` | Stop importing from dashboard; use Overview `RowType` or a shared resource-type enum |
| `SecretDashboardPathBreadcrumb.tsx` | Keep in `components/navigation/`, retarget + rename |

---

## 4. Independent Overview dead cleanup — DONE

| Path |
|---|
| `OverviewPage/components/SecretOverviewTableRow/**` |
| `OverviewPage/components/SecretOverviewFolderRow/**` |
| `OverviewPage/components/SecretOverviewDynamicSecretRow/**` |
| `OverviewPage/components/SecretOverviewSecretRotationRow/**` |
| `OverviewPage/components/SecretRotationTableRow/SecretOverviewRotationSecretRow.tsx` |
| `OverviewPage/components/FolderBreadCrumbs/**` |

---

## 5. What this means for v2 → v3 migration

**Do not migrate** the SecretDashboardPage UI surface (list views, compare envs, dashboard ActionBar shell, dashboard dropzone, etc.) — page is gone.

**Do migrate / continue migrating** only what Overview (and shared consumers) still need:

| Item | Status |
|---|---|
| Secret rotation flows (`secret-rotations-v2` modals → sheets/dialogs) | Done |
| Shared dynamic-secret sheet/forms on `DynamicSecretSheet` | Largely done (create/edit sheets); lease chrome still v2 Modal in Overview |
| Remaining Overview `@app/components/v2` usage (secrets rows, imports, page shell, etc.) | Open |

---

## 6. Suggested execution order

1. ~~**Delete already-dead files** (§1.4 + §4)~~
2. ~~**Extract constants + store + CollapsibleSecretImports + MetadataForm**~~
3. ~~**Move Overview-owned shared modals / dynamic-secret / CommitForm** out of `SecretDashboardPage/`~~
4. ~~**Retarget all `/secrets/$envSlug` navigation** (§2.1) to Overview~~
5. ~~**Remove route + `SecretDashboardPage` page-only tree** (§1)~~
6. **Continue Overview v3 migration** on the remaining live Overview surface only — rotations done; rows/shell/lease modals next.

---

## 7. Session context

Dashboard page removal is complete. Overview still mixes `@app/components/v2` outside the rotation package. Next focus is Overview-only v3 cleanup (not dashboard revival).
