# V3 UI removal ledger

The migration is complete only when the legacy UI implementations, exports, imports, aliases, and private dependencies are removed from the latest `main`. Migrating a consumer in an open PR does not mean its legacy family is removed on `main`. Moving an implementation into V3, renaming it, or wrapping it does not establish parity or removal.

## Status on main

The `components/v2` tree and its `@app/components/v2` root barrel are deleted. The last census before deletion, at `e434f2fdfdd608f97cd4041af84062991d2645cf`, found 24 families, 50 files, and one external consumer: the root `TooltipProvider` in `pages/root.tsx`, which now uses the V3 `TooltipProvider` with the same 700 ms delay and 300 ms skip delay. Every other V2 import was between V2 families.

`legacy.css` is also deleted, so `audit-v2-ui.mjs --assert-zero` passes: zero V2 files, zero legacy module edges, zero known outside paths, and zero computed imports. The family coverage and product-surface tables below are the 2026-10-04 baseline record; keep using them for replacement guidance, not as current consumer counts.

## Baseline and measurement

Baseline: `infisical/infisical` `origin/main` **70e06365043ae3b6f49ef6c95a8b9997b20f4a34**, fetched **2026-10-04**. The September 24 design audit is historical context, not current acceptance evidence.

The baseline contains **52 V2 families**, **106 family source files plus the root barrel**, and **312 distinct external consumer files**. Of those consumer files, 311 have runtime references; the remaining file uses a legacy menu type. Counts include layouts, shared features, entry code, and type dependencies, not just JSX tags. Families overlap across consumers, so table rows must not be summed into a consumer-file total.

Inventory used TypeScript 5.6.3 module resolution with the frontend tsconfig, compiler-resolved symbol declarations, import/export edges, and actual identifier references. Both alias and relative paths, deep imports, re-exports, namespace imports, stories, tests, JS/config sources, and dynamic imports were inspected. No V3-to-V2 import/export ingress or computed dynamic import was found at this baseline. This proves source relationships, not interaction parity or authenticated acceptance.

Regenerate the current import/export and family inventory from the repository root:

```sh
node frontend/scripts/audit-v2-ui.mjs > v2-ui-inventory.json
node frontend/scripts/audit-v2-ui.mjs --assert-zero > v2-ui-completion.json
```

The script inspects tracked and nonignored untracked frontend JS/TS sources. It resolves imports through the configured aliases and records original declarations for named/default bindings, including aliases through another barrel. Its JSON includes every legacy module edge and binding, external consumers, V3 ingress, unresolved/computed dynamic imports, literal glob matches, and additional known legacy source paths. Literal Vite globs with standard relative/root/`@app` paths are matched against source paths; unrelated globs do not fail the gate, but explicit stale V2 glob paths do. Nonliteral imports or globs with an unclassified base/alias remain manual-review blockers. Its `head` and `workingTree` fields distinguish a clean baseline from a local candidate. Outputs are local audit artifacts, not files to commit.

`--assert-zero` is expected to fail during migration. It requires zero V2 files, zero legacy module edges, zero known unversioned legacy paths, and zero unclassified computed imports. It does not replace review for copied/renamed legacy implementations, new feature-specific legacy code, behavior, or security. Review the source and diff alongside the machine gate.

## Family coverage

In the table, E is the number of external consumer files and I is the number of other V2 consumer files at the baseline. Implementation paths are relative to `frontend/src/components/v2/`; each family includes its own barrel and private helpers. Consumer references are repository-relative at the baseline commit, not guaranteed current line numbers.

| Family / implementation | E / I | Replacement and parity work | Baseline consumer example or deletion proof |
| --- | --- | --- | --- |
| `Accordion/Accordion.tsx` | 4 / 0 | V3 Accordion; verify collapsible/default state and form section semantics. | `frontend/src/pages/cert-manager/PkiSubscribersPage/components/PkiSubscriberModal.tsx:521` |
| `Alert/Alert.tsx` | 2 / 0 | V3 Alert composition; preserve rich descriptions/actions. | `frontend/src/pages/secret-manager/integrations/FlyioConfigurePage/FlyioConfigurePage.tsx:135` |
| `Blur/Blur.tsx` | 0 / 0 | Deleted in first wave; no external or internal consumer. | No incoming non-export edge or external symbol reference. |
| `Breadcrumb/Breadcrumb.tsx` | 6 / 0 | V3 Breadcrumb and layout metadata; preserve links and accessible navigation. | `frontend/src/pages/pam/layout.tsx:60` |
| `Button/Button.tsx` | 141 / 4 | V3 Button; map intent, disabled/loading, type, refs, and permissions per flow. | `frontend/src/pages/middlewares/restrict-login-signup.tsx:61` |
| `Card/Card.tsx` | 66 / 2 | V3 Card slots; preserve layout and state-bearing children. | `frontend/src/pages/secret-manager/integrations/SelectIntegrationAuthPage/SelectIntegrationAuthPage.tsx:164` |
| `Checkbox/Checkbox.tsx` | 11 / 1 | V3 Checkbox + Field; verify controlled/indeterminate state and labels. | `frontend/src/pages/organization/AccessManagementPage/components/UpgradePrivilegeSystemModal/UpgradePrivilegeSystemModal.tsx:180` |
| `ConfirmActionModal/ConfirmActionModal.tsx` | 2 / 0 | Deleted the unused implementation, family index, and root export; no consumer changes. | At `becbf4813816bb3686111b2537009201b0a90c81`, no incoming implementation edge or external symbol reference remained. |
| `ContentLoader/ContentLoader.tsx` | 12 / 0 | V3 Loader/PageLoader composition; preserve pending boundaries. Visible copy maps to PageLoader `text`; wrap PageLoader in an `h-screen` container where the page needs full viewport height. | `frontend/src/pages/auth/SelectOrgPage/SelectOrgPage.tsx:446` |
| `CopyButton/CopyButton.tsx` | 2 / 0 | V3 CopyButton; verify exact copy, failure feedback, and labels. | `frontend/src/pages/cert-manager/CertificateDetailsByIDPage/components/CertificateDetailsSection.tsx:275` |
| `CreatableSelect/CreatableSelect.tsx` | 0 / 0 | Deleted in first wave; no consumer. | No incoming non-export edge or external symbol reference. |
| `DatePicker/DatePicker.tsx` | 0 / 0 | Deleted in first wave; no active date contract replaced. | Only its own barrel exported it. |
| `DeleteActionModal/DeleteActionModal.tsx` | 56 / 0 | Deleted the unused implementation, family index, and root export; no consumer changes. | At `becbf4813816bb3686111b2537009201b0a90c81`, no incoming implementation edge or external symbol reference remained. |
| `Divider/Divider.tsx` | 0 / 0 | Deleted in first wave; no consumer. | Only its own/root barrels exported it. |
| `Drawer/Drawer.tsx` | 0 / 0 | Deleted in first wave; no consumer. | Only its own/root barrels exported it. |
| `Dropdown/Dropdown.tsx` | 23 / 2 | V3 DropdownMenu; check checkbox/radio, submenu, disabled actions, and focus. | `frontend/src/pages/secret-scanning/SecretScanningFindingsPage/components/SecretScanningFindingRow.tsx:137` |
| `Editor/Editor.tsx` and private plugins | 0 / 0 | Deleted in first wave; no specialist workflow replaced. | No external reference to Editor or EditorHighlightPlugin. |
| `EmptyState/EmptyState.tsx` | 27 / 0 | V3 Empty; distinguish collection-empty, filtered-zero, loading, and permissions. | `frontend/src/pages/organization/GroupDetailsByIDPage/components/AddGroupProjectModal.tsx:172` |
| `FilterableSelect/FilterableSelect.tsx` | 20 / 0 | V3 Combobox; retain grouping, option rendering, async/loading, creation, and focus contracts. | `frontend/src/pages/organization/UserDetailsByIDPage/components/UserOrgMembershipModal.tsx:136` |
| `FontAwesomeSymbol/FontAwesomeSymbol.tsx` | 0 / 0 | Deleted in first wave; a previously retained capability has no consumer. | Only its own/root barrels exported it. |
| `FormControl/FormControl.tsx` | 123 / 2 | V3 Field composition; preserve IDs, labels, help/error associations, validation, and RHF integration. | `frontend/src/pages/secret-manager/SecretDashboardPage/components/DynamicSecretListView/MetadataForm.tsx:25` |
| `GenericFieldLabel/GenericFieldLabel.tsx` | 12 / 0 | V3 FieldLabel/Detail composition; verify label/control association and tooltips. | `frontend/src/pages/secret-scanning/SecretScanningFindingsPage/components/SecretScanningFindingRow.tsx:171` |
| `HeaderResizer/HeaderResizer.tsx` | 0 / 0 | Deleted in first wave; no consumer. | No incoming module edge or external symbol reference. |
| `HighlightText/index.tsx` | 0 / 0 | Deleted unused V2 re-export; canonical shared utility stays. | No incoming module edge; utility has independent consumers. |
| `HoverCard/HoverCard.tsx` | 0 / 0 | Deleted in first wave; no consumer. | No incoming module edge or external symbol reference. |
| `HoverCardv2/HoverCardv2.tsx` | 1 / 0 | Deleted the unused implementation, family index, and root export; no consumer changes. | At `becbf4813816bb3686111b2537009201b0a90c81`, no incoming implementation edge or external symbol reference remained. |
| `IconButton/IconButton.tsx` | 40 / 6 | V3 IconButton; preserve accessible names, disabled/pending state and triggers. | `frontend/src/pages/auth/CliRedirectPage/CliRedirectPage.tsx:66` |
| `Input/Input.tsx` | 100 / 4 | V3 Input/InputGroup; preserve refs, validation, type and adornment behavior. V3 Input applies the V2 `data-1p-ignore` default; an explicit `data-1p-ignore` is needed only where `autoComplete` names an email, password or username. | `frontend/src/pages/secret-manager/SecretDashboardPage/components/DynamicSecretListView/MetadataForm.tsx:58` |
| `Lottie/Lottie.tsx` | 1 / 0 | V3 Loader; remove entry/barrel chunk-order dependency with a production boot proof. | `frontend/src/main.tsx:83` |
| `Menu/Menu.tsx` | 1 / 0 | One remaining type reference; replace with actual V3 contract, then delete source/exports. | `frontend/src/layouts/OrganizationLayout/components/MenuIconButton/MenuIconButton.tsx:19` |
| `Modal/Modal.tsx` | 55 / 2 | V3 Dialog/Sheet chosen by form size; follow the overlay recipe for nested overlays, pending close, discard, mutation errors, and focus. | `frontend/src/pages/organization/AccessManagementPage/components/UpgradePrivilegeSystemModal/UpgradePrivilegeSystemModal.tsx:65` |
| `NoticeBanner/NoticeBanner.tsx` | 0 / 0 | Deleted in first wave; no consumer. | Only its own/root barrels exported it. |
| `NoticeBannerV2/NoticeBannerV2.tsx` | 2 / 0 | Deleted unused implementation, empty family index, and stale root export; no consumer changes. | At `e05f750eb36506dac9a599709055ffb33d5b58ab`, no incoming implementation edge or external symbol reference remained. The root barrel exported only the empty family index. |
| `PageHeader/PageHeader.tsx` | 32 / 0 | V3 PageHeader owns the normal 40px bottom boundary; remove only header-boundary compensation and preserve body spacing, actions, scopes and responsive intent. | `frontend/src/pages/organization/ProjectsPage/ProjectsPage.tsx:53` |
| `Pagination/Pagination.tsx` | 12 / 0 | V3 Pagination; preserve page origin, size change, counts, and filtering/reset behavior. | `frontend/src/pages/organization/GroupDetailsByIDPage/components/AddGroupProjectModal.tsx:163` |
| `PasswordGenerator/PasswordGenerator.tsx` | 0 / 0 | Deleted in first wave; V3 generator remains independent. | No external consumer; its private Slider also deleted. |
| `Popover/Popover.tsx` | 0 / 0 | Deleted in first wave; no consumer. | No incoming module edge or external symbol reference. |
| `Popoverv2/Popoverv2.tsx` | 0 / 1 | Deleted with unused DatePicker in first wave. | Only DatePicker referenced it outside its own family. |
| `RadioGroup/RadioGroup.tsx` | 0 / 0 | Deleted in first wave, including an obsolete commented import. | No actual incoming module edge or external symbol reference. |
| `SecretInput/SecretInput.tsx` | 1 / 0 | Deleted the unused implementation, family index, and root export; no consumer changes. | At `becbf4813816bb3686111b2537009201b0a90c81`, no incoming implementation edge or external symbol reference remained. |
| `SecretPathInput/SecretPathInput.tsx` | 12 / 0 | Deleted the unused V2 implementation and family index in this candidate, not yet on merged main. The independent V3 SecretPathInput and its consumers are unchanged; workflow parity remains a separate validation boundary. | No incoming module or declaration references at `13f5e7fe562a803a9b6de1d512cb27f67868ea6d`; no root export, computed/glob ingress, or top-level CSS import or executable initializer. |
| `Select/Select.tsx` and components | 58 / 0 | V3 Select/Combobox chosen by interaction; preserve option values and form semantics. | `frontend/src/pages/secret-scanning/SecretScanningFindingsPage/components/SecretScanningUpdateFindingModal.tsx:94` |
| `Skeleton/Skeleton.tsx` | 3 / 1 | V3 Skeleton; preserve meaningful loading shape and table ownership. | `frontend/src/views/PkiAlertsV2Page/components/ViewPkiAlertV2Modal.tsx:54` |
| `Slider/Slider.tsx` | 0 / 1 | Deleted with unused PasswordGenerator in first wave. | PasswordGenerator was its only external-family consumer. |
| `Spinner/Spinner.tsx` | 19 / 1 | V3 Spinner; preserve wait semantics, sizing, and caller disabling. | `frontend/src/pages/auth/SelectOrgPage/SelectOrgPage.tsx:346` |
| `Stepper/Stepper.tsx` | 0 / 0 | Deleted in first wave; no consumer. | Only its own/root barrels exported it. |
| `Switch/Switch.tsx` | 20 / 0 | Deleted the unused implementation, family index, and root export; no consumer changes. | At `becbf4813816bb3686111b2537009201b0a90c81`, no incoming implementation edge or external symbol reference remained. |
| `Table/Table.tsx` | 30 / 0 | V3 Table/DataGrid chosen by workflow; preserve selection, sort, resize, virtualization and pagination state. `TableSkeleton` maps to `TableSkeletonRows` (`columns`, optional `rows`; drop `innerKey`). Long-text columns that wrapped in V2 set `isWrappable` on each `TableCell`; otherwise V3 keeps cells on one line. | `frontend/src/pages/organization/GroupDetailsByIDPage/components/AddGroupProjectModal.tsx:109` |
| `Tabs/Tabs.tsx` | 10 / 0 | V3 Tabs; preserve controlled/default state, URL state, panel lifetime and keyboard navigation. | `frontend/src/pages/kms/SettingsPage/SettingsPage.tsx:33` |
| `Tag/Tag.tsx` | 3 / 0 | V3 Badge composition; preserve diff/status intent and accessible text. | `frontend/src/components/secrets/diff/FieldDiffRenderers.tsx:128` |
| `TextArea/TextArea.tsx` | 15 / 0 | V3 TextArea + Field; preserve controlled values, multiline input and validation. | `frontend/src/pages/cert-manager/ApprovalsPage/components/RequestsTab/RequestDetailModal.tsx:396` |
| `Tooltip/Tooltip.tsx` | 64 / 3 | V3 Tooltip; preserve providers, disabled triggers, long text and focus access. | `frontend/src/pages/root.tsx:53` |

First wave deletes **17 families / 35 files** plus their root exports. The candidate retains **35 families / 72 V2 files including the barrel**, and the same 312 external consumer files. These are candidate-worktree numbers until the PR is explicitly merged; the baseline does not change because a PR was opened.

## Product-surface coverage and order

Counts below are baseline runtime consumer files, excluding the one menu type-only consumer. Shared feature rows are separate from route rows, so a product migration must consider both. Follow the generated inventory for every file; the references below establish representative scope rather than an acceptance claim.

| Surface | Files | Source anchor | Migration unit and required checks |
| --- | ---: | --- | --- |
| Certificate Manager routes | 81 | `pages/cert-manager/PkiSubscribersPage/components/PkiSubscriberModal.tsx` | Split subscribers/issuance, authorities, applications, discovery and settings; preserve certificate mutations, validation, selection and permissions. |
| Secret Manager routes | 80 | `pages/secret-manager/integrations/SelectIntegrationAuthPage/SelectIntegrationAuthPage.tsx` | Integrations, settings, old dashboard, approvals; preserve hidden values, leases, bulk/table state and environment/path semantics. Held secret edit forms remain owned separately. |
| Organization routes | 53 | `pages/organization/UserDetailsByIDPage/components/UserOrgMembershipModal.tsx` | Groups/membership, projects/settings, auth policies; preserve RBAC and async form recovery. UpgradeGate held choices stay separate. |
| Secret Scanning routes | 23 | `pages/secret-scanning/SecretScanningFindingsPage/components/SecretScanningFindingRow.tsx` | Tables/detail/settings; preserve filtering, finding states, and mutations. Include the shared provider forms below. |
| PAM routes | 18 | `pages/pam/PamDiscoveryPage/PamDiscoveryPage.tsx` | Focused page headers, loading and confirmations; preserve org-scoped project resolution and access gates. |
| KMS routes | 13 | `pages/kms/OverviewPage/components/CmekEncryptModal.tsx` | Crypto operation overlays/settings; preserve operation-specific validation, masking and permission checks. |
| Authentication routes | 5 | `pages/auth/CliRedirectPage/CliRedirectPage.tsx` | Token display and recovery confirmations; verify masking, exact copy, no unintended reveal, and redirect lifetime. |
| Project routes | 2 | `pages/project/AuditLogsPage/AuditLogsPage.tsx` | PageHeader consumers; retain action placement and scope. |
| Agent Vault layout | 1 | `pages/agent-vault/layout.tsx` | Breadcrumb metadata; preserve implicit-project route contract. |
| Middleware and root | 2 | `pages/root.tsx` | Restriction action and TooltipProvider; prove application boot/provider lifetime. |
| Shared Secret Scanning features | 16 | `components/secret-scanning/forms/SecretScanningDataSourceForm.tsx` | Provider setup and connection/config fields; preserve RHF/Zod validation, async option lists and creation. |
| Shared rotation features | 6 | `components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/ViewSecretRotationV2GeneratedCredentials.tsx` | Warnings/credentials/confirmations; preserve masking, delete constraints and rotation contracts. Product API version is not a legacy UI exemption. |
| Shared PKI alerts view | 3 | `views/PkiAlertsV2Page/components/ViewPkiAlertV2Modal.tsx` | Tables/details and confirmations; preserve counts, filtering and modal state. |
| Shared approvals | 1 | `components/approvals/PolicyApprovalSteps.tsx` | Step configuration; preserve approver ordering, selections and validation. |
| Shared feature helpers | 1 | `components/features/TtlFormLabel.tsx` | Label composition; preserve TTL help and accessibility. |
| Shared integrations | 1 | `components/integrations/NoEnvironmentsBanner.tsx` | Remaining legacy action; preserve navigation and disabling. |
| Shared navigation | 1 | `components/navigation/SecretDashboardPathBreadcrumb.tsx` | Trigger/tooltip; preserve path selection and keyboard behavior. |
| Shared secret diff | 1 | `components/secrets/diff/FieldDiffRenderers.tsx` | Tags/tooltips; preserve before/after and hidden-value representation. |
| Shared tags | 1 | `components/tags/CreateTagModal/CreateTagModal.tsx` | Form/overlay; preserve validation, submit errors and caller selection. |
| Shared utilities | 1 | `components/utilities/certificateDisplayUtils.tsx` | Certificate status tooltip; preserve warning/status semantics and accessible content. |
| Application entry | 1 | `main.tsx` | Loader removal unit; production build and boot, not only dev/HMR/types. |

All source anchors in this surface table are relative to `frontend/src/`. Refresh the file inventory before allocating a unit; do not infer ownership from a product name alone.

### Additional legacy and compatibility boundaries

- `components/basic/InputField.tsx` is an unversioned legacy input, and `components/basic/Error.tsx` is a legacy error presentation used by `components/auth/Mfa.tsx`. Remove unused source or migrate the live caller; neither may be hidden by a rename.
- `components/integrations/NoEnvironmentsBanner.tsx`, `components/navigation/SecretDashboardPathBreadcrumb.tsx`, and `components/tags/CreateTagModal/CreateTagModal.tsx` are V2-dependent feature wrappers with no consuming module/symbol references at the baseline. Reverify and delete their unused implementation/export closure in a separate focused unit. The known outside-path completion gate includes these files.
- `pages/secret-manager/OverviewPage/components/SecretSearchInput/SecretSearchInput.tsx` and its barrel are an old Headless UI search control. Its sibling quick-search components are also consumed by the newer `ResourceSearchInput`; preserve those workflows while removing or replacing the old control.
- `legacy.css`, the legacy palette, is deleted. At `e434f2fdfdd608f97cd4041af84062991d2645cf` none of its color tokens had a literal utility, `--color-*` variable, `@apply` or `theme()` user in frontend sources, CSS, or config, so its default-palette overrides (`red`, `green`, `blue`, `yellow`) had no consumers either.
- The V3 `ReactSelect` compatibility family (`FilterableSelect`, `CreatableSelect`) is deleted. Its consumers moved to `Combobox`, and none remained at `e434f2fdfdd608f97cd4041af84062991d2645cf`. The `react-select` package is also removed. The last importer scan before its removal, at `60067d2ea820ff1fd008f3ac5818c9f86e616cdc`, found only the unused react-select `Option` wrappers `AppConnectionOption`, `RoleOption`, and `RelayOption`, which were deleted with the package. The live `AppConnectionOptionContent` and `RoleOptionContent` renderers remain.
- V3 `SecretInput`, `InfisicalSecretInput`, `SecretPathInput`, and `PasswordGenerator` have their own implementations. Compare security-sensitive behavior, not names. Removing unused V2 Editor/PasswordGenerator does not certify every active V3 editor flow.
- API/data versions such as `hooks/api/secretRotationsV2`, `BillingV2Page`, `PkiAlertsV2Page`, backend secret-v2 services and migration files are not automatically legacy UI. Their actual UI imports and implementations remain in scope; their legitimate API versions are not renamed.
- Third-party Radix, Lottie and Font Awesome packages have current non-V2 consumers. The Lexical editor packages (`lexical`, `@lexical/react`), whose only consumer was the deleted V2 Editor, and the unused `@dnd-kit/modifiers` are removed. A dependency is deleted only after its remaining ownership is proved; no package-name-based purge.

## Execution sequence and ownership

### PageHeader compatibility boundary

V3 `PageHeader` supplies the legacy normal bottom boundary through `mb-10`, so ordinary consumers need no repeated spacing prop. Existing marginless V3 pages must remove their header-boundary parent gap in the same change as the shared default. Their normal next-region spacing deliberately increases from 32px to 40px; this is harmonization, not pixel-identical parity. Keep card-to-card gaps in existing body containers, and group body regions only when multiple sections previously shared the page's gap.

Compact/responsive layouts remain explicit: Overview uses 24px below `md` and 40px above; Insights uses 16px below `dashboard` and 40px above. A narrow Insights stats strip remains its own region before the cards. General Secret Manager/KMS Settings remove only the body's header-boundary top padding, preserving bottom/horizontal padding and independent card spacing. Keep PAM's block flow so adjacent margins retain their collapsing behavior. Tabs and conditional notices are real next regions, not empty spacing to remove.

This contract does not certify source removal on merged main or workflow acceptance. The final five header-only consumers and legacy source/export deletion remain a separate dependent layer until verified and explicitly authorized to merge.

One owner controls each implementation family or domain unit. Domain writes run on isolated branches and may proceed in parallel only when their consumer files and shared replacements do not overlap. Shared primitives, the root barrel, and lifecycle decisions have an explicit owner. Recheck reservations and fetch `main` before each wave.

1. **Dead-source removal:** delete the proven 17-family closure and exports. Risk is low for functionality but the entry's known chunk-order coupling makes production build/boot mandatory. Do not change live defaults or dependencies.
2. **Startup and small-family closure:** replace entry Lottie, obsolete menu type, focused PageHeader/Breadcrumb and low-fanout presentation consumers. Verify local composition, theme and keyboard contracts, then remove a family only once every incoming path is gone.
3. **Isolated product waves:** migrate KMS, Secret Scanning, certificate subdomains, organization settings/membership, Secret Manager integrations/legacy dashboard and shared feature forms in separately owned reviewable slices. Bring missing V3 behavior into a prerequisite PR rather than widening every consumer PR.
4. **Overlays and high-fanout primitives:** resolve portal/toast/focus contracts, confirmation and discard behavior before bulk modal/menu work. Drain Button/Input/Field/Select/Table/Tabs/Tooltip consumers with their domains, then delete their implementation/export closure. No mass find-replace.
5. **Security and final closure:** validate specialist input/path/credentials and representative permission-denied/edit-without-value-read flows. Remove unnamed legacy source, old style dependencies, stale stories/docs and the final V2 barrel. Re-run completion checks on latest merged `main`.

At mission creation, held/reserved work is UpgradeGate (#8182, INFS-647), secret edit/comment sheets (#8407, INFS-643), AlertDialog/Button text (#8416, INFS-652), ESLint configuration (#8398, INFS-607), and toast/dialog selection and reverse-Tab proof (INFS-656). Do not duplicate their changes or resolve their held product decisions indirectly. The reported Sonner reverse-Tab issue is a parity blocker to solve, not permission to weaken accessibility.

Before each wave, record changed source paths, risk, state/security contracts, needed replacements, validation evidence and limits. Escalate real product/policy/security tradeoffs; mechanical migrations do not require redundant permission. Never remove user functionality to meet a source count.

### Overlay migration recipe

Use this recipe for every V2 `Modal`, `DeleteActionModal`, and `ConfirmActionModal` consumer. The V3 overlays own the shared behavior, so a consumer migration maps props and structure and adds no per-callsite Escape, focus, pending, or stacking code.

**What the V3 contract provides.** `DialogContent`, `SheetContent`, `AlertDialogContent`, and `ConfirmationAlertDialog` provide these behaviors without consumer code:

- **Innermost layer first.** Escape or an outside click closes an open nested popup first. The next Escape or outside click reaches the overlay. Radix popups (`Select`, `DropdownMenu`, `Tooltip`, `HoverCard`, `Popover`) do this natively. `Combobox` registers its open popup with the nearest `DialogContent`, `SheetContent`, `AlertDialogContent` (which includes `ConfirmationAlertDialog`), or `PopoverContent`, and an event that closed the popup cannot also close the overlay. Inside a `Dialog`, `Sheet`, or `AlertDialog`, `Combobox` defaults to `modal`. Inside a `Popover` that is not nested in one of those, it stays non-modal.
- **Pending close.** While `isPending` is true on `DialogContent` or `SheetContent`, Escape, outside clicks, the built-in close button, and every `DialogClose` or `SheetClose` cannot dismiss the overlay. `ConfirmationAlertDialog` locks itself while `onConfirm` is in flight, disables Cancel and the input, and shows the pending state on its confirm button.
- **Focus return.** Closing returns focus to the element that opened the overlay. When a V3 `DropdownMenuItem` opened it, focus returns to that menu's trigger. No refs or `onCloseAutoFocus` handlers are needed. If the opener no longer exists, for example a row removed by a successful delete, Radix's default applies.
- **Typed confirmation.** `ConfirmationAlertDialog` compares the typed value with `confirmKey`, resets it on every open and close, submits on Enter only when it matches, and keeps the dialog open if `onConfirm` rejects. The global mutation error toast reports the failure.

**Choose the target.**

| V2 | V3 target |
| --- | --- |
| `Modal` + `ModalContent` with a short form or prompt | `Dialog` + `DialogContent` |
| `Modal` + `ModalContent` with a large or multi-step form | `Sheet` + `SheetContent` (see `DESIGN.md`) |
| `DeleteActionModal` | `ConfirmationAlertDialog` from `@app/components/v3/platform` |
| `ConfirmActionModal` | `ConfirmationAlertDialog` with a non-danger `confirmVariant` |

**`Modal` and `ModalContent` mapping.**

| V2 | V3 |
| --- | --- |
| `<Modal isOpen={x} onOpenChange={fn}>` | `<Dialog open={x} onOpenChange={fn}>`. Keep the existing `usePopUp` handler and any `reset()` call. |
| `ModalTrigger`, `ModalClose` | `DialogTrigger`, `DialogClose` |
| `title` | `<DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>` |
| `subTitle` | `<DialogDescription>{subTitle}</DialogDescription>` inside `DialogHeader` |
| `footerContent`, or the button row at the end of the form | `<DialogFooter>` inside the `<form>`. Cancel is `<DialogClose asChild><Button variant="ghost">Cancel</Button></DialogClose>`. The primary button uses the scope variant (`org`, `sub-org`, `project`, ...) and `isPending={isSubmitting}`. |
| Submit button `isLoading` / `isDisabled={isSubmitting}` | `isPending={isSubmitting}` on the submit button, and `isPending={isSubmitting}` on `DialogContent` |
| `bodyClassName="overflow-visible"` | Remove. V3 popups portal out of the dialog. |
| `className="max-w-2xl"` and wider | Keep the V3 width. If the content needs more room, use `Sheet`. |
| `overlayClassName`, `showCloseButton` | Same props on `DialogContent` |
| `onEscapeKeyDown` that only protects a nested popup | Remove. Keep handlers that implement product behavior, such as a discard guard. |

V2 controls rendered inside the overlay move to V3 in the same change. A V2 `Select`, `FilterableSelect`, `Dropdown`, or `Tooltip` inside a V3 overlay does not join the layer contract. `FilterableSelect` becomes `Combobox`. Remove caller-owned `onPopupOpenChange` registries that only guard the parent Escape.

**Creating an option with a form.** Dialog creation renders `DialogHeader` followed by `renderForm`. Return `<form className="flex min-h-0 flex-1 flex-col gap-6">` with `DialogBody` for fields and `DialogFooter` for actions. Do not pad the whole form or replace the footer with an inset button row. The dialog shell supplies its padding and the footer extends to its edges, as in the Dialog stories.

Use `creation.mode = "sheet"` for multi-step forms, with the existing Sheet `size` (`form`, `wide`, or `workspace`). It uses the same `renderForm({ initialInput, complete, cancel })`, `isPending`, and `onDismiss(cancel)` contract as dialog creation. Return form content with a scrollable body and `SheetFooter`, not another `Sheet` or `SheetContent`. The default header requires `title` and `description`. Set `showHeader: false` when the form owns its header, and provide `SheetHeader`, `SheetTitle`, and `SheetDescription` inside `renderForm` for the accessible name and description. Follow the Header → body → Footer composition and body padding in the Sheet stories.

Use one caller-owned pending state for the form and `creation.isPending`, including sub-wizard persistence. Route `onDismiss` and the form's Cancel through the same discard guard. Update controlled options and selection before calling `complete`. Completion closes the creation overlay and returns focus to the Combobox input. Cancel preserves the query and reopens the option popup without changing the selection. See `Combobox.creation.stories.tsx` for canonical dialog and sheet compositions.

**Starting an in-place creation workflow.** Use `creation.mode = "action"` with `onAction(inputValue)` when the existing form switches into a sub-wizard without opening another overlay. The Create row remains available for empty, duplicate, and unmatched queries unless `isDisabled` is set. Selection closes only the picker and calls `onAction` with the trimmed query. This mode does not persist, track pending work, or select an option; the caller owns the workflow and any later option/selection updates.

Before:

```tsx
<Modal
  isOpen={popUp.orgMembership.isOpen}
  onOpenChange={(isOpen) => {
    handlePopUpToggle("orgMembership", isOpen);
    reset();
  }}
>
  <ModalContent bodyClassName="overflow-visible" title="Update Membership">
    <form onSubmit={handleSubmit(onFormSubmit)}>
      <FormControl label="Update Organization Role">
        <FilterableSelect options={roles} value={value} onChange={onChange} />
      </FormControl>
      <Button type="submit" isLoading={isSubmitting} isDisabled={isSubmitting}>
        Update
      </Button>
      <Button variant="plain" onClick={() => handlePopUpToggle("orgMembership", false)}>
        Cancel
      </Button>
    </form>
  </ModalContent>
</Modal>
```

After:

```tsx
<Dialog
  open={popUp.orgMembership.isOpen}
  onOpenChange={(isOpen) => {
    handlePopUpToggle("orgMembership", isOpen);
    reset();
  }}
>
  <DialogContent isPending={isSubmitting}>
    <DialogHeader>
      <DialogTitle>Update Membership</DialogTitle>
    </DialogHeader>
    <form className="flex flex-col gap-6" onSubmit={handleSubmit(onFormSubmit)}>
      <Field>
        <FieldLabel htmlFor={roleInputId}>Update Organization Role</FieldLabel>
        <Combobox id={roleInputId} options={roles} value={value} onValueChange={onChange} />
      </Field>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="ghost">Cancel</Button>
        </DialogClose>
        <Button type="submit" variant="org" isPending={isSubmitting}>
          Update
        </Button>
      </DialogFooter>
    </form>
  </DialogContent>
</Dialog>
```

**`DeleteActionModal` and `ConfirmActionModal` mapping.**

| V2 | `ConfirmationAlertDialog` |
| --- | --- |
| `isOpen` | `isOpen` |
| `onChange` | `onOpenChange` |
| `onClose` | Fold into `onOpenChange` when it receives `false` |
| `title` | `title` |
| `subTitle` | `description`. When V2 omitted it, pass `description="This action is irreversible."` to keep the shown copy. |
| `deleteKey` / `confirmKey` | `confirmKey` |
| `onDeleteApproved` / `onConfirmed` | `onConfirm`. Keep the existing close-on-success call inside it. |
| `buttonText` | `confirmLabel` (default `Delete`) |
| `buttonColorSchema="danger"` | Omit (default `confirmVariant="danger"`) |
| `buttonColorSchema="primary"`, or any `ConfirmActionModal` | `confirmVariant` with the scope variant, or `neutral` outside a scope |
| `children` | `children`, rendered after the confirmation field. Drop top margins that only spaced it from the V2 input. |
| `formContent` | `description` when it explains the action, otherwise `children` |
| `deletionMessage` / `confirmationMessage` | No consumer uses it. Raise a contract change before relying on custom label copy. |
| `isDisabled` | No consumer uses it. Use `isPending` for an external in-flight state. |

Before:

```tsx
<DeleteActionModal
  isOpen={popUp.removeMember.isOpen}
  title={`Are you sure you want to remove member with username ${username}?`}
  onChange={(isOpen) => handlePopUpToggle("removeMember", isOpen)}
  deleteKey="confirm"
  onDeleteApproved={() => onRemoveMemberSubmit(orgMembershipId)}
  buttonText="Remove"
/>
```

After:

```tsx
<ConfirmationAlertDialog
  isOpen={popUp.removeMember.isOpen}
  title={`Are you sure you want to remove member with username ${username}?`}
  description="This action is irreversible."
  onOpenChange={(isOpen) => handlePopUpToggle("removeMember", isOpen)}
  confirmKey="confirm"
  onConfirm={() => onRemoveMemberSubmit(orgMembershipId)}
  confirmLabel="Remove"
/>
```

**Edge cases to check in every sweep.**

- **No `autoFocus` inside V3 overlays.** `autoFocus` moves focus before the overlay records its opener, so focus cannot return on close. The overlay already focuses the first field.
- **Menu triggers.** Focus returns to a menu trigger only when the menu is a V3 `DropdownMenu`. When the trigger is still a V2 `Dropdown`, migrate that menu in the same change or record that focus returns to the page.
- **Chained confirmations.** If `onConfirm` opens a second dialog instead of closing, as `IntegrationsDetailsByIDPage` does, keep that control flow and check the second dialog's focus return.
- **Pending state outside the form.** If the mutation runs in the parent, pass the mutation's `isPending` to `DialogContent` or `ConfirmationAlertDialog`. Do not add `onOpenChange` guards.
- **Reset and discard.** Keep the consumer's `reset()` or state clearing on close. Radix unmounts closed content, so state inside the content subtree resets by itself. Add `useDiscardChangesGuard` only when the product asks for a dirty-form guard; V2 never had one.
- **Existing AlertDialog compositions** with `confirmationValue` lock while pending when the mutation's `isPending` is passed to `AlertDialog`: Escape, Cancel, the confirmation input, and Enter are disabled, and `AlertDialogAction` shows the pending state. New typed confirmations use `ConfirmationAlertDialog`, which is built on the same confirmation state.
- **Proof.** For each sweep, open each migrated overlay once in the preview: Escape with a nested popup open, Escape and an outside click while a mutation is pending, and focus after close.

## Completion acceptance

- All implementation PRs have landed through explicitly authorized merges. Refresh latest `origin/main`; report its exact commit and check a clean worktree, not a combined set of open branches.
- `audit-v2-ui.mjs --assert-zero` passes on that main commit. Review its detailed output and re-audit unversioned wrappers/feature primitives so the explicit outside-path list cannot conceal newly discovered legacy.
- The V2 source tree/barrel and every dead V2 helper are absent. No direct/deep/relative/dynamic/re-export path, alias, type dependency or V3 wrapper reaches a legacy implementation. Review file history/diffs for copied or cosmetically renamed code.
- Legacy styles and component-owned dependencies are removed after proving remaining consumer ownership. Legitimate API versions and independently supported V3 capabilities are disclosed rather than counted as UI exceptions.
- Focused lint/types/build checks pass at the accepted head. Representative real rendered flows establish RBAC, hidden-value security, mutations, validation, keyboard/focus, nested overlay and portal lifetime, table/virtualization state and any active date/editor contracts. Synthetic screenshots and fixtures are distinguished from authenticated acceptance.