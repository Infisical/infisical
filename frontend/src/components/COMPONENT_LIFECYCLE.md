# Shared component lifecycle ledger

This ledger records lifecycle decisions that aren't obvious from component source or Storybook. Use the V2 and V3 barrel exports to find the current component catalog, and use V3 stories as the API and usage reference. A component not listed here has no special lifecycle decision recorded.

The [V3 migration ledger](V3_MIGRATION.md) tracks source removal, coverage, and validation. A blocked replacement is work to complete, not a permanent exemption. Keep supported behavior until its replacement is verified; completion requires deleting the legacy implementation and export surface.

## V2

| Components                                                                                                                             | Status                        | Direction                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `FilterableSelect`                                                                                                                     | Deprecated                    | Use V3 `Combobox` where its contract fits.                                                                    |
| `Button`, `Card`, `Checkbox`, `EmptyState`, `IconButton`, `Input`, `Pagination`, `Select`, `Switch`, `TextArea`, `Tooltip`             | Ready for focused deprecation | Supported V3 replacements exist. Check representative consumers before adding component-specific guidance.    |
| `Accordion`, `Alert`, `CopyButton`, `Dropdown`, `HoverCardv2`, `Skeleton`, `Spinner`, `Table`, `Tabs` | Blocked                       | Composition, interaction, or state parity still needs verification.                                           |
| `ConfirmActionModal`, `DeleteActionModal` | Deprecated | Use V3 `ConfirmationAlertDialog` and follow the overlay recipe in the [V3 migration ledger](V3_MIGRATION.md#overlay-migration-recipe). `ConfirmActionModal` has no remaining consumers. The last `DeleteActionModal` consumer is under Secret Scanning, so removal waits for that area. |
| `Modal` | Ready for focused deprecation | Follow the overlay recipe in the [V3 migration ledger](V3_MIGRATION.md#overlay-migration-recipe). |
| `ContentLoader`, `FormControl`, `GenericFieldLabel`, `Tag`                                                    | Blocked                       | The V3 replacements require consumer-specific composition or accessibility changes.                           |
| `SecretInput`                                                | Blocked                       | Security-sensitive or specialist behavior needs workflow-level parity validation.                             |
| `SecretPathInput` | Removed in candidate | Deleted the unused V2 implementation and family index. No incoming module or declaration references remained at `13f5e7fe562a803a9b6de1d512cb27f67868ea6d`. The independent V3 implementation and its consumers are unchanged; this does not certify workflow parity or removal on merged main. |
| `NoticeBannerV2` | Removed | Deleted the unused implementation, empty family index, and stale root export. No external or internal consumers remained at `e05f750eb36506dac9a599709055ffb33d5b58ab`. |

### Removed unused V2 families

The 2026-10-04 source audit found no external consumers of `Blur`, `CreatableSelect`, `DatePicker`, `Divider`, `Drawer`, `Editor`, `FontAwesomeSymbol`, `HeaderResizer`, `HighlightText`, `HoverCard`, `NoticeBanner`, `PasswordGenerator`, `Popover`, `RadioGroup`, or `Stepper`. `Popoverv2` was used only by the unused `DatePicker`; `Slider` was used only by the unused `PasswordGenerator`. Their implementations, private helpers, and exports have been deleted. The canonical shared `utilities/HighlightText` remains; only its unused V2 re-export was removed. No active date-input or specialist editor contract was replaced in this cleanup.

## V3

| Components                     | Status     | Direction                                                             |
| ------------------------------ | ---------- | --------------------------------------------------------------------- |
| `PageHeader` | Supported | Owns the normal 40px bottom boundary (`mb-10`). Remove header-boundary parent gaps and redundant caller margins when adopting it; preserve independent body/card spacing in body containers. `className` supports intentional compact/responsive boundaries. See its spacing stories. |
| `DeleteConfirmDialog` | Deprecated | Renamed to `ConfirmationAlertDialog`, which also covers non-delete confirms. The alias stays only so in-flight branches compile; remove it once no import remains. |
| `ReactSelect/FilterableSelect` | Deprecated | Use `Combobox`; keep compatibility available while consumers migrate. |
| `ReactSelect/CreatableSelect`  | Deprecated | Use `Combobox` with inline `creation` for values needing no metadata, or dialog `creation` for caller-owned forms and persistence. Keep compatibility for react-select-specific component overrides; migrate consumers separately. |

## V4

| Components | Status | Direction |
| --- | --- | --- |
| `v4` | Incubating | Infisical 2.0 source of truth, fenced from product code. Radix primitives live in `v4/ui` and are restyled by `v4.css`. The docs chrome is the public `/design-system` route. Do not import `@app/components/v4` from product pages. |

## Updating the ledger

- Add `@deprecated` to the exported API with a supported replacement and any migration limits.
- Add the `deprecated` tag to the component's Storybook metadata when a story exists.
- Keep deprecation, consumer migration, and removal as separate changes unless the task explicitly combines them.
