# AccessList

> **v4 status:** Pattern, not yet implemented. It composes List and Item rows rather than being a component of its own.

A pattern, not a component: who can reach a project, with a row per member that opens them, multiple selection for bulk changes, and a row that cannot be selected. A framed List of link rows with `selection="multiple"`.

## Built from

- A toolbar above the list: the count ("5 with access to `payments`") and "Add member"; while anything is selected, the selected count, Clear, and the bulk action ("Revoke access").
- `List` with `title="Members"` (the header gets select all), `selection="multiple"`, `selectedIds`, `onSelectionChange`, and a compact EmptyState as `empty`.
- One `Item` per member: `value` and `href`, `current` while open, the Avatar at 32 as `media`, the name as `title` (mono for machines and agents), the role as a `badge`, how they got access as the `description`, last use as `meta`, and a DropdownMenu in `actions`.

## States

- The owner: `selectable={false}` and a disabled menu, with the reason in the description ("Transfer ownership to remove").
- After a bulk action: the rows go, a status line says how many, and Undo puts them back.

## Rules

- Roles are words in a badge, never colors.
- Temporary access says when it ends ("Read, 1 hour", "until 11:46").

