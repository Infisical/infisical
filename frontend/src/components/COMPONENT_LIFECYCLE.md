# Shared component lifecycle ledger

This ledger records lifecycle decisions that aren't obvious from component source or Storybook. Use the V3 barrel exports to find the current component catalog, and use V3 stories as the API and usage reference. A component not listed here has no special lifecycle decision recorded.

The [V3 migration ledger](V3_MIGRATION.md) tracks source removal, coverage, and validation. A blocked replacement is work to complete, not a permanent exemption. Keep supported behavior until its replacement is verified; completion requires deleting the legacy implementation and export surface.

## V2

| Components | Status | Direction |
| --- | --- | --- |
| All V2 families and the `@app/components/v2` root barrel | Removed | Deleted the remaining `Accordion`, `Alert`, `Button`, `Card`, `Checkbox`, `ContentLoader`, `CopyButton`, `Dropdown`, `EmptyState`, `FilterableSelect`, `FormControl`, `GenericFieldLabel`, `IconButton`, `Input`, `Modal`, `Pagination`, `Select`, `Skeleton`, `Spinner`, `Table`, `Tabs`, `Tag`, `TextArea`, and `Tooltip` implementations with the `components/v2` folder. At `e434f2fdfdd608f97cd4041af84062991d2645cf` their only external consumer was the root `TooltipProvider`, which now uses the V3 provider. Use the V3 replacements in the [V3 migration ledger](V3_MIGRATION.md#family-coverage); don't reintroduce V2 sources or imports. |

Earlier removals: `ConfirmActionModal`, `DeleteActionModal`, `HoverCardv2`, `SecretInput`, and `Switch` (no consumers at `becbf4813816bb3686111b2537009201b0a90c81`), `SecretPathInput`, `NoticeBannerV2`, and the 2026-10-04 first wave (`Blur`, `CreatableSelect`, `DatePicker`, `Divider`, `Drawer`, `Editor`, `FontAwesomeSymbol`, `HeaderResizer`, `HighlightText` re-export, `HoverCard`, `NoticeBanner`, `PasswordGenerator`, `Popover`, `Popoverv2`, `RadioGroup`, `Slider`, `Stepper`). The canonical shared `utilities/HighlightText` remains.

## V3

| Components                     | Status     | Direction                                                             |
| ------------------------------ | ---------- | --------------------------------------------------------------------- |
| `PageHeader` | Supported | Owns the normal 40px bottom boundary (`mb-10`). Remove header-boundary parent gaps and redundant caller margins when adopting it; preserve independent body/card spacing in body containers. `className` supports intentional compact/responsive boundaries. See its spacing stories. |
| `ReactSelect/FilterableSelect`, `ReactSelect/CreatableSelect` | Removed | Deleted the compatibility directory and its `generic/index.ts` export. No consumers remained at `e434f2fdfdd608f97cd4041af84062991d2645cf`. Use `Combobox`, with inline `creation` for values needing no metadata or dialog `creation` for caller-owned forms and persistence. |

## Updating the ledger

- Add `@deprecated` to the exported API with a supported replacement and any migration limits.
- Add the `deprecated` tag to the component's Storybook metadata when a story exists.
- Keep deprecation, consumer migration, and removal as separate changes unless the task explicitly combines them.
