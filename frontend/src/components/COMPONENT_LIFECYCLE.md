# Shared component lifecycle ledger

This ledger records lifecycle decisions that aren't obvious from component source or Storybook. Use the V2 and V3 barrel exports to find the current component catalog, and use V3 stories as the API and usage reference. A component not listed here has no special lifecycle decision recorded.

## V2

| Components                                                                                                                             | Status                        | Direction                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `FilterableSelect`                                                                                                                     | Deprecated                    | Use V3 `Combobox` where its contract fits.                                                                    |
| `Button`, `Card`, `Checkbox`, `EmptyState`, `IconButton`, `Input`, `Pagination`, `Select`, `Switch`, `TextArea`, `Tooltip`             | Ready for focused deprecation | Supported V3 replacements exist. Check representative consumers before adding component-specific guidance.    |
| `Accordion`, `Alert`, `Blur`, `Breadcrumb`, `CopyButton`, `Dropdown`, `HoverCardv2`, `Skeleton`, `Spinner`, `Stepper`, `Table`         | Blocked                       | Composition, interaction, or state parity still needs verification.                                           |
| `Tabs`                                                                                                                                 | Ready for focused deprecation | Parity verified for horizontal `project`-variant usage (ENG-5638): both versions wrap Radix Tabs, so panel mount lifecycle, state behavior, and keyboard navigation match. Responsive vertical orientation and the `instance` variant have no V3 equivalent; consumers using them stay on V2. |
| `ConfirmActionModal`, `DeleteActionModal`, `Menu`, `Modal`                                                                             | Blocked                       | Verify confirmation, menu-item, nested-overlay, and close behavior before directing consumers to V3 overlays. |
| `ContentLoader`, `Divider`, `FormControl`, `GenericFieldLabel`, `PageHeader`, `Tag`                                                    | Blocked                       | The V3 replacements require consumer-specific composition or accessibility changes.                           |
| `DatePicker`                                                                                                                           | Blocked                       | V3 `Calendar` doesn't replace the composed input, popover, and date-value contract.                           |
| `Editor`, `InfisicalSecretInput`, `SecretInput`, `SecretPathInput`, `PasswordGenerator`                                                | Blocked                       | Security-sensitive or specialist behavior needs workflow-level parity validation.                             |
| `NoticeBannerV2`                                                                                                                       | Blocked                       | Verify that V3 `Alert` covers existing layout and action requirements.                                        |
| `Lottie`                                                                                                                               | Blocked                       | V3 `Loader` is the replacement, but the application entry point still needs the V2 compatibility path.        |
| `Popoverv2`                                                                                                                            | Blocked                       | Migrate the V2 `DatePicker` composition first.                                                                |
| `FontAwesomeSymbol`, `HighlightText`, `Slider`                                                                                         | Retained                      | No supported V3 primitive replaces the distinct capability.                                                   |
| `CreatableSelect`, `Drawer`, `HeaderResizer`, `HoverCard`, `NoticeBanner`, `Popover`, `RadioGroup`                                     | Removal candidate             | Confirm indirect use, then handle removal as separate cleanup work.                                           |

## V3

| Components                     | Status     | Direction                                                             |
| ------------------------------ | ---------- | --------------------------------------------------------------------- |
| `ReactSelect/FilterableSelect` | Deprecated | Use `Combobox`; keep compatibility available while consumers migrate. |
| `ReactSelect/CreatableSelect`  | Blocked    | `Combobox` doesn't support inline option creation.                    |

## Updating the ledger

- Add `@deprecated` to the exported API with a supported replacement and any migration limits.
- Add the `deprecated` tag to the component's Storybook metadata when a story exists.
- Keep deprecation, consumer migration, and removal as separate changes unless the task explicitly combines them.
