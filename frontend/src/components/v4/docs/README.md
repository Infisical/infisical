# v4 guidelines

Usage guidelines for each Infisical 2.0 component and pattern. Read [`../DESIGN.md`](../DESIGN.md) first for the brand book (voice, color, type, shape, spacing, states, motion, iconography and logo). Installed primitives render at `/design-system`.

Each page opens with its v4 status:

- **Implemented**: the shadcn Radix primitive in `ui/` covers the core behavior, restyled by `v4.css`. Its props keep shadcn names, so map the "You provide" list onto them.
- **Partly implemented**: the primitive is installed, and the page names what still has to be built on top of it.
- **Not yet implemented**: no v4 code yet. The page describes the target behavior for whoever builds it.

The "You provide" lists come from the 2.0 reference implementation. Treat them as the behavior a component needs, not as the shadcn primitive's props.

## Components

| Guideline | Status | Primitive |
| --- | --- | --- |
| [Alert](components/alert.md) | Partly implemented | [`ui/alert.tsx`](../ui/alert.tsx) |
| [AlertDialog](components/alert-dialog.md) | Implemented | [`ui/alert-dialog.tsx`](../ui/alert-dialog.tsx) |
| [AnimatedCollapse](components/animated-collapse.md) | Partly implemented | [`ui/collapsible.tsx`](../ui/collapsible.tsx) |
| [Announcements](components/announcements.md) | Not yet implemented |  |
| [Avatar](components/avatar.md) | Partly implemented | [`ui/avatar.tsx`](../ui/avatar.tsx) |
| [Badge](components/badge.md) | Implemented | [`ui/badge.tsx`](../ui/badge.tsx) |
| [Breadcrumb](components/breadcrumb.md) | Partly implemented | [`ui/breadcrumb.tsx`](../ui/breadcrumb.tsx) |
| [Button](components/button.md) | Partly implemented | [`ui/button.tsx`](../ui/button.tsx) |
| [ButtonGroup](components/button-group.md) | Implemented | [`ui/button-group.tsx`](../ui/button-group.tsx) |
| [Card](components/card.md) | Partly implemented | [`ui/card.tsx`](../ui/card.tsx) |
| [Checkbox](components/checkbox.md) | Implemented | [`ui/checkbox.tsx`](../ui/checkbox.tsx) |
| [Code](components/code.md) | Not yet implemented |  |
| [CodeBlock](components/code-block.md) | Not yet implemented |  |
| [Combobox](components/combobox.md) | Implemented | [`ui/combobox.tsx`](../ui/combobox.tsx) |
| [CommandMenu](components/command-menu.md) | Partly implemented | [`ui/command.tsx`](../ui/command.tsx) |
| [DataGrid](components/data-grid.md) | Not yet implemented |  |
| [Dialog](components/dialog.md) | Implemented | [`ui/dialog.tsx`](../ui/dialog.tsx) |
| [DropdownMenu](components/dropdown-menu.md) | Implemented | [`ui/dropdown-menu.tsx`](../ui/dropdown-menu.tsx) |
| [EmptyState](components/empty-state.md) | Implemented | [`ui/empty.tsx`](../ui/empty.tsx) |
| [Field](components/field.md) | Implemented | [`ui/field.tsx`](../ui/field.tsx) |
| [FileTree](components/file-tree.md) | Not yet implemented |  |
| [FloatingActionBar](components/floating-action-bar.md) | Not yet implemented |  |
| [Icon](components/icon.md) | Not yet implemented |  |
| [Input](components/input.md) | Implemented | [`ui/input.tsx`](../ui/input.tsx) |
| [InputGroup](components/input-group.md) | Implemented | [`ui/input-group.tsx`](../ui/input-group.tsx) |
| [Item](components/item.md) | Implemented | [`ui/item.tsx`](../ui/item.tsx) |
| [Json](components/json.md) | Not yet implemented |  |
| [Kbd](components/kbd.md) | Implemented | [`ui/kbd.tsx`](../ui/kbd.tsx) |
| [List](components/list.md) | Not yet implemented |  |
| [Loader](components/loader.md) | Not yet implemented |  |
| [MiddleTruncate](components/middle-truncate.md) | Not yet implemented |  |
| [MultiSelect](components/multi-select.md) | Not yet implemented |  |
| [MultiStep](components/multi-step.md) | Not yet implemented |  |
| [PageHeader](components/page-header.md) | Not yet implemented |  |
| [Pagination](components/pagination.md) | Implemented | [`ui/pagination.tsx`](../ui/pagination.tsx) |
| [Popover](components/popover.md) | Implemented | [`ui/popover.tsx`](../ui/popover.tsx) |
| [Progress](components/progress.md) | Implemented | [`ui/progress.tsx`](../ui/progress.tsx) |
| [Select](components/select.md) | Implemented | [`ui/select.tsx`](../ui/select.tsx) |
| [Separator](components/separator.md) | Implemented | [`ui/separator.tsx`](../ui/separator.tsx) |
| [SettingsCard](components/settings-card.md) | Not yet implemented |  |
| [Sheet](components/sheet.md) | Implemented | [`ui/sheet.tsx`](../ui/sheet.tsx) |
| [Sidebar](components/sidebar.md) | Partly implemented | [`ui/sidebar.tsx`](../ui/sidebar.tsx) |
| [Skeleton](components/skeleton.md) | Implemented | [`ui/skeleton.tsx`](../ui/skeleton.tsx) |
| [Snippet](components/snippet.md) | Not yet implemented |  |
| [Spinner](components/spinner.md) | Partly implemented | [`ui/spinner.tsx`](../ui/spinner.tsx) |
| [Switch](components/switch.md) | Implemented | [`ui/switch.tsx`](../ui/switch.tsx) |
| [Table](components/table.md) | Partly implemented | [`ui/table.tsx`](../ui/table.tsx) |
| [Tabs](components/tabs.md) | Implemented | [`ui/tabs.tsx`](../ui/tabs.tsx) |
| [Toast](components/toast.md) | Implemented | [`ui/sonner.tsx`](../ui/sonner.tsx) |
| [Tooltip](components/tooltip.md) | Implemented | [`ui/tooltip.tsx`](../ui/tooltip.tsx) |
| [TopBar](components/top-bar.md) | Not yet implemented |  |

## Patterns

Patterns compose List and Item rows rather than being components of their own.

| Guideline | Status | Primitive |
| --- | --- | --- |
| [AccessList](patterns/access-list.md) | Not yet implemented |  |
| [ActivityLog](patterns/activity-log.md) | Not yet implemented |  |
| [ApprovalQueue](patterns/approval-queue.md) | Not yet implemented |  |
