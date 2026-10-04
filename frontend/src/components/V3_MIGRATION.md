# V3 UI removal ledger

The migration is complete only when the legacy UI implementations, exports, imports, aliases, and private dependencies are removed from the latest `main`. Migrating a consumer in an open PR does not mean its legacy family is removed on `main`. Moving an implementation into V3, renaming it, or wrapping it does not establish parity or removal.

## Baseline and measurement

Baseline: `infisical/infisical` `origin/main` **70e06365043ae3b6f49ef6c95a8b9997b20f4a34**, fetched **2026-10-04**. The September 24 design audit is historical context, not current acceptance evidence.

The baseline contains **52 V2 families**, **106 family source files plus the root barrel**, and **312 distinct external consumer files**. Of those consumer files, 311 have runtime references; the remaining file uses a legacy menu type. Counts include layouts, shared features, entry code, and type dependencies, not just JSX tags. Families overlap across consumers, so table rows must not be summed into a consumer-file total.

Inventory used TypeScript 5.6.3 module resolution with the frontend tsconfig, compiler-resolved symbol declarations, import/export edges, and actual identifier references. Both alias and relative paths, deep imports, re-exports, namespace imports, stories, tests, JS/config sources, and dynamic imports were inspected. No V3-to-V2 import/export ingress or computed dynamic import was found at this baseline. This proves source relationships, not interaction parity or authenticated acceptance.

Regenerate the current import/export and family inventory from the repository root:

```sh
node frontend/scripts/audit-v2-ui.mjs > v2-ui-inventory.json
node frontend/scripts/audit-v2-ui.mjs --assert-zero > v2-ui-completion.json
```

The script inspects tracked and nonignored untracked frontend JS/TS sources. It resolves imports through the configured aliases and records original declarations for named/default bindings, including aliases through another barrel. Its JSON includes every legacy module edge and binding, external consumers, V3 ingress, unresolved/computed dynamic imports, and additional known legacy source paths. Its `head` and `workingTree` fields distinguish a clean baseline from a local candidate. Outputs are local audit artifacts, not files to commit.

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
| `ConfirmActionModal/ConfirmActionModal.tsx` | 2 / 0 | V3 AlertDialog; verify async confirmation, errors, focus, and close. | `frontend/src/pages/auth/AccountRecoveryResetPage/AccountRecoveryResetPage.tsx:94` |
| `ContentLoader/ContentLoader.tsx` | 12 / 0 | V3 Loader/PageLoader composition; preserve pending boundaries. | `frontend/src/pages/auth/SelectOrgPage/SelectOrgPage.tsx:446` |
| `CopyButton/CopyButton.tsx` | 2 / 0 | V3 CopyButton; verify exact copy, failure feedback, and labels. | `frontend/src/pages/cert-manager/CertificateDetailsByIDPage/components/CertificateDetailsSection.tsx:275` |
| `CreatableSelect/CreatableSelect.tsx` | 0 / 0 | Deleted in first wave; no consumer. | No incoming non-export edge or external symbol reference. |
| `DatePicker/DatePicker.tsx` | 0 / 0 | Deleted in first wave; no active date contract replaced. | Only its own barrel exported it. |
| `DeleteActionModal/DeleteActionModal.tsx` | 56 / 0 | V3 AlertDialog; preserve confirmation gates, mutations, cleanup, and error recovery. | `frontend/src/pages/organization/AccessManagementPage/components/OrgGroupsTab/components/OrgGroupsSection/OrgGroupsSection.tsx:121` |
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
| `HoverCardv2/HoverCardv2.tsx` | 1 / 0 | V3 HoverCard; verify trigger, rich content, placement, and focus access. | `frontend/src/pages/cert-manager/DiscoveryPage/components/DiscoveryJobsTab.tsx:154` |
| `IconButton/IconButton.tsx` | 40 / 6 | V3 IconButton; preserve accessible names, disabled/pending state and triggers. | `frontend/src/pages/auth/CliRedirectPage/CliRedirectPage.tsx:66` |
| `Input/Input.tsx` | 100 / 4 | V3 Input/InputGroup; preserve refs, validation, type and adornment behavior. | `frontend/src/pages/secret-manager/SecretDashboardPage/components/DynamicSecretListView/MetadataForm.tsx:58` |
| `Lottie/Lottie.tsx` | 1 / 0 | V3 Loader; remove entry/barrel chunk-order dependency with a production boot proof. | `frontend/src/main.tsx:83` |
| `Menu/Menu.tsx` | 1 / 0 | One remaining type reference; replace with actual V3 contract, then delete source/exports. | `frontend/src/layouts/OrganizationLayout/components/MenuIconButton/MenuIconButton.tsx:19` |
| `Modal/Modal.tsx` | 55 / 2 | V3 Dialog/Sheet chosen by form size; verify nested overlays, portal lifetime, close/discard, mutation errors, and focus. | `frontend/src/pages/organization/AccessManagementPage/components/UpgradePrivilegeSystemModal/UpgradePrivilegeSystemModal.tsx:65` |
| `NoticeBanner/NoticeBanner.tsx` | 0 / 0 | Deleted in first wave; no consumer. | Only its own/root barrels exported it. |
| `NoticeBannerV2/NoticeBannerV2.tsx` | 2 / 0 | V3 Alert composition; preserve warnings and associated actions. | `frontend/src/components/secret-rotations-v2/ViewSecretRotationV2GeneratedCredentials/ViewSecretRotationV2GeneratedCredentials.tsx:273` |
| `PageHeader/PageHeader.tsx` | 32 / 0 | V3 PageHeader; preserve action slots, scope icons, responsive behavior, and caller spacing. | `frontend/src/pages/organization/ProjectsPage/ProjectsPage.tsx:53` |
| `Pagination/Pagination.tsx` | 12 / 0 | V3 Pagination; preserve page origin, size change, counts, and filtering/reset behavior. | `frontend/src/pages/organization/GroupDetailsByIDPage/components/AddGroupProjectModal.tsx:163` |
| `PasswordGenerator/PasswordGenerator.tsx` | 0 / 0 | Deleted in first wave; V3 generator remains independent. | No external consumer; its private Slider also deleted. |
| `Popover/Popover.tsx` | 0 / 0 | Deleted in first wave; no consumer. | No incoming module edge or external symbol reference. |
| `Popoverv2/Popoverv2.tsx` | 0 / 1 | Deleted with unused DatePicker in first wave. | Only DatePicker referenced it outside its own family. |
| `RadioGroup/RadioGroup.tsx` | 0 / 0 | Deleted in first wave, including an obsolete commented import. | No actual incoming module edge or external symbol reference. |
| `SecretInput/SecretInput.tsx` | 1 / 0 | V3 specialist input; preserve masking, permission boundaries, reveal, copy, and ref behavior. | `frontend/src/pages/auth/CliRedirectPage/CliRedirectPage.tsx:64` |
| `SecretPathInput/SecretPathInput.tsx` | 12 / 0 | V3 SecretPathInput; verify environment/path selection, permission filtering, loading, and controlled values. | `frontend/src/pages/secret-manager/integrations/RundeckConfigurePage/RundeckConfigurePage.tsx:161` |
| `Select/Select.tsx` and components | 58 / 0 | V3 Select/Combobox chosen by interaction; preserve option values and form semantics. | `frontend/src/pages/secret-scanning/SecretScanningFindingsPage/components/SecretScanningUpdateFindingModal.tsx:94` |
| `Skeleton/Skeleton.tsx` | 3 / 1 | V3 Skeleton; preserve meaningful loading shape and table ownership. | `frontend/src/views/PkiAlertsV2Page/components/ViewPkiAlertV2Modal.tsx:54` |
| `Slider/Slider.tsx` | 0 / 1 | Deleted with unused PasswordGenerator in first wave. | PasswordGenerator was its only external-family consumer. |
| `Spinner/Spinner.tsx` | 19 / 1 | V3 Spinner; preserve wait semantics, sizing, and caller disabling. | `frontend/src/pages/auth/SelectOrgPage/SelectOrgPage.tsx:346` |
| `Stepper/Stepper.tsx` | 0 / 0 | Deleted in first wave; no consumer. | Only its own/root barrels exported it. |
| `Switch/Switch.tsx` | 20 / 0 | V3 Toggle; preserve checked/value contract, labels, disabled and mutation state. | `frontend/src/components/secret-rotations-v2/DeleteSecretRotationV2Modal.tsx:66` |
| `Table/Table.tsx` | 30 / 0 | V3 Table/DataGrid chosen by workflow; preserve selection, sort, resize, virtualization and pagination state. | `frontend/src/pages/organization/GroupDetailsByIDPage/components/AddGroupProjectModal.tsx:109` |
| `Tabs/Tabs.tsx` | 10 / 0 | V3 Tabs; preserve controlled/default state, URL state, panel lifetime and keyboard navigation. | `frontend/src/pages/kms/SettingsPage/SettingsPage.tsx:33` |
| `Tag/Tag.tsx` | 3 / 0 | V3 Badge composition; preserve diff/status intent and accessible text. | `frontend/src/components/secrets/diff/FieldDiffRenderers.tsx:128` |
| `TextArea/TextArea.tsx` | 15 / 0 | V3 TextArea + Field; preserve controlled values, multiline input and validation. | `frontend/src/pages/organization/SettingsPage/components/ProjectTemplatesTab/components/ProjectTemplateDetailsModal.tsx:159` |
| `Tooltip/Tooltip.tsx` | 64 / 3 | V3 Tooltip; preserve providers, disabled triggers, long text and focus access. | `frontend/src/pages/root.tsx:53` |

First wave deletes **17 families / 35 files** plus their root exports. The candidate retains **35 families / 72 V2 files including the barrel**, and the same 312 external consumer files. These are candidate-worktree numbers until the PR is explicitly merged; the baseline does not change because a PR was opened.

## Product-surface coverage and order

Counts below are baseline runtime consumer files, excluding the one menu type-only consumer. Shared feature rows are separate from route rows, so a product migration must consider both. Follow the generated inventory for every file; the references below establish representative scope rather than an acceptance claim.

| Surface | Files | Source anchor | Migration unit and required checks |
| --- | ---: | --- | --- |
| Certificate Manager routes | 81 | `pages/cert-manager/PkiSubscribersPage/components/PkiSubscriberModal.tsx` | Split subscribers/issuance, authorities, applications, discovery and settings; preserve certificate mutations, validation, selection and permissions. |
| Secret Manager routes | 80 | `pages/secret-manager/integrations/SelectIntegrationAuthPage/SelectIntegrationAuthPage.tsx` | Integrations, settings, old dashboard, approvals; preserve hidden values, leases, bulk/table state and environment/path semantics. Held secret edit forms remain owned separately. |
| Organization routes | 53 | `pages/organization/SettingsPage/components/ProjectTemplatesTab/components/ProjectTemplateDetailsModal.tsx` | Groups/membership, projects/settings, auth policies; preserve RBAC and async form recovery. UpgradeGate held choices stay separate. |
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
- `legacy.css`, imported by `index.css`, is the legacy palette. Migrate all remaining utility consumers before deleting it; deleting V2 React files alone is not a token cleanup proof.
- V3 `ReactSelect` is an independently implemented, token-based compatibility family, not a wrapper importing V2. Its deprecated status does not make every current consumer a V2 import. Do not use it as a cosmetic shortcut to avoid verifying Combobox behavior. Record custom option/group/creation/portal contracts and any replacement work before retiring `react-select`.
- V3 `SecretInput`, `InfisicalSecretInput`, `SecretPathInput`, and `PasswordGenerator` have their own implementations. Compare security-sensitive behavior, not names. Removing unused V2 Editor/PasswordGenerator does not certify every active V3 editor flow.
- API/data versions such as `hooks/api/secretRotationsV2`, `BillingV2Page`, `PkiAlertsV2Page`, backend secret-v2 services and migration files are not automatically legacy UI. Their actual UI imports and implementations remain in scope; their legitimate API versions are not renamed.
- Third-party Radix, Lexical, Lottie, Font Awesome and react-select packages have current non-V2 consumers. A dependency is deleted only after its remaining ownership is proved; no package-name-based purge.

## Execution sequence and ownership

One owner controls each implementation family or domain unit. Domain writes run on isolated branches and may proceed in parallel only when their consumer files and shared replacements do not overlap. Shared primitives, the root barrel, and lifecycle decisions have an explicit owner. Recheck reservations and fetch `main` before each wave.

1. **Dead-source removal:** delete the proven 17-family closure and exports. Risk is low for functionality but the entry's known chunk-order coupling makes production build/boot mandatory. Do not change live defaults or dependencies.
2. **Startup and small-family closure:** replace entry Lottie, obsolete menu type, focused PageHeader/Breadcrumb and low-fanout presentation consumers. Verify local composition, theme and keyboard contracts, then remove a family only once every incoming path is gone.
3. **Isolated product waves:** migrate KMS, Secret Scanning, certificate subdomains, organization settings/membership, Secret Manager integrations/legacy dashboard and shared feature forms in separately owned reviewable slices. Bring missing V3 behavior into a prerequisite PR rather than widening every consumer PR.
4. **Overlays and high-fanout primitives:** resolve portal/toast/focus contracts, confirmation and discard behavior before bulk modal/menu work. Drain Button/Input/Field/Select/Table/Tabs/Tooltip consumers with their domains, then delete their implementation/export closure. No mass find-replace.
5. **Security and final closure:** validate specialist input/path/credentials and representative permission-denied/edit-without-value-read flows. Remove unnamed legacy source, old style dependencies, stale stories/docs and the final V2 barrel. Re-run completion checks on latest merged `main`.

At mission creation, held/reserved work is UpgradeGate (#8182, INFS-647), secret edit/comment sheets (#8407, INFS-643), AlertDialog/Button text (#8416, INFS-652), ESLint configuration (#8398, INFS-607), and toast/dialog selection and reverse-Tab proof (INFS-656). Do not duplicate their changes or resolve their held product decisions indirectly. The reported Sonner reverse-Tab issue is a parity blocker to solve, not permission to weaken accessibility.

Before each wave, record changed source paths, risk, state/security contracts, needed replacements, validation evidence and limits. Escalate real product/policy/security tradeoffs; mechanical migrations do not require redundant permission. Never remove user functionality to meet a source count.

## Completion acceptance

- All implementation PRs have landed through explicitly authorized merges. Refresh latest `origin/main`; report its exact commit and check a clean worktree, not a combined set of open branches.
- `audit-v2-ui.mjs --assert-zero` passes on that main commit. Review its detailed output and re-audit unversioned wrappers/feature primitives so the explicit outside-path list cannot conceal newly discovered legacy.
- The V2 source tree/barrel and every dead V2 helper are absent. No direct/deep/relative/dynamic/re-export path, alias, type dependency or V3 wrapper reaches a legacy implementation. Review file history/diffs for copied or cosmetically renamed code.
- Legacy styles and component-owned dependencies are removed after proving remaining consumer ownership. Legitimate API versions and independently supported V3 capabilities are disclosed rather than counted as UI exceptions.
- Focused lint/types/build checks pass at the accepted head. Representative real rendered flows establish RBAC, hidden-value security, mutations, validation, keyboard/focus, nested overlay and portal lifetime, table/virtualization state and any active date/editor contracts. Synthetic screenshots and fixtures are distinguished from authenticated acceptance.
- This ledger, lifecycle guidance, stories and design references reflect actual removed-on-main progress. An unresolved V2 family means the mission is **not complete**. Merge, preview deployment and production rollout are reported separately; no rollout claim follows from CI alone.
