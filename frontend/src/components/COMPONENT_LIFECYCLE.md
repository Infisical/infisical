# Shared component lifecycle ledger

This ledger records lifecycle decisions for the shared V2 and V3 component families at the PLATFOR-732 baseline. The inventory was refreshed after merging `main` on September 1, 2026. Evidence comes from component directories, barrel exports, Storybook stories, and source imports:

- V2 has 53 component directories, 43 barrel-exported modules, and no discovered stories because Storybook intentionally discovers V3 only.
- V3 has 51 generic component directories, 16 platform component directories, and 57 discovered stories.
- 443 source files import the V2 barrel and 1,370 import the V3 barrel.
- Production barrel imports include 55 V2 and 135 V3 `FilterableSelect` consumers, 7 `CreatableSelect` consumers, and 20 `Combobox` consumers.

Statuses are lifecycle decisions, not folder labels:

- **Currently deprecated:** the source annotation and Storybook metadata name an actionable replacement.
- **Safe to deprecate now:** a supported replacement covers the family; each annotation still needs a focused consumer check.
- **Deprecate after blocker:** replacement or migration parity is incomplete or unverified.
- **Retained intentionally:** the API is supported or has distinct ownership.
- **Unused/removal tracked separately:** zero-consumer candidates belong in cleanup work, not this deprecation pass.

## Deprecating a component

1. Verify a supported replacement covers representative consumers; otherwise record the blocker below.
2. Add `@deprecated` to the exported API with the replacement and migration limits.
3. Add the literal `deprecated` tag to the component's Storybook meta.
4. Update this ledger and run frontend validation plus the Storybook build.

Keep migrations and removals in separate work.

## V2 audit

| Status | Families | Evidence and next action |
| --- | --- | --- |
| Currently deprecated | FilterableSelect | Both V2 and V3 compatibility exports carry `@deprecated` guidance. Use V3 `Combobox` only where its contract fits. |
| Safe to deprecate now | Button, Card, Checkbox, EmptyState, IconButton, Input, Pagination, Select, Switch, TextArea, Tooltip | Supported V3 targets cover the observed contract and have canonical stories. Add annotations only in focused migration slices so guidance can name any consumer-specific adaptation. |
| Deprecate after blocker | Accordion, Alert, Blur, Breadcrumb, CopyButton, Dropdown, HoverCardv2, Skeleton, Spinner, Stepper, Table, Tabs | V3 targets exist, but representative consumers still need composition, interaction, or state-parity checks before the replacement guidance can be accurate. The remaining `HoverCardv2` consumer is the certificate discovery jobs table. |
| Deprecate after blocker | ConfirmActionModal, DeleteActionModal, Menu, Modal | Standardize each consumer on V3 `AlertDialog`, `Dialog`, `Dropdown`, or `Sheet`; verify typed confirmation, polymorphic menu-item usage, nested overlays, and close semantics first. |
| Deprecate after blocker | ContentLoader, Divider, FormControl, GenericFieldLabel, PageHeader, Tag | Migrate compositions to V3 `PageLoader`/`Skeleton`, `Separator`, `Field`, `PageHeader`, and `Badge`; prop and accessibility parity varies by consumer. |
| Deprecate after blocker | DatePicker | V3 has `Calendar`, but the composed input, popover, and date-value contract is not a drop-in replacement. |
| Deprecate after blocker | Editor, InfisicalSecretInput, SecretInput, SecretPathInput, PasswordGenerator | Security-sensitive or specialist behavior requires workflow-level parity validation before lifecycle changes. |
| Deprecate after blocker | NoticeBannerV2 | Three production consumers remain. Confirm that V3 `Alert` covers their layout and action requirements before adding replacement guidance. |
| Deprecate after blocker | Lottie | V3 `Loader` now owns the branded loading animation. `main.tsx` remains a deliberate V2 compatibility consumer until its entry-chunk constraint is resolved. |
| Retained intentionally | FontAwesomeSymbol, HighlightText, Slider | No supported V3 primitive currently replaces the distinct capability. Retain until a consumer-driven replacement is established. |
| Deprecate after blocker | Popoverv2 | `DatePicker` still consumes this compatibility implementation; migrate that composition before changing its lifecycle. |
| Unused/removal tracked separately | CreatableSelect, Drawer, HeaderResizer, HoverCard, NoticeBanner, Popover, RadioGroup | No production import was found. These are distinct from the supported V3 `ReactSelect/CreatableSelect` and the still-used V2 `HoverCardv2` and `Popoverv2`. Confirm dynamic or indirect use before removal in separate cleanup work. |

## V3 generic audit

| Status | Families | Evidence and next action |
| --- | --- | --- |
| Currently deprecated | ReactSelect/FilterableSelect | The `deprecated` Storybook tag and TypeScript annotation point to `Combobox`; the component remains available for feature parity until migration is complete. |
| Deprecate after blocker | ReactSelect/CreatableSelect | Inline creation is supported production behavior that `Combobox` does not implement. |
| Retained intentionally | Accordion, Alert, AlertDialog, AnimatedCollapse, Badge, Blur, Breadcrumb, Button, ButtonGroup, Calendar, Card, Checkbox, CodeBlock, ColorPicker, Combobox, Command, CopyButton, DataGrid, Detail, Dialog, Dropdown, DurationInput, Empty, Field, FileDropzone, HoverCard, IconButton, Input, InputGroup, Item, Label, Loader, Pagination, Popover, RadioGroup, ScrollableContent, Select, SelectedActionBar, Separator, Sheet, Sidebar, Skeleton, Spinner, Stepper, Switch, Table, Tabs, TextArea, Toast, Tooltip | Exported supported families. `CopyButton`, `DataGrid`, and `Sidebar` have no discovered story; that is documentation debt, not deprecation evidence. |

## V3 platform audit

| Status | Families | Evidence and next action |
| --- | --- | --- |
| Retained intentionally | AccessRestricted, DateRangeFilter, DeleteConfirmDialog, DocumentationLinkBadge, GatewayPicker, IdentityRoleBadges, LookingForOrgPageLink, OverflowBadgeList, PageHeader, PageLoader, PasswordGenerator, PermissionActionSelect, ProjectPermissionSubjects, ScopeIcons, SecretInput, SecretManagerResources, SecretPathInput, VerificationCode | These are supported domain-level components. `DateRangeFilter`, `GatewayPicker`, `IdentityRoleBadges`, `LookingForOrgPageLink`, `OverflowBadgeList`, `PasswordGenerator`, `PermissionActionSelect`, `ProjectPermissionSubjects`, `ScopeIcons`, `SecretInput`, `SecretManagerResources`, and `SecretPathInput` have no co-located discovered story; `PageLoader` is documented by the generic `Loader` story. These coverage gaps are not lifecycle warnings. |

## Follow-up rules

- Do not add blanket V2 annotations. Each annotation must name a supported target and the safe migration boundary.
- Treat grouped react-select options, custom option renderers, portal behavior, and inline creation as explicit parity checks.
- Track consumer migration, unused-code removal, and replacement implementation as separate work. This ticket does not remove V2 or mass-edit call sites.
- Re-run the inventory when barrels, stories, or shared component directories change, and update the evidence instead of inferring status from generation names.
