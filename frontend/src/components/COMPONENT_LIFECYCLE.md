# Shared component lifecycle ledger

This ledger records lifecycle decisions that aren't obvious from component source or Storybook. Use the V2 and V3 barrel exports to find the current component catalog, and use V3 stories as the API and usage reference. A component not listed here has no special lifecycle decision recorded.

The [V3 migration ledger](V3_MIGRATION.md) tracks source removal, coverage, and validation. A blocked replacement is work to complete, not a permanent exemption. Keep supported behavior until its replacement is verified; completion requires deleting the legacy implementation and export surface.

## V2

| Components                                                                                                                             | Status                        | Direction                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `FilterableSelect`                                                                                                                     | Deprecated                    | Use V3 `Combobox` where its contract fits.                                                                    |
| `Button`, `Card`, `Checkbox`, `EmptyState`, `IconButton`, `Input`, `Pagination`, `Select`, `Switch`, `TextArea`, `Tooltip`             | Ready for focused deprecation | Supported V3 replacements exist. Check representative consumers before adding component-specific guidance.    |
| `Accordion`, `Alert`, `Breadcrumb`, `CopyButton`, `Dropdown`, `HoverCardv2`, `Skeleton`, `Spinner`, `Table`, `Tabs` | Blocked                       | Composition, interaction, or state parity still needs verification.                                           |
| `ConfirmActionModal`, `DeleteActionModal`, `Menu`, `Modal`                                                                             | Blocked                       | Verify confirmation, menu-item, nested-overlay, and close behavior before directing consumers to V3 overlays. |
| `ContentLoader`, `FormControl`, `GenericFieldLabel`, `Tag`                                                    | Blocked                       | The V3 replacements require consumer-specific composition or accessibility changes.                           |
| `SecretInput`, `SecretPathInput`                                                | Blocked                       | Security-sensitive or specialist behavior needs workflow-level parity validation.                             |
| `NoticeBannerV2`                                                                                                                       | Blocked                       | Verify that V3 `Alert` covers existing layout and action requirements.                                        |
| `Lottie`                                                                                                                               | Blocked                       | V3 `Loader` is the replacement, but the application entry point still needs the V2 compatibility path.        |

### Removed unused V2 families

The 2026-10-04 source audit found no external consumers of `Blur`, `CreatableSelect`, `DatePicker`, `Divider`, `Drawer`, `Editor`, `FontAwesomeSymbol`, `HeaderResizer`, `HighlightText`, `HoverCard`, `NoticeBanner`, `PasswordGenerator`, `Popover`, `RadioGroup`, or `Stepper`. `Popoverv2` was used only by the unused `DatePicker`; `Slider` was used only by the unused `PasswordGenerator`. Their implementations, private helpers, and exports have been deleted. The canonical shared `utilities/HighlightText` remains; only its unused V2 re-export was removed. No active date-input or specialist editor contract was replaced in this cleanup.

## V3

| Components                     | Status     | Direction                                                             |
| ------------------------------ | ---------- | --------------------------------------------------------------------- |
| `ReactSelect/FilterableSelect` | Deprecated | Use `Combobox`; keep compatibility available while consumers migrate. |
| `ReactSelect/CreatableSelect`  | Deprecated | Use `Combobox` with inline `creation` for values needing no metadata, or dialog `creation` for caller-owned forms and persistence. Keep compatibility for react-select-specific component overrides; migrate consumers separately. |

## Updating the ledger

- Add `@deprecated` to the exported API with a supported replacement and any migration limits.
- Add the `deprecated` tag to the component's Storybook metadata when a story exists.
- Keep deprecation, consumer migration, and removal as separate changes unless the task explicitly combines them.
