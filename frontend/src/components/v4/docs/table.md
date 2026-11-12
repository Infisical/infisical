# Table

Semantic object tables with a typed data companion for selection and large datasets.

## Choose this component

Choose DataTable for row comparison, sorting and selection. Use DataGrid when cells need spreadsheet editing, range selection or clipboard navigation.

## Usage rules

### table-row-focus

Owner: table.

When a row is being edited in place, such as its annotation or tag popover being open or its name or value being edited inline.

Do: Set focused on that TableRow, or pass its id to DataTable focusedRowId, for exactly as long as the edit is open, and clear it when the edit closes.

Avoid: Use focus to show selection, the current record or search results, leave it set after the edit closes, or dim rows with your own opacity or filter.

Why: The dim tells people every other row is out of play for the moment; used for anything lasting it hides content and competes with selection, which already has its own surface.

Checked by: review only. Look for: Open a row's popover in the Row focus example and in each page that sets focused: only that row stays at full strength, the header does not dim, and closing the popover clears the dim.

Source evidence:
- src/components/v4/ui/table.tsx
- src/pages/design-system/examples/table/row-focus.tsx

### table-usage

Owner: table.

When a table header selects rows from a paged result.

Do: Select eligible loaded rows and keep total or cross-page selection policy explicit in the host.

Avoid: Imply select-all includes unloaded records or add ARIA grid roles to a plain table without grid keyboard behavior.

Why: Selection scope and semantics must match what the user can operate.

Checked by: review only. Look for: Select-all with ineligible and unloaded rows, then sort/reload by stable id. Only eligible loaded rows change selection and the claimed scope remains accurate.

Source evidence:
- src/components/v4/ui/table.tsx
- src/pages/design-system/examples/table/data-table.tsx

### table-action-scope

Owner: table.

When a table exposes both per-row actions and a bulk selection action.

Do: Name the selected scope and keep each row action distinct from its selection checkbox. Make loaded-row select-all explicit when other pages exist.

Avoid: Make a row click select the row as well as open it, or claim every result is selected when only loaded ids changed.

Why: The person must know which records an action will affect before committing it.

Checked by: review only. Look for: Select a subset, navigate pages and use a row action; row identity, selected count and the operation scope agree, and one target does not activate another.

Source evidence:
- src/components/v4/ui/table.tsx
- src/pages/design-system/examples/table/data-table.tsx

### table-virtual-metric-and-row-identity

Owner: table.

When a row-comparison table can virtualize and select loaded records.

Do: Use stable ids and meaningful column alignment. Treat rowHeight as a minimum; every row keeps the same height while scrolling, so the list neither jumps nor leaves gaps. Use DataGrid only when spreadsheet editing is required.

Avoid: Let a row action make one row taller than the others, treat header selection as all server records or sort the displayed rows without updating the host data.

Why: Scrolling, selection and sorting must all refer to the rows the person sees.

Checked by: review only. Look for: Scroll across virtual slices with row actions present, sort and select eligible rows. The measured row height matches the model, scroll position stays stable and selection excludes protected rows.

Source evidence:
- src/components/v4/ui/table.tsx
- src/pages/design-system/examples/table/data-table.tsx

### table-row-action-geometry

Owner: table.

When a table row has actions, standalone indicator marks or both.

Do: Declare the actions with DataTable rowActions (or TableActionsCell and RowActions in a native Table): up to three inline icon actions, the same on every row, then renderMenu for the rest. Put Delete, Remove, Revoke, Disable and other destructive actions only in the More menu, last, after a separator when other items precede them, with the destructive variant; a row whose only action is destructive shows More alone. Keep marks in TableRowIndicators. Choose which actions and marks a row shows and their order; leave target, glyph, gap, inset and column width to the primitives and tokens.

Avoid: Show actions only on hover, put them inside a value cell, swap marks for actions, add a fourth inline action, expose a destructive action inline, hide a blocked action, or set a local width, gap or margin on the actions tail.

Why: Persistent actions in one sticky column never shift the row, line up across rows and stay reachable without a pointer; one owner keeps the actions tail end-aligned and sized by its contents.

Checked by: review only. Look for: Measure a row at rest and on hover: the value cell keeps its width, the tail is 40 for one action and 28 wider per further action, and its first and last targets sit the same distance from the divider and the frame edge. Tab reaches every action and a disabled one reads its reason. ui:lint flags a reveal or swap prop and hover-only layout changes in table CSS.

Source evidence:
- src/components/v4/ui/table.tsx
- src/components/v4/ui/data-table.tsx
- src/components/v4/ui/data.module.css
- src/pages/design-system/examples/table/row-actions.tsx

### table-selection-column

Owner: table.

When a table, DataTable or native Table, has a column of row selection checkboxes.

Do: Mark the header cell and every body cell of that column with selection (TableHead selection, TableCell selection) and put only the Checkbox inside. DataTable selectable renders the same cells.

Avoid: Build a local check or icon cell class with its own width, padding, divider or background for the selection column.

Why: One hook keeps the column's width, Checkbox position, divider and row layers identical in every table.

Checked by: review only. Look for: Measure the selection column in a DataTable and a native Table: both are size-row wide with the Checkbox centered and a line-soft divider on the right, and hovering or selecting the row repaints the selection cell with the row.

Source evidence:
- src/components/v4/ui/table.tsx
- src/components/v4/ui/data-table.tsx
- src/components/v4/ui/data.module.css
- src/pages/design-system/examples/table/semantic.tsx

### table-row-activation

Owner: table.

When each row opens its resource in a sheet or dialog on the same page.

Do: Pass onRowActivate (or, in a native Table, TableRow onClick) and render the primary cell's name as a quiet link Button (variant link, underline hover) that runs the same handler. The cell holds no RowLink, so no chevron is drawn, and the actions tail adds no Open or chevron action. Keep selection on the checkbox and Space.

Avoid: Navigate from onRowActivate or a cell's own onClick, give the row a button or link role, let a row click change the selection, or add stopPropagation to the row's controls and menus to keep them from activating it.

Why: One handler keeps pointer, Enter and the named control in agreement, while the row's own controls keep their clicks and the row keeps native table semantics.

Checked by: src/components/v4/ui/data-table.test.tsx. Clicks a cell, the row menu, the selection cell and a text selection, then presses Enter and Space on a focused row; only the cell click and Enter activate, and Space selects. A native TableRow onClick ignores a click on a portaled menu item opened from the row and runs for a click on a cell.

Source evidence:
- src/components/v4/ui/table.tsx
- src/components/v4/ui/data-table.tsx
- src/components/v4/ui/data-table.test.tsx
- src/pages/design-system/examples/table/row-activation.tsx

### table-row-navigation

Owner: table.

When activating a row goes to the record's own page.

Do: Put RowLink in the primary cell with the record's route and leave onRowActivate unset; RowLink stretches over the row and keeps its chevron.

Avoid: Pass onRowActivate={(row) => go(...)} or any handler that calls navigate, or set RowLink and onRowActivate on the same table.

Why: A row with an href opens in a new tab, copies as a link and reads as a named link to screen readers; a click handler that navigates does none of that.

Checked by: review only. Look for: ui:lint row-activate-navigates flags an onRowActivate whose inline body, or a function it calls from the same file, navigates. Check imported handlers by hand.

Source evidence:
- src/components/v4/ui/data-table.tsx
- src/pages/design-system/examples/table/row-activation.tsx

### table-pagination-slot

Owner: table.

When a DataTable shows one page of a longer result.

Do: Pass Pagination through the pagination slot with variant="compact", so the range and arrows sit in the frame below the rows.

Avoid: Render Pagination, or a helper's pagination node, as a sibling after the table, or put the numbered variant in the slot.

Why: Inside the frame the controls stay with the rows they page and in view while the table scrolls; one variant keeps every paged table the same.

Checked by: review only. Look for: ui:lint pagination-outside-frame flags a Pagination right after a DataTable and a slot Pagination without the compact variant. A slot node built in a helper is checked by hand.

Source evidence:
- src/components/v4/ui/data-table.tsx
- src/pages/design-system/examples/table/pagination.tsx

### table-action-feedback

Owner: table.

When a row, bulk or toolbar action on a table finishes or fails.

Do: Report the result with a toast, and keep DataTable's persistentStatus for state that must stay visible, such as Showing 5 of 120 after filter.

Avoid: Set a notice from the action and show it in persistentStatus, a footer beside the pagination or a role="status" line.

Why: A footer result replaces the counts it sits in, is easy to miss bottom left and needs its own live region; the toast region already announces it.

Checked by: review only. Look for: ui:lint action-feedback-in-status flags state set to sentence text and rendered in persistentStatus, a List or DataGrid footer or a role="status" element in the same file.

Source evidence:
- src/components/v4/ui/data-table.tsx
- src/pages/design-system/examples/table/row-activation.tsx

### table-row-context-menu

Owner: table.

When a native Table row shows RowActions or a TableActionsCell.

Do: Wrap the row in RowContextMenu with the same label, inline actions, menu and menuDisabledReason it passes RowActions.

Avoid: Leave a hand-built row with actions in its tail and no RowContextMenu around it.

Why: Right-click, Shift+F10 and the Menu key open a row's actions on every DataTable row, so a hand-built row without them behaves differently from the table beside it.

Checked by: review only. Look for: ui:lint row-actions-without-context-menu flags a TableRow holding RowActions or TableActionsCell with no RowContextMenu around it in the same file.

Source evidence:
- src/components/v4/ui/table.tsx
- src/pages/design-system/examples/table/row-actions.tsx

### table-inline-primary-action

Owner: table.

When a table lists resources of one type with row actions.

Do: Inline the one most-used non-destructive action, such as Edit, Rotate or View logs, and put the rest in More. Show More alone when no action is clearly most used.

Avoid: Inline several actions on every row of a resource list, or inline an action that repeats the row's own target, such as Open.

Why: One inline action keeps the frequent task one click away without turning the tail into a toolbar, and the same shape on every resource list reads as one product.

Checked by: review only. Look for: Name the most-used action for each resource list and check it is the only inline action, is not destructive and does not repeat the row's target.

Source evidence:
- src/components/v4/ui/data-table.tsx
- src/pages/design-system/examples/table/row-actions.tsx

### table-in-card

Owner: table.

When a detail or settings page lists records inside a Card or SettingsCard.

Do: Use DataTable, which embeds frameless on the card's inset with its sort, loading rows and empty state.

Avoid: Hand-build a native Table in the card. Keep the native Table for the secrets overview matrix and for dialog, sheet and popover internals.

Why: Every table in a card then sorts, loads and reads empty the same way, and the native Table stays for layouts DataTable cannot express.

Checked by: review only. Look for: ui:lint raw-table-in-card flags a native Table inside a Card or SettingsCard outside an overlay and the secrets overview.

Source evidence:
- src/components/v4/ui/data-table.tsx
- src/pages/design-system/examples/table/semantic.tsx

### table-grouped-rows

Owner: table.

When rows belong to a parent the person scans by, such as search results grouped by folder or accounts by resource.

Do: Pass groups with each parent's label, a count or other meta, its rows sorted within the group and, with rowActions, the parent's own actions. Use getRowChildren for one level of child rows under a parent row that is itself a resource row.

Avoid: Fake a group with a full-width row in rows, indent a cell with local padding, put a checkbox on a group header or sort rows across groups.

Why: One owner keeps the header semantics, the indent token, the selection column and the actions tail identical in every grouped table, and select-all stays one rule.

Checked by: src/components/v4/ui/data-table.test.tsx. Renders groups with an empty one: each non-empty group is a tbody whose header is a th with scope rowgroup and is not focusable or activatable, rows are indented at depth 1 and keep Enter activation and their aria-rowindex, and select-all selects the eligible rows of every group.

Source evidence:
- src/components/v4/ui/data-table.tsx
- src/components/v4/ui/data.module.css
- src/pages/design-system/examples/table/grouped-rows.tsx

### table-loading-geometry

Owner: table.

When a DataTable waits for its first rows or reloads them.

Do: Pass loading and a loadingRows count close to the page size, and declare a width on every column except the one that grows and an actions tail, so the table uses fixed layout.

Avoid: Swap the table for a Loader, or leave columns sized by content so they jump when rows arrive.

Why: Skeleton rows at the loaded row height and column widths keep the page still when the data replaces them.

Checked by: src/components/v4/ui/data-table.test.tsx. Compares each cell's width style between loading and loaded rows and checks fixed layout only when every column has a width or grows.

Source evidence:
- src/components/v4/ui/data-table.tsx
- src/pages/design-system/examples/table/loading.tsx

## State guidance

- hover and focus: Hover adds only the translucent row overlay, on striped rows too, and the sticky tail cell repeats it over its opaque ground. Row actions are already visible, so nothing appears, moves or resizes, and keyboard focus rings sit inside the row.
- empty: Show an explanation spanning the table's columns while retaining relevant filters.
- virtual: Keep every row one height and set explicit column widths when the table is virtualized. Larger content raises all rows above the requested rowHeight.

## Presentation rules

Do: Lead with resource rows. Align comparable values and keep row geometry stationary while hovering or selecting.

Avoid: Lift rows on hover, animate loaded totals, replace ordinary metadata with badges or add decorative columns.

Why: Stable lanes support comparison. Counts must describe actual loaded rows and meaningful exceptions belong beside their resource.

## Import and exports

- src/components/v4/ui/table.tsx
- src/components/v4/ui/data-table.tsx
- src/components/v4/ui/data.module.css
- src/components/v4/ui/data-table.test.tsx
- src/components/v4/ui/row-actions.test.tsx
- src/components/v4/ui/frame.module.css
- src/components/v4/tokens.json

Exports: DataTable, Table, TableHeader, TableBody, TableRow, TableHead, TableHeadButton, TableCell, TableFooter, TableCaption, TableRowActions, TableRowIndicators, TableActionsHead, TableActionsCell, TableLoadingRows, TableLoadingColumn, RowActions, RowContextMenu, RowAction, RowActionList, DataTableColumn, DataTableToggle, DataTableRowAction, DataTableRowActions, DataTableGroup, EnvMark. Source TypeScript defines the API.

## Behavior

- Leading pins: pin="start" on TableHead and TableCell (selection cells included) renders data-pin="start", the same attribute DataTable's trailing pin sets to true, and sticks the cell at the inline start. A second pinned column stacks on the first through --v4-pin-offset: a cell after a pinned selection cell takes size-row on its own, and any later one passes pinOffset, a CSS length for the width of the pinned columns before it. DataTable columns take pin: "start" too; the selection column then pins with them and DataTable sets each offset from the declared widths. Pinned cells repaint the row's ground and its stripe, hover, selected and keyboard-ring layers through the same rules as the actions tail, keep row focus (a focused row stays full and a dimmed row dims a pinned cell's contents, not its ground), sit at z-index 4 over scrolled cells, and pinned header cells sit at 6 with the sticky DataTable header at 5. The last leading pinned column marks its edge with the pinned edge fade below, and the start scroll fade is off while leading pins hold that edge. Pin only the columns that identify the row, usually selection and Name, in wide matrices such as the secrets overview across many environments.
- Full-width cell: pin="viewport" on a TableCell with colSpan across every column makes its one child sticky at the inline start and as wide as the scroll container (100cqi; the container becomes an inline-size query container only while it holds such a cell), so an expanded row's nested table stays in view while the outer table scrolls sideways. The cell drops its padding; the child owns its insets. Use it for an expansion that belongs to the row, never for ordinary cells.
- Pinned edge and fade: a pinned column carries a hard line-soft edge while content scrolls under it, and scrolled cells fade into it outside that edge. The last leading pinned cell (data-pin-edge) fades size-scroll-fade past its trailing edge while the scroll container has data-scroll-start-x, and the actions tail (or any data-pin true cell) fades the same depth past its leading edge while the container has data-scroll-end-x. The fade inherits the cell's own background, which is the row's ground and layers, so it takes the stripe, hover, selected and open-menu layers, the header band on header cells, and stays at full ground on a row dimmed by row focus like the pinned cell itself. It fades in on duration-moderate and is instant under reduced motion. The edge is painted inside the sticky cell (--v4-pin-edge, composed with DataTable's frame-pad cover in --v4-pin-frame), never a table border, which would stay with the scrolled columns: the last leading pinned cell draws it on its trailing side while data-scroll-start-x is set, and the actions tail on its leading side while data-scroll-end-x is set, when its own divider border turns transparent, keeping its width, so the line is never doubled. At rest the leading pin shows no line and the tail shows its divider. A full-width (pin viewport) row has no pinned cells, so it draws no edge, and a quick-add row that spans the tail draws only the leading edge. A container with an actions tail (data-has-end-pin) turns its own end scroll fade off, as leading pins do for the start fade, so the two never stack.
- Pinned cells that hold only text keep their text at full strength while other rows dim, because the dim would otherwise fade the cell's opaque ground; wrap the text in an element to dim it.
- Row focus: while a row is being edited (an annotation popover, an inline name or value edit), set focused on its TableRow, or pass DataTable focusedRowId (one id or several). The row renders data-focused and every other row in the same body fades its cell contents to opacity-row-dim (40%) through filter: opacity, so row grounds, borders, the selection ring, pinned cells and the header stay at full strength, and the dim composes with opacity reveals inside cells. Rows report focus to their TableBody, which marks itself data-has-focus, so there is no table-level prop. Hovering a dimmed row undims it where hover exists, dimmed rows stay interactive, and portalled popovers and menus never dim. The fade runs on duration-moderate and is instant under reduced motion. A selected row that is not focused still dims.
- Nested tables: a body dims when it holds a focused row at any depth. The row that holds the nested table and the row just above it, the one it expands from, keep full strength, and the nested body dims only its own other rows, so focusing an environment row inside an expanded secret dims every other secret and environment row and nothing else.
- Row states are layers over the row's ground, which is surface, or row-done on a striped even row. The selected surface and the hover overlay (the shared hover token) stack over the ground on every cell, and a pinned cell or the sticky tail repaints the same ground and layers opaquely, so a striped, selected or hovered row reads as one band to the frame edge and scrolled cells never show through.
- DataTable composes existing Table parts without imposing ARIA grid keyboard semantics.
- Shared tooltips: Table, and so DataTable, wraps its rows in a TooltipScope. Every Tooltip inside (status marks through TooltipText, Button disabledReason, RowActions labels, selection reasons) renders only its trigger element and the table mounts one Radix tooltip on first use, instead of one root per trigger, about five per secrets row. Hover, focus, the skip delay between neighboring triggers, Escape and aria-describedby behave as with standalone tooltips. A controlled Tooltip (open, defaultOpen, onOpenChange or delayDuration) keeps its own root.
- Tables are framed by default: DataTable always sits in the shared tint frame, which suits nearly every standalone table. Use the native Table, which has no frame, only when the table is embedded in another surface that already draws an edge, such as a Card, a sheet or a dialog body.
- DataTable sits in the shared tint frame: the column header row is a 40px uppercase eyebrow row in the frame and the body rows sit on the inset raised surface.
- A table embedded in a framed card is frameless. Inside a framed Card, List or other frame, DataTable drops its tint frame and the body's own border: the header row, pinned actions tail and pagination sit on the parent's inset surface with a line-soft rule under the header, so the header reads apart from the card's band. A flush framed Card keeps its bordered inset around the embedded table.
- Basic/striped/bordered, controlled sorting, stable selection, empty and load-more.
- Header rows never take a hover state: no row hover layer, no background change, on any header cell, pinned or not. Only an interactive header cell hovers, and only itself: TableHeadButton is the one header trigger, a sort or menu button that fills its TableHead edge to edge (it pulls through the head's space-row-inline padding to the full height) and takes the hover overlay on that cell alone. DataTable's sortable headers render it; a native Table uses it for a sort or column menu trigger, composed under DropdownMenuTrigger asChild for a menu. As a popup trigger (aria-haspopup) it keeps the same hover fill while its menu is open, from data-state open or aria-expanded true on the trigger (a wrapping Tooltip overwrites data-state), so the menu reads as attached to its header; aria-expanded without aria-haspopup, a disclosure, never paints. A menu trigger keeps its chevron visible at rest, while a sort arrow shows only when sorted, hovered or focused. Its styles and its keyboard ring key off the .tableSort class and the data-table-head-button attribute, both of which survive asChild composition (Slot overwrites data-slot), and the ring is drawn focus-ring inside the button, which fills the cell, so neighbouring cells, pinned columns and the scroll edge never clip it in pinned or unpinned headers. Pages need no CSS of their own for this trigger. Never tint a header cell from row hover, and never wrap a small trigger inside a hovering cell.
- Sortable headers show the direction with a custom-set arrow: up for ascending and down for descending, always visible on the sorted column. An unsorted column shows the up arrow it would apply only while its header is hovered or focused. The sorted header steps up to ink.
- Content sizing floors, capped values, pinned action column and optional fixed-height row virtualization.
- Rows are size-row (40px) through one variable, --v4-table-row-height, which falls back to the token; DataTable reads size-row at runtime as its default virtual metric, so the CSS row and the scroll model never disagree. Cells pad by space-row-inline (12px), the content edge text and glyphs share.
- Row actions are persistent. rowActions adds a sticky tail column, pinned to the inline end, that shows every row's actions at rest: up to three inline icon actions (Button icon-row, the same set on every row, each with a tooltip of its label or its disabled reason) followed by the More menu when renderMenu is set. A blocked action stays in place, disabled, with its reason. Nothing appears on hover, so a hovered row never changes a cell's width or the row's layout.
- Destructive row actions (Delete, Remove, Revoke, Disable and similar irreversible or access-removing actions) never appear in rowActions.inline or RowActions inline. They appear in the More menu as its last item, after a DropdownMenuSeparator if the menu has other items, as a DropdownMenuItem with variant destructive. A row whose only action is destructive still uses More, so More is the single action in its tail.
- The actions tail end-aligns its actions, header included: on every row the last action's end edge sits space-row-actions-inset inside the frame edge, whatever the row's action count, so a row with fewer actions than the widest leaves its gap at the start, by the line-soft divider. A single action sits 5px clear of each line. Its width follows its contents: size-row (40px, a square) for one action and size-row-action-step (28px) more for each further one, so More alone is 40, one inline action and More is 68, two is 96 and three is 124. The cell keeps the pinned divider at rest (the pinned edge fade replaces it while content scrolls under the tail), the frame-pad fill, the row's stripe, the hover overlay and the selected surface.
- Every actions tail uses this standard by default, whether it comes from rowActions, TableActionsCell or a column with actions true: it caps each Button inside it at size-target-row (28px), the row target height, so icon-row targets and a text button such as Open share one height, centered vertically in the row and end-aligned. The cell's inline padding is the same space-row-actions-inset, so a single target reads square and a text button gets the same clearance on each side. Examples and composites set no width, size or padding on the actions tail.
- TableRowActions is the end-aligned group inside the actions tail, with targets touching (space-row-actions-gap, 0). For a native Table, TableActionsHead and TableActionsCell take slots, the widest row's action count, and draw the same actions tail; RowActions renders the inline actions and More inside it. TableRowIndicators lays persistent row marks in size-target-row slots with size-glyph glyphs, pulled so the last glyph lands on the 12px content edge; marks never swap out for actions.
- The selection column is size-row wide with its Checkbox centered between the frame edge and a persistent line-soft divider on its right, the same line as the actions tail divider, on the header and every row, at rest, hovered and selected.
- The selection column always uses one hook, the selection prop on TableHead and TableCell (data-slot "table-selection"), in DataTable and in a native Table alike. It owns the width, padding, centered Checkbox and divider, and repaints the row's ground and its stripe, hover and selected layers on the cell, so the column reads as one band with its row and stays opaque if pinned. The selection cell counts as row-interactive, so a click on it never activates the row. Nothing else draws a selection column. The divider is on by default; an icon or expand column that doubles as selection, such as the one on the Secrets overview, may pass divider false on its TableHead and TableCell (data-divider "false") to drop it, and keeps everything else the hook owns.
- Row actions also open as a right-click menu on the whole row, from the same source: the inline actions first, each with its icon and its disabled reason as the item description, then a separator and the More menu items unchanged, destructive last. DataTable does this for every data row with rowActions; rowContextMenu={false} opts out. A hand-built Table row wraps itself in RowContextMenu with the same label, inline, menu and menuDisabledReason it passes RowActions. Shift+F10 and the Menu key open it on a focused row, right-clicking an input, textarea, select or editable cell keeps the browser's own menu, and empty, loading, spacer and group rows never open it. While it is open the row takes the hover layer (pinned cells included), and closing returns focus to the row. The menu content, its portal and its positioning mount only while the menu is open or running its close animation, so a closed row costs only the trigger.
- RowActions lazy renders plain buttons with the same DOM, classes and accessible names as the real ones, and no Tooltip, DropdownMenu or Popper, until the row is hovered (the pointer rests on it for 120ms, or enters the actions themselves) or anything in it takes focus. It then swaps in the real parts once and stays live, and focus stays on the same button. A press while idle still works: an inline action runs, and More opens its menu on the first press, pointer or keyboard. DataTable renders every rowActions tail lazy: with the :has() rules gone from v4 CSS, a row's first-hover swap is a small local relayout, so idle rows cost a fraction of the mount while hover, focus, menus and tooltips behave the same. On a native Table it stays opt-in; set it on long tables such as the secrets overview.
- RowActions open, defaultOpen and onOpenChange control the More menu, so a page can open it from outside (a shortcut, a context menu item or a tour). open opens a lazy row's menu even while idle, and onOpenChange also reports the open from an idle press. onMenuCloseAutoFocus is the menu's close focus handler: preventDefault keeps focus where a menu item moved it, such as into a popover the item opened.
- Responsibilities: tokens own the numbers (size-row, size-target-row, size-row-action-step, size-glyph, space-row-inline, space-row-actions-gap, space-row-actions-inset, space-row-indent); DataTable rowActions, the tail cells, RowActions and TableRowIndicators own geometry; a composite chooses which actions a row shows and their order, and sets no sizes, gaps or offsets.
- With a fixed height, load-more sits in flow after the last loaded row, inside the scroll frame, so nothing covers readable rows; the outline button morphs to its loading state in place. Once loadMore is undefined, the optional end message takes the same slot.
- onRowActivate makes every row a pointer target with the ordinary hover overlay. A click anywhere in the row activates it unless it lands on a link, button, input, checkbox, menu item, tooltip trigger, the selection cell, the actions cell or anything marked data-row-interactive, or it ends a text selection inside the row. Menu items rendered in a portal never reach the row.
- TableRow's onClick applies the same filter, in one place that DataTable's onRowActivate also goes through: it runs only for a primary click whose target is inside the row's own DOM and not on an interactive element there. Clicks that bubble through React from portaled content opened from the row (a menu, popover or dialog) are ignored, so a native Table row needs no stopPropagation on its menus, buttons, checkboxes or actions cell.
- pagination renders its node in a foot inside the tint frame, below the rows. It stays in view while a wide table scrolls sideways and, with a fixed height, while the rows scroll.
- loading replaces the rows with loadingRows (default 5) skeleton rows at the same row height: a square for the selection and actions cells and a size-skeleton-text bar for each value, shorter in the primary column. Empty and load-more stay hidden while loading.
- TableLoadingRows gives a native Table the same loading rows: DataTable renders its own through it, so the selection square, the size-skeleton-text bars (shorter with primary), the glyph squares in an actions column or a TableActionsCell tail with actionSlots, the row height and data-loading (no hover, no row ground, no context menu) match exactly. Pass one entry per body column with the widths the header uses, or a count. label names what loads, such as Loading secrets, and is announced from the first row; set aria-busy on the Table while it shows.
- When every column declares a width, grows to fill the rest or is an actions column, the table uses fixed layout with a floor of the declared widths plus size-cell-min per growing column, so widths never move between loading and loaded rows or as cell content changes.
- actionBar renders the table's FloatingActionBar. The bar is fixed to the bottom center of the window and, while it shows, pads the page's scroll area by its height plus its offset, so the last row and the pagination can scroll clear of it.
- Table's ref targets the table element. containerRef targets its horizontal scroll container (what v3 Table's ref pointed at) and containerClassName adds layout classes to it. DataTable takes the same two props for its scroll frame, which scrolls both ways when height is set, so ports keep reading scrollTop, observing scroll or calling scrollTo.
- A column with toggle is a boolean column: every cell is a Checkbox and the header gets a tri-state Checkbox before its title. The header reads checked when every enabled row is on, indeterminate when some are, and unchecked when none are. Selecting it turns every enabled row on, or off when all are on, and calls onChange once with only the row ids that change. Rows with a disabledReason keep their value, are left out of the count, and show the reason on their disabled cell; with no enabled rows the header is disabled. render is optional on a toggle column.
- checked may return "indeterminate" for a partial grant: the cell shows a mixed Checkbox, and the header counts the row as not on, so it reads checked only when every counted row is fully on. From mixed, a cell click or a header click that turns the column on sets the row on. absent(row) marks a row with no such action: the cell shows a muted dash and no control, and the row is left out of the count like a disabled one. adornment(row) renders after the Checkbox inside the same cell, for marks such as conditions or forbid rules; they keep their own tab stops, and clicks on them never activate the row.

## Accessibility

- Native table/header/cell semantics, labelled selection and aria-sort buttons.
- selectionDisabledReason(row) disables that row's selection Checkbox, shows the reason in a tooltip and sets it as the Checkbox's accessible description. Header select-all skips and does not count those rows; isSelectable remains for rows that need no explanation.
- With virtual rows, screen readers still hear the total row count and each row's real position.
- A truncated cell never clips the focus ring of a control rendered in it, and Tab scrolls a control far enough above the scroll frame's bottom edge to show its whole ring.
- Focus remains on native controls; loading and selected totals announced politely.
- Each row action is a named button: "<label> for <rowLabel>", and the More trigger is "More actions for <rowLabel>" unless menuLabel renames it. A disabled action carries its reason as its accessible description and in its tooltip. The header cell names the column Actions for screen readers.
- After load-more appends rows, the table scrolls the first new row into view and moves focus to it, so keyboard and screen reader users continue from what just arrived.
- With onRowActivate, rows join the tab order without an interactive role, so the table keeps native row semantics and never nests a button or link role around the row's own controls. Enter activates the focused row and Space toggles its selection when the table is selectable. Keep a real link or button for the same destination in the primary cell, so screen reader users meet a named control.
- Loading rows are hidden from assistive technology; the table is aria-busy and the polite status says Loading rows.
- Toggle checkboxes are named, not left to the header: each cell is "<header> for <rowLabel>" and the header control is "<header> for every row in <label>" unless toggle.label overrides it. The header control announces mixed for some. A disabled cell carries its reason as its accessible description. An absent cell has no control; its dash is hidden from assistive technology and replaced by "<header> for <rowLabel>: not applicable". An adornment is a sibling of the Checkbox, never inside it, so a button mark is its own named control in the tab order with no nested interactive roles; give icon-only marks a visible tooltip and an accessible name.
- Grouped rows: pass groups ({ id, label, rows, meta?, actions? }) instead of rows. Each group with rows is its own tbody whose first row is the group header: a th with scope rowgroup that spans the data columns on the tint ground, with the label in label type and meta (such as a count) in muted small type. The selection cell stays in place, empty, and with rowActions the actions tail holds the group's actions end-aligned like every other row. The frame stays one surface across the groups.
- Rows under a group header, and child rows from getRowChildren (one level under a parent row), indent the primary column (or the first column when none is primary) by space-row-indent per depth. Only the primary cell moves: the selection column, the other columns and the actions tail keep their positions.
- Group headers are not row-activatable and never join the tab order. Rows under them keep every row behavior: Tab, Enter with onRowActivate, Space to select. aria-rowindex and aria-rowcount count the header rows.
- Selection with groups has no group checkbox: header select-all covers the eligible rows of every group and every child row, and its mixed state counts them the same way. A group header is never selected.

## Use cases

- Use basic, striped or bordered DataTable for row comparison with native table semantics, controlled sort and optional loaded-row selection.

## Limits

- DataTable's primary column is in the sans row-title role, because it usually names a resource someone chose. A column opts into mono with mono for machine values such as secret keys, key IDs, hashes or hosts (rule/mono-machine-values).
- The host sorts data and owns pagination and cross-page selection policy. Header select-all touches eligible loaded rows only.
- Grouped rows: DataTable never reorders rows, so the host sorts within each group and keeps the groups in their own order; a sort never moves a row across groups. With getRowChildren the host sorts the parents and each parent's children separately, and children always follow their parent. Paginate the rows first and group the page, so a group cut by a page boundary repeats its header on the next page.
- Grouped rows render every row: virtual is ignored with groups. getRowChildren works with virtual, since its rows stay one flat list.
- Group headers have no checkbox and do not collapse. A group's own actions render only in the actions tail, so they need rowActions. Striped rows restart in each group.
- getRowChildren is one level and visual: the table has no treegrid semantics, so a child row's rowLabel and primary cell must name it without its parent. Use groups when the parent relation must be announced.
- There is no muted row state. Lowered opacity drops text below contrast and carries the state by color alone; mark an inactive row with a Badge in its name cell (for example Deactivated) and, when it cannot be acted on, a selectionDisabledReason.
- Virtual tables use one uniform effective row height. rowHeight defaults to the size-row token (40px) as a requested minimum; observed enlarged content can raise the shared metric used by rows, slices and spacers. This does not support arbitrary variable-height rows. Supply width/maxWidth for variable columns.
- Only a final column may be pinned. rowActions.inline takes at most three actions, enforced by its tuple type; everything else goes in renderMenu. Use grow for a flexible resource column; an explicit numeric width takes precedence.
- A column with actions true remains for tail content that is not icon actions, such as an Open text button; it takes the same end-aligned actions tail and 28px target cap, and sizes to its content without a declared width. In a fixed-layout table it holds one target (size-row) unless the column declares a width. Prefer rowActions for icon actions.
- Use text(row) for full hover text when render returns truncated complex content.
- The host owns how many rows load and how tall the frame grows; pass a larger height as rows arrive, leave loadMore undefined once every row is loaded and pass end to say so. Remount or reset scroll when a filter replaces the rows.
- onRowActivate is a pointer and keyboard shortcut. It cannot open a new tab or be copied as a link; navigation that needs those belongs on the link in the primary cell.
- The pagination slot takes any node. The host slices rows, owns page and page size, and resets the page when filters change.
- Migration: v3 Table's ref is the scroll container; in v4 pass that ref as containerRef, or ref still lands on the table element. There is no hasAttachedFooter or TableAttachedFooter: DataTable's loadMore, end and pagination slots render inside the frame below the rows, so a load-more action or completion message joins the table without a second border.
- The padding goes on AppInset, the v4 page scroll area. A page that scrolls some other element must leave room for the bar itself.
- A toggle column acts on the rows passed in. With pagination the header counts and sets the current page only; the host decides whether a bulk change spans pages. The host owns the values and persists them through onChange.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### variant

- basic: example `variants`, visible label "basic".
- striped: example `variants`, visible label "striped".
- bordered: example `variants`, visible label "bordered".

### alignment

- start: example `variants`, visible label "Environment".
- end: example `variants`, visible label "Secrets".
- center: example `variants`, visible label "Present".

### collection

- native: example `semantic`, visible label "Fabricated environment inventory".
- empty: example `states`, visible label "Empty".
- protected-selection: example `states`, visible label "Protected selection".
- virtual: example `data-table`, visible label "Example resource table".
- load-more: example `load-more`, visible label "Example event log".
- row-activation: example `row-activation`, visible label "Certificates".
- paginated: example `pagination`, visible label "Audit events".
- loading: example `loading`, visible label "Keys, loading".
- grouped: example `grouped-rows`, visible label "Accounts grouped by resource".
- tree: example `grouped-rows`, visible label "Child rows under a parent row".

### column layout

- grow: example `variants`, visible label "Environment".
- pin: example `variants`, visible label "Open".
- hideHeader: example `variants`, visible label "Actions".

### row actions

- more-only: example `row-actions`, visible label "More only, one square cell".
- one-inline: example `row-actions`, visible label "One inline action and More".
- two-inline: example `row-actions`, visible label "Two inline actions and More".
- three-inline: example `row-actions`, visible label "Three inline actions, the cap, and More".
- disabled: example `row-actions`, visible label "JWT_SIGNING_KEY".
- indicators: example `row-actions`, visible label "DATABASE_URL".

## Executable examples

### Variants

Save this example at `src/pages/design-system/examples/table/variants.tsx`; its relative imports are generated for that exact path. States: default, overflow.

Registry items used: @cipher/button, @cipher/data-table, @cipher/sonner. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import { DataTable, type DataTableColumn, EnvMark } from "../../../../components/v4/ui/data-table";
import { toast } from "../../../../components/v4/ui/sonner";

type Row = { id: string; name: string; count: number; present: boolean };
const rows: Row[] = [
  { id: "production", name: "Production", count: 128, present: true },
  { id: "staging", name: "Staging", count: 0, present: false }
];
export default function Variants() {
  const columns: DataTableColumn<Row>[] = [
    {
      id: "name",
      header: "Environment",
      primary: true,
      grow: true,
      align: "start",
      render: (row) => row.name
    },
    { id: "count", header: "Secrets", align: "end", render: (row) => row.count },
    {
      id: "present",
      header: "Present",
      align: "center",
      render: (row) => <EnvMark present={row.present} env={row.name} />
    },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      pin: true,
      hideHeader: true,
      render: (row) => (
        <Button
          variant="ghost"
          aria-label={`Open ${row.name}`}
          onClick={() => toast(`${row.name} contains ${row.count} fabricated secrets.`)}
        >
          Open
        </Button>
      )
    }
  ];
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      {(["basic", "striped", "bordered"] as const).map((variant) => (
        <figure
          key={variant}
          aria-label={`${variant} variant`}
          className="m-0 flex w-full min-w-0 flex-col gap-3"
        >
          <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
            <DataTable
              label={`${variant} environments`}
              rows={rows}
              columns={columns}
              getRowId={(row) => row.id}
              rowLabel={(row) => row.name}
              variant={variant}
            />
          </div>
          <figcaption className="text-muted-foreground text-xs">{variant}</figcaption>
        </figure>
      ))}
    </div>
  );
}
```

### Empty and protected selection

Save this example at `src/pages/design-system/examples/table/states.tsx`; its relative imports are generated for that exact path. States: empty, controlled, disabled, keyboard, loading.

Registry items used: @cipher/badge, @cipher/data-table, @cipher/empty. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as React from "react";

import { Badge } from "../../../../components/v4/ui/badge";
import { DataTable } from "../../../../components/v4/ui/data-table";
import { EmptyState } from "../../../../components/v4/ui/empty";

const initial = [
  { id: "owner", name: "Production owner", locked: true, deactivated: false },
  { id: "worker", name: "Rotation worker", locked: false, deactivated: false },
  { id: "expired", name: "Expired integration", locked: false, deactivated: true }
];
const columns = [
  {
    id: "name",
    header: "Identity",
    render: (row: (typeof initial)[number]) => (
      <span className="inline-flex items-center gap-2">
        {row.name}
        {row.deactivated && <Badge size="sm">Deactivated</Badge>}
      </span>
    )
  },
  {
    id: "access",
    header: "Access",
    render: (row: (typeof initial)[number]) => (row.locked ? "Owner, protected" : "Revocable")
  }
];
export default function States() {
  const [selected, setSelected] = React.useState<string[]>(["worker"]);
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <DataTable
            label="Empty identities"
            rows={[]}
            columns={columns}
            getRowId={(row) => row.id}
            rowLabel={(row) => row.name}
            empty={
              <EmptyState
                size="sm"
                media="bare"
                icon="user"
                title="No identities in this environment"
              />
            }
          />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Empty"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <DataTable
            label="Protected identities"
            rows={initial}
            columns={columns}
            getRowId={(row) => row.id}
            rowLabel={(row) => row.name}
            selectable
            selectionDisabledReason={(row) =>
              row.locked ? "Owner identities are protected from bulk removal." : undefined
            }
            selectedIds={selected}
            onSelectionChange={setSelected}
            persistentStatus={`${selected.length} eligible loaded identities selected`}
          />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Protected selection"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <DataTable
            label="Loading identities"
            rows={initial}
            columns={columns}
            getRowId={(row) => row.id}
            rowLabel={(row) => row.name}
            loadMore={{ label: "Load more identities", loading: true, onClick: () => undefined }}
          />
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Loading more, retained rows"}
        </figcaption>
      </figure>
    </div>
  );
}
```

### Native Table loading rows

Save this example at `src/pages/design-system/examples/table/native-loading.tsx`; its relative imports are generated for that exact path. States: loading.

Registry items used: @cipher/data-table, @cipher/table. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { DataTable, type DataTableColumn } from "../../../../components/v4/ui/data-table";
import {
  Table,
  TableActionsHead,
  TableBody,
  TableHead,
  TableHeader,
  TableLoadingRows,
  TableRow
} from "../../../../components/v4/ui/table";

type Secret = { id: string; key: string; production: string; staging: string };
const columns: DataTableColumn<Secret>[] = [
  { id: "key", header: "Key", primary: true, mono: true, grow: true, render: (row) => row.key },
  { id: "production", header: "Production", width: 160, render: (row) => row.production },
  { id: "staging", header: "Staging", width: 160, render: (row) => row.staging }
];

export default function NativeLoading() {
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Table aria-label="Secrets, loading" aria-busy>
            <TableHeader>
              <TableRow>
                <TableHead selection />
                <TableHead scope="col">Key</TableHead>
                <TableHead scope="col" style={{ width: 160 }}>
                  Production
                </TableHead>
                <TableHead scope="col" style={{ width: 160 }}>
                  Staging
                </TableHead>
                <TableActionsHead slots={2} />
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableLoadingRows
                label="Loading secrets"
                rows={3}
                selectable
                actionSlots={2}
                columns={[{ primary: true }, { style: { width: 160 } }, { style: { width: 160 } }]}
              />
            </TableBody>
          </Table>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Native Table with TableLoadingRows, as in a sheet or the secrets matrix"}
        </figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <DataTable
            label="Secrets, loading"
            rows={[]}
            columns={columns}
            getRowId={(row) => row.id}
            rowLabel={(row) => row.key}
            selectable
            loading
            loadingRows={3}
            rowActions={{
              inline: [
                { label: "Copy", icon: "copy", onSelect: () => {} },
                { label: "History", icon: "history", onSelect: () => {} }
              ]
            }}
          />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"DataTable loading"}</figcaption>
      </figure>
    </div>
  );
}
```

### Native semantic table

Save this example at `src/pages/design-system/examples/table/semantic.tsx`; its relative imports are generated for that exact path. States: default, controlled.

Registry items used: @cipher/checkbox, @cipher/table. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as React from "react";

import { Checkbox } from "../../../../components/v4/ui/checkbox";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow
} from "../../../../components/v4/ui/table";

const environments = [
  { id: "production", name: "Production", secrets: 128 },
  { id: "staging", name: "Staging", secrets: 42 },
  { id: "development", name: "Development", secrets: 0 }
];

export default function SemanticTable() {
  const [selected, setSelected] = React.useState<string[]>(["staging"]);
  const all = selected.length === environments.length;
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Table aria-label="Environment inventory">
            <TableCaption>Fabricated environment inventory</TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Environment</TableHead>
                <TableHead scope="col" className="text-right">
                  Secrets
                </TableHead>
                <TableHead scope="col">Rotation</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>Production</TableCell>
                <TableCell className="text-right">128</TableCell>
                <TableCell>2 overdue</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>Staging</TableCell>
                <TableCell className="text-right">0</TableCell>
                <TableCell>No secrets</TableCell>
              </TableRow>
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell>Total</TableCell>
                <TableCell className="text-right">128</TableCell>
                <TableCell>2 environments</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Caption and footer"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Table aria-label="Selectable environments">
            <TableHeader>
              <TableRow>
                <TableHead selection>
                  <Checkbox
                    aria-label="Select all environments"
                    checked={all || (selected.length > 0 && "indeterminate")}
                    onCheckedChange={() =>
                      setSelected(all ? [] : environments.map((env) => env.id))
                    }
                  />
                </TableHead>
                <TableHead scope="col">Environment</TableHead>
                <TableHead scope="col" className="text-right">
                  Secrets
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {environments.map((env) => (
                <TableRow
                  key={env.id}
                  data-state={selected.includes(env.id) ? "selected" : undefined}
                >
                  <TableCell selection>
                    <Checkbox
                      aria-label={`Select ${env.name}`}
                      checked={selected.includes(env.id)}
                      onCheckedChange={() => toggle(env.id)}
                    />
                  </TableCell>
                  <TableCell>{env.name}</TableCell>
                  <TableCell className="text-right">{env.secrets}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Selection column"}</figcaption>
      </figure>
    </div>
  );
}
```

### Sort direction

Save this example at `src/pages/design-system/examples/table/sorting.tsx`; its relative imports are generated for that exact path. States: default, controlled, keyboard.

Registry items used: @cipher/data-table. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as React from "react";

import { DataTable, type DataTableColumn } from "../../../../components/v4/ui/data-table";

type Row = { id: string; key: string; updated: string };
const all: Row[] = [
  { id: "stripe", key: "STRIPE_API_KEY", updated: "2 days ago" },
  { id: "database", key: "DATABASE_URL", updated: "5 hours ago" },
  { id: "sendgrid", key: "SENDGRID_TOKEN", updated: "3 weeks ago" }
];
type Sort = { columnId: string; direction: "asc" | "desc" };
const columns: DataTableColumn<Row>[] = [
  {
    id: "key",
    header: "Key",
    primary: true,
    mono: true,
    sortable: true,
    text: (row) => row.key,
    render: (row) => row.key
  },
  { id: "updated", header: "Updated", render: (row) => row.updated }
];
function SortedTable({ label, initial }: { label: string; initial?: Sort }) {
  const [sort, setSort] = React.useState<Sort | undefined>(initial);
  const rows = sort
    ? [...all].sort((a, b) => a.key.localeCompare(b.key) * (sort.direction === "asc" ? 1 : -1))
    : all;
  return (
    <DataTable
      label={label}
      rows={rows}
      columns={columns}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.key}
      sort={sort}
      onSortChange={setSort}
    />
  );
}
export default function Sorting() {
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <SortedTable label="Unsorted secrets" />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Unsorted"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <SortedTable label="Ascending secrets" initial={{ columnId: "key", direction: "asc" }} />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Ascending"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <SortedTable
            label="Descending secrets"
            initial={{ columnId: "key", direction: "desc" }}
          />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Descending"}</figcaption>
      </figure>
    </div>
  );
}
```

### Virtual rows and sorting

Save this example at `src/pages/design-system/examples/table/data-table.tsx`; its relative imports are generated for that exact path. States: default, controlled, keyboard, overflow.

Registry items used: @cipher/data-table. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useMemo, useState } from "react";

import { DataTable, type DataTableColumn, EnvMark } from "../../../../components/v4/ui/data-table";

type Row = { id: string; name: string; present: boolean };
const all: Row[] = Array.from({ length: 24 }, (_, index) => ({
  id: `resource-${index}`,
  name: `example_resource_${index}`,
  present: index % 3 !== 0
}));
export default function Example() {
  const [selected, setSelected] = useState<string[]>([]);
  const [sort, setSort] = useState<{ columnId: string; direction: "asc" | "desc" }>();
  const rows = useMemo(
    () =>
      sort
        ? [...all].sort(
            (a, b) => a.name.localeCompare(b.name) * (sort.direction === "asc" ? 1 : -1)
          )
        : all,
    [sort]
  );
  const columns: DataTableColumn<Row>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      sortable: true,
      maxWidth: 240,
      text: (row) => row.name,
      render: (row) => row.name
    },
    {
      id: "environment",
      header: "Production",
      render: (row) => <EnvMark present={row.present} env="Production" />
    }
  ];
  return (
    <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
      <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
        <div className="relative max-h-[400px] w-full min-w-0 overflow-auto">
          <DataTable
            label="Example resource table"
            rows={rows}
            columns={columns}
            getRowId={(row) => row.id}
            rowLabel={(row) => row.name}
            selectable
            selectedIds={selected}
            onSelectionChange={setSelected}
            sort={sort}
            height={320}
            virtual
            onSortChange={setSort}
            persistentStatus={`${rows.length} resources. ${selected.length} selected.`}
          />
        </div>
      </div>
      <figcaption className="text-muted-foreground text-xs">
        {"Selection, sorting and virtual scrolling"}
      </figcaption>
    </figure>
  );
}
```

### Virtual rows, load more

Save this example at `src/pages/design-system/examples/table/load-more.tsx`; its relative imports are generated for that exact path. States: default, loading, keyboard.

Registry items used: @cipher/data-table. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useEffect, useState } from "react";

import { DataTable, type DataTableColumn } from "../../../../components/v4/ui/data-table";

type Row = { id: string; name: string; time: string };
const total = 200;
const page = 40;
const makeRows = (from: number, count: number): Row[] =>
  Array.from({ length: Math.min(count, total - from) }, (_, offset) => {
    const minutes = 23 * 60 + 59 - (from + offset) * 7;
    return {
      id: `event-${from + offset}`,
      name: `example_event_${from + offset}`,
      time: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`
    };
  });
const columns: DataTableColumn<Row>[] = [
  { id: "time", header: "Time", width: 120, render: (row) => row.time },
  { id: "name", header: "Event", primary: true, grow: true, render: (row) => row.name }
];

export default function Example() {
  const [rows, setRows] = useState(() => makeRows(0, page));
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!loading) return undefined;
    const timer = window.setTimeout(() => {
      setRows((current) => [...current, ...makeRows(current.length, page)]);
      setLoading(false);
    }, 600);
    return () => window.clearTimeout(timer);
  }, [loading]);
  return (
    <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
      <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
        <div className="relative max-h-[400px] w-full min-w-0 overflow-auto">
          <DataTable
            label="Example event log"
            rows={rows}
            columns={columns}
            getRowId={(row) => row.id}
            rowLabel={(row) => row.name}
            height={320}
            rowHeight={48}
            virtual
            loadMore={
              rows.length < total
                ? { label: `Load ${page} more`, loading, onClick: () => setLoading(true) }
                : undefined
            }
            end="End of events"
            persistentStatus={`Showing ${rows.length} of ${total} events`}
          />
        </div>
      </div>
      <figcaption className="text-muted-foreground text-xs">
        {"Load more after the last row, focus lands on the first new row"}
      </figcaption>
    </figure>
  );
}
```

### Scroll container ref

Save this example at `src/pages/design-system/examples/table/scroll-container.tsx`; its relative imports are generated for that exact path. States: default, overflow.

Registry items used: @cipher/button, @cipher/data-table. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useEffect, useRef, useState } from "react";

import { Button } from "../../../../components/v4/ui/button";
import { DataTable, type DataTableColumn } from "../../../../components/v4/ui/data-table";

type Row = { id: string; name: string };
const rows: Row[] = Array.from({ length: 30 }, (_, index) => ({
  id: `client-${index + 1}`,
  name: `example-machine-identity-${index + 1}`
}));
const columns: DataTableColumn<Row>[] = [
  { id: "name", header: "Identity", primary: true, grow: true, render: (row) => row.name }
];

export default function Example() {
  const container = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const node = container.current;
    if (!node) return undefined;
    const update = () => setScrolled(node.scrollTop > 0);
    node.addEventListener("scroll", update);
    return () => node.removeEventListener("scroll", update);
  }, []);
  return (
    <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
      <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
        <div className="relative max-h-[400px] w-full min-w-0 overflow-auto">
          <DataTable
            label="Example identities"
            rows={rows}
            columns={columns}
            getRowId={(row) => row.id}
            rowLabel={(row) => row.name}
            height={240}
            containerRef={container}
            end={
              <Button
                variant="outline"
                disabled={!scrolled}
                onClick={() => container.current?.scrollTo({ top: 0 })}
              >
                Back to Top
              </Button>
            }
          />
        </div>
      </div>
      <figcaption className="text-muted-foreground text-xs">
        {"containerRef reads and drives the scroll container"}
      </figcaption>
    </figure>
  );
}
```

### Row actions

Save this example at `src/pages/design-system/examples/table/row-actions.tsx`; its relative imports are generated for that exact path. States: default, disabled, keyboard.

Registry items used: @cipher/data-table, @cipher/dropdown-menu, @cipher/icon, @cipher/layout, @cipher/sonner, @cipher/table. Additional packages: lucide-react@^0.544.0. Install every listed item before compiling this example.

```tsx
import { CodeXmlIcon, EditIcon, TagsIcon } from "lucide-react";

import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "../../../../components/v4/ui/data-table";
import { DropdownMenuItem } from "../../../../components/v4/ui/dropdown-menu";
import { Icon } from "../../../../components/v4/ui/icon";
import { Inline } from "../../../../components/v4/ui/layout";
import { toast } from "../../../../components/v4/ui/sonner";
import {
  type RowActionList,
  RowActions as RowActionsGroup,
  RowContextMenu,
  Table,
  TableActionsCell,
  TableActionsHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableRowIndicators
} from "../../../../components/v4/ui/table";

type Row = { id: string; name: string; annotated: boolean; rotated: boolean };
const rows: Row[] = [
  { id: "database-url", name: "DATABASE_URL", annotated: true, rotated: false },
  { id: "log-level", name: "LOG_LEVEL", annotated: false, rotated: false },
  { id: "jwt-signing-key", name: "JWT_SIGNING_KEY", annotated: false, rotated: true }
];

export default function RowActions() {
  const columns: DataTableColumn<Row>[] = [
    { id: "name", header: "Name", primary: true, grow: true, render: (row) => row.name },
    {
      id: "value",
      header: "Value",
      grow: true,
      render: (row) => (
        <Inline gap={8} wrap={false}>
          <code>••••••••••••</code>
          {row.annotated && (
            <TableRowIndicators>
              <span>
                <Icon icon={TagsIcon} label="Has tags" />
              </span>
              <span>
                <Icon icon={CodeXmlIcon} label="Has metadata" />
              </span>
            </TableRowIndicators>
          )}
        </Inline>
      )
    }
  ];
  const menu = (row: Row) => (
    <>
      <DropdownMenuItem onSelect={() => toast(`Opened ${row.name}.`)}>
        <Icon name="eye" />
        Open secret
      </DropdownMenuItem>
      <DropdownMenuItem variant="destructive" onSelect={() => toast(`Deleted ${row.name}.`)}>
        <Icon name="trash" />
        Delete secret
      </DropdownMenuItem>
    </>
  );
  const copy = {
    label: "Copy secret",
    icon: "copy",
    disabledReason: (row: Row) => (row.rotated ? "Cannot copy rotated secret" : undefined),
    onSelect: (row: Row) => toast(`Copied the fabricated value of ${row.name}.`)
  } as const;
  const reminder = {
    label: (row: Row) => (row.annotated ? "View reminder" : "Add reminder"),
    icon: "bell",
    onSelect: (row: Row) => toast(`Opened the reminder for ${row.name}.`)
  } as const;
  const edit = {
    label: "Edit value",
    icon: EditIcon,
    disabledReason: (row: Row) => (row.rotated ? "Rotated secrets can't be edited" : undefined),
    onSelect: (row: Row) => toast(`Editing ${row.name}.`)
  } as const;
  const say = (text: string) => () => toast(text);
  const mixed: { name: string; inline: RowActionList }[] = [
    { name: "api", inline: [] },
    {
      name: "workers",
      inline: [{ label: "Edit folder", icon: EditIcon, onSelect: say("Editing workers.") }]
    },
    {
      name: "DATABASE_URL",
      inline: [
        { label: "Add reminder", icon: "bell", onSelect: say("Reminder for DATABASE_URL.") },
        { label: "Edit value", icon: EditIcon, onSelect: say("Editing DATABASE_URL.") },
        { label: "Copy secret", icon: "copy", onSelect: say("Copied DATABASE_URL.") }
      ]
    },
    {
      name: "LOG_LEVEL",
      inline: [
        { label: "Edit value", icon: EditIcon, onSelect: say("Editing LOG_LEVEL.") },
        { label: "Copy secret", icon: "copy", onSelect: say("Copied LOG_LEVEL.") }
      ]
    }
  ];
  const sets: { label: string; actions: DataTableRowActions<Row> }[] = [
    { label: "More only, one square cell", actions: { renderMenu: menu } },
    { label: "One inline action and More", actions: { inline: [copy], renderMenu: menu } },
    {
      label: "Two inline actions and More",
      actions: { inline: [reminder, copy], renderMenu: menu }
    },
    {
      label: "Three inline actions, the cap, and More",
      actions: { inline: [reminder, edit, copy], renderMenu: menu }
    }
  ];
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      {sets.map((set) => (
        <figure key={set.label} className="m-0 flex w-full min-w-0 flex-col gap-3">
          <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
            <DataTable
              label={`Example secrets, ${set.label.toLowerCase()}`}
              rows={rows}
              columns={columns}
              getRowId={(row) => row.id}
              rowLabel={(row) => row.name}
              rowActions={set.actions}
            />
          </div>
          <figcaption className="text-muted-foreground text-xs">{set.label}</figcaption>
        </figure>
      ))}
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Table aria-label="Example folders and secrets, mixed action counts">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableActionsHead slots={4}>Actions</TableActionsHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mixed.map((row) => {
                const rowMenu = (
                  <DropdownMenuItem onSelect={() => toast(`Opened ${row.name}.`)}>
                    <Icon name="eye" />
                    Open
                  </DropdownMenuItem>
                );
                return (
                  <RowContextMenu
                    key={row.name}
                    label={row.name}
                    inline={row.inline}
                    menu={rowMenu}
                  >
                    <TableRow>
                      <TableCell>{row.name}</TableCell>
                      <TableActionsCell slots={4}>
                        <RowActionsGroup label={row.name} inline={row.inline} menu={rowMenu} />
                      </TableActionsCell>
                    </TableRow>
                  </RowContextMenu>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {
            "Mixed counts in one table, each row end-aligned; right-click a row for the same actions"
          }
        </figcaption>
      </figure>
    </div>
  );
}
```

### Shared tooltips

Save this example at `src/pages/design-system/examples/table/shared-tooltips.tsx`; its relative imports are generated for that exact path. States: default, disabled, keyboard.

Registry items used: @cipher/data-table, @cipher/dropdown-menu, @cipher/icon, @cipher/layout, @cipher/sonner, @cipher/text, @cipher/tooltip. Additional packages: none. Install every listed item before compiling this example.

```tsx
import {
  DataTable,
  type DataTableColumn,
  type DataTableRowActions
} from "../../../../components/v4/ui/data-table";
import { DropdownMenuItem } from "../../../../components/v4/ui/dropdown-menu";
import { Icon } from "../../../../components/v4/ui/icon";
import { Inline } from "../../../../components/v4/ui/layout";
import { toast } from "../../../../components/v4/ui/sonner";
import { StatusText } from "../../../../components/v4/ui/text";
import { TooltipProvider, TooltipText } from "../../../../components/v4/ui/tooltip";

type Row = {
  id: string;
  name: string;
  rotated: string;
  locked: boolean;
  environments: Record<string, boolean>;
};

const environments = [
  { id: "dev", label: "Development" },
  { id: "staging", label: "Staging" },
  { id: "prod", label: "Production" }
];

const names = [
  "DATABASE_URL",
  "LOG_LEVEL",
  "JWT_SIGNING_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "REDIS_URL",
  "SMTP_PASSWORD"
];

const rows: Row[] = names.map((name, index) => ({
  id: name.toLowerCase(),
  name,
  rotated: `2026-10-${String(29 - index).padStart(2, "0")} 14:02 UTC`,
  locked: index % 3 === 2,
  environments: { dev: true, staging: index % 2 === 0, prod: index % 4 !== 1 }
}));

export default function SharedTooltips() {
  const columns: DataTableColumn<Row>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      mono: true,
      grow: true,
      render: (row) => row.name
    },
    {
      id: "rotation",
      header: "Rotation",
      render: (row) => (
        <TooltipText
          asChild
          content={
            <>
              Last rotated <code>{row.rotated}</code>
            </>
          }
        >
          <StatusText icon={row.locked ? "lock" : "clock"}>
            {row.locked ? "Locked" : "Scheduled"}
          </StatusText>
        </TooltipText>
      )
    },
    {
      id: "environments",
      header: "Environments",
      render: (row) => (
        <Inline gap={8} wrap={false}>
          {environments.map((env) => {
            const present = row.environments[env.id];
            return (
              <TooltipText
                key={env.id}
                asChild
                content={`${present ? "Present" : "Missing"} in ${env.label}`}
              >
                <span>
                  <Icon
                    name={present ? "check-c" : "minus"}
                    label={`${env.label}: ${present ? "present" : "missing"}`}
                  />
                </span>
              </TooltipText>
            );
          })}
        </Inline>
      )
    }
  ];
  const actions: DataTableRowActions<Row> = {
    inline: [
      {
        label: "Copy secret",
        icon: "copy",
        onSelect: (row) => toast(`Copied the fabricated value of ${row.name}.`)
      },
      {
        label: "Rotate now",
        icon: "sync",
        disabledReason: (row) => (row.locked ? "Locked secrets can't be rotated" : undefined),
        onSelect: (row) => toast(`Rotated ${row.name}.`)
      }
    ],
    renderMenu: (row) => (
      <DropdownMenuItem onSelect={() => toast(`Opened ${row.name}.`)}>
        <Icon name="eye" />
        Open secret
      </DropdownMenuItem>
    )
  };
  return (
    <TooltipProvider>
      <DataTable
        label="Example secrets with status marks and row actions"
        rows={rows}
        columns={columns}
        getRowId={(row) => row.id}
        rowLabel={(row) => row.name}
        rowActions={actions}
      />
    </TooltipProvider>
  );
}
```

### Lazy row actions

Save this example at `src/pages/design-system/examples/table/lazy-row-actions.tsx`; its relative imports are generated for that exact path. States: default, disabled, keyboard.

Registry items used: @cipher/dropdown-menu, @cipher/icon, @cipher/sonner, @cipher/table. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { DropdownMenuItem, DropdownMenuSeparator } from "../../../../components/v4/ui/dropdown-menu";
import { Icon } from "../../../../components/v4/ui/icon";
import { toast } from "../../../../components/v4/ui/sonner";
import {
  type RowActionList,
  RowActions,
  RowContextMenu,
  Table,
  TableActionsCell,
  TableActionsHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../../../../components/v4/ui/table";

const names = [
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SIGNING_KEY",
  "SMTP_PASSWORD",
  "STRIPE_SECRET_KEY",
  "SENTRY_DSN",
  "S3_BUCKET",
  "LOG_LEVEL"
];

export default function LazyRowActions() {
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Table aria-label="Example secrets with lazy row actions">
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableActionsHead slots={2}>Actions</TableActionsHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {names.map((name) => {
                const inline: RowActionList = [
                  {
                    label: "Copy secret",
                    icon: "copy",
                    disabledReason:
                      name === "JWT_SIGNING_KEY" ? "Cannot copy rotated secret" : undefined,
                    onSelect: () => toast(`Copied the fabricated value of ${name}.`)
                  }
                ];
                const menu = (
                  <>
                    <DropdownMenuItem onSelect={() => toast(`Opened ${name}.`)}>
                      <Icon name="eye" />
                      Open secret
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => toast(`Deleted ${name}.`)}
                    >
                      <Icon name="trash" />
                      Delete secret
                    </DropdownMenuItem>
                  </>
                );
                return (
                  <RowContextMenu key={name} label={name} inline={inline} menu={menu}>
                    <TableRow>
                      <TableCell>{name}</TableCell>
                      <TableActionsCell slots={2}>
                        <RowActions lazy label={name} inline={inline} menu={menu} />
                      </TableActionsCell>
                    </TableRow>
                  </RowContextMenu>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {
            "Lazy row actions: plain buttons until a row is hovered or focused, then tooltips and the More menu"
          }
        </figcaption>
      </figure>
    </div>
  );
}
```

### Row activation

Save this example at `src/pages/design-system/examples/table/row-activation.tsx`; its relative imports are generated for that exact path. States: default, keyboard, controlled.

Registry items used: @cipher/button, @cipher/data-table, @cipher/dropdown-menu, @cipher/sonner, @cipher/table. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as React from "react";

import { Button } from "../../../../components/v4/ui/button";
import { DataTable, type DataTableColumn } from "../../../../components/v4/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../../../../components/v4/ui/dropdown-menu";
import { toast } from "../../../../components/v4/ui/sonner";
import {
  RowActions,
  RowContextMenu,
  Table,
  TableActionsCell,
  TableActionsHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../../../../components/v4/ui/table";

type Cert = { id: string; cn: string; serial: string; expires: string };
const certs: Cert[] = [
  { id: "api", cn: "api.example.com", serial: "4f:1c:9a:02", expires: "2026-12-04" },
  { id: "auth", cn: "auth.example.com", serial: "7b:20:e1:5d", expires: "2027-02-18" },
  { id: "billing", cn: "billing.example.com", serial: "0e:93:44:c8", expires: "2027-05-30" }
];

export default function RowActivation() {
  const [selected, setSelected] = React.useState<string[]>([]);
  const open = (cert: Cert) => toast(`Opened ${cert.cn}.`);
  const columns: DataTableColumn<Cert>[] = [
    {
      id: "cn",
      header: "Common name",
      primary: true,
      grow: true,
      text: (row) => row.cn,
      render: (row) => (
        <Button variant="link" underline="hover" onClick={() => open(row)}>
          {row.cn}
        </Button>
      )
    },
    { id: "serial", header: "Serial", width: 136, render: (row) => row.serial },
    { id: "expires", header: "Expires", width: 120, render: (row) => row.expires },
    {
      id: "actions",
      header: "Actions",
      actions: true,
      render: (row) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-row" icon="more" iconOnly>
              {`Actions for ${row.cn}`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => toast(`Renewal requested for ${row.cn}.`)}>
              Renew
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )
    }
  ];
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <DataTable
            label="Certificates"
            rows={certs}
            columns={columns}
            getRowId={(row) => row.id}
            rowLabel={(row) => row.cn}
            selectable
            selectedIds={selected}
            onSelectionChange={setSelected}
            onRowActivate={open}
          />
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Whole row opens the certificate"}
        </figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Table aria-label="Certificates, native table">
            <TableHeader>
              <TableRow>
                <TableHead>Common name</TableHead>
                <TableHead>Expires</TableHead>
                <TableActionsHead>Actions</TableActionsHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {certs.map((cert) => {
                const menu = (
                  <DropdownMenuItem onSelect={() => toast(`Renewal requested for ${cert.cn}.`)}>
                    Renew
                  </DropdownMenuItem>
                );
                return (
                  <RowContextMenu key={cert.id} label={cert.cn} menu={menu}>
                    <TableRow onClick={() => open(cert)}>
                      <TableCell>{cert.cn}</TableCell>
                      <TableCell>{cert.expires}</TableCell>
                      <TableActionsCell>
                        <RowActions label={cert.cn} menu={menu} />
                      </TableActionsCell>
                    </TableRow>
                  </RowContextMenu>
                );
              })}
            </TableBody>
          </Table>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Native TableRow onClick ignores its portaled menu"}
        </figcaption>
      </figure>
    </div>
  );
}
```

### Pagination

Save this example at `src/pages/design-system/examples/table/pagination.tsx`; its relative imports are generated for that exact path. States: default, controlled.

Registry items used: @cipher/data-table, @cipher/pagination. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as React from "react";

import { DataTable, type DataTableColumn } from "../../../../components/v4/ui/data-table";
import { Pagination } from "../../../../components/v4/ui/pagination";

type Event = { id: string; actor: string; action: string; at: string };
const actors = ["ci-deployer", "sarah@acme.dev", "rotation-worker", "k8s-operator"];
const actions = ["secret.read", "secret.update", "identity.login", "key.rotate"];
const events: Event[] = Array.from({ length: 132 }, (_, index) => ({
  id: `event-${index + 1}`,
  actor: actors[index % actors.length],
  action: actions[(index * 3) % actions.length],
  at: `2026-10-${String(28 - (index % 28)).padStart(2, "0")}`
}));
const columns: DataTableColumn<Event>[] = [
  { id: "actor", header: "Actor", primary: true, grow: true, render: (row) => row.actor },
  { id: "action", header: "Action", width: 160, render: (row) => row.action },
  { id: "at", header: "Date", width: 120, render: (row) => row.at }
];

export default function PaginationSlot() {
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(20);
  const rows = events.slice((page - 1) * pageSize, page * pageSize);
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <DataTable
            label="Audit events"
            rows={rows}
            columns={columns}
            getRowId={(row) => row.id}
            rowLabel={(row) => `${row.actor} ${row.action}`}
            pagination={
              <Pagination
                label="Audit event pages"
                variant="compact"
                page={page}
                onPageChange={setPage}
                total={events.length}
                pageSize={pageSize}
                pageSizeOptions={[10, 20, 50, 100]}
                onPageSizeChange={setPageSize}
              />
            }
          />
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Rows per page, range and previous and next"}
        </figcaption>
      </figure>
    </div>
  );
}
```

### Loading rows

Save this example at `src/pages/design-system/examples/table/loading.tsx`; its relative imports are generated for that exact path. States: loading, default.

Registry items used: @cipher/badge, @cipher/button, @cipher/data-table, @cipher/layout. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as React from "react";

import { Badge } from "../../../../components/v4/ui/badge";
import { Button } from "../../../../components/v4/ui/button";
import { DataTable, type DataTableColumn } from "../../../../components/v4/ui/data-table";
import { Stack } from "../../../../components/v4/ui/layout";

type Key = { id: string; name: string; algorithm: string; status: "active" | "disabled" };
const keys: Key[] = [
  { id: "backup", name: "backup-signing", algorithm: "AES-256-GCM", status: "active" },
  { id: "billing", name: "billing-pii", algorithm: "AES-256-GCM", status: "active" },
  { id: "legacy", name: "legacy-exports", algorithm: "AES-128-GCM", status: "disabled" }
];
const columns: DataTableColumn<Key>[] = [
  { id: "name", header: "Name", primary: true, grow: true, render: (row) => row.name },
  { id: "algorithm", header: "Algorithm", width: 136, render: (row) => row.algorithm },
  {
    id: "status",
    header: "Status",
    width: 112,
    render: (row) =>
      row.status === "active" ? (
        <Badge tone="ok" dot>
          Active
        </Badge>
      ) : (
        <Badge tone="outline">Disabled</Badge>
      )
  },
  {
    id: "actions",
    header: "Actions",
    actions: true,
    render: (row) => (
      <Button variant="ghost" size="icon-row" icon="more" iconOnly>
        {`Actions for ${row.name}`}
      </Button>
    )
  }
];

function KeyTable({ label, loading }: { label: string; loading?: boolean }) {
  return (
    <DataTable
      label={label}
      rows={keys}
      columns={columns}
      getRowId={(row) => row.id}
      rowLabel={(row) => row.name}
      selectable
      loading={loading}
      loadingRows={3}
    />
  );
}

export default function Loading() {
  const [reloading, setReloading] = React.useState(false);
  React.useEffect(() => {
    if (!reloading) return undefined;
    const timer = window.setTimeout(() => setReloading(false), 1200);
    return () => window.clearTimeout(timer);
  }, [reloading]);
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <KeyTable label="Keys, loading" loading />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Loading"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <KeyTable label="Keys, loaded" />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Loaded"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Stack gap={12}>
            <div>
              <Button variant="outline" disabled={reloading} onClick={() => setReloading(true)}>
                Reload keys
              </Button>
            </div>
            <KeyTable label="Keys, reloadable" loading={reloading} />
          </Stack>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Reload in place"}</figcaption>
      </figure>
    </div>
  );
}
```

### Grouped rows

Save this example at `src/pages/design-system/examples/table/grouped-rows.tsx`; its relative imports are generated for that exact path. States: default, controlled, keyboard.

Registry items used: @cipher/badge, @cipher/data-table, @cipher/dropdown-menu, @cipher/icon, @cipher/layout, @cipher/sonner, @cipher/table. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as React from "react";

import { Badge } from "../../../../components/v4/ui/badge";
import {
  DataTable,
  type DataTableColumn,
  type DataTableGroup
} from "../../../../components/v4/ui/data-table";
import { DropdownMenuItem } from "../../../../components/v4/ui/dropdown-menu";
import { Icon } from "../../../../components/v4/ui/icon";
import { Inline } from "../../../../components/v4/ui/layout";
import { toast } from "../../../../components/v4/ui/sonner";
import { RowActions } from "../../../../components/v4/ui/table";

type Account = { id: string; name: string; type: string; lastAccess: string };
type Resource = { id: string; name: string; accounts: Account[] };
type Sort = { columnId: string; direction: "asc" | "desc" };

const resources: Resource[] = [
  {
    id: "prod-postgres",
    name: "prod-postgres",
    accounts: [
      { id: "pg-readonly", name: "readonly", type: "PostgreSQL", lastAccess: "2 hours ago" },
      { id: "pg-admin", name: "admin", type: "PostgreSQL", lastAccess: "3 days ago" },
      { id: "pg-migrator", name: "migrator", type: "PostgreSQL", lastAccess: "Never" }
    ]
  },
  {
    id: "billing-mysql",
    name: "billing-mysql",
    accounts: [
      { id: "my-reporting", name: "reporting", type: "MySQL", lastAccess: "Yesterday" },
      { id: "my-root", name: "root", type: "MySQL", lastAccess: "2 weeks ago" }
    ]
  },
  {
    id: "bastion",
    name: "bastion.internal",
    accounts: [{ id: "ssh-ops", name: "ops", type: "SSH", lastAccess: "5 minutes ago" }]
  }
];

type Node = { id: string; name: string; kind: "resource" | "account"; children?: Node[] };
const tree: Node[] = resources.slice(0, 2).map((resource) => ({
  id: resource.id,
  name: resource.name,
  kind: "resource",
  children: resource.accounts.map((account) => ({
    id: account.id,
    name: account.name,
    kind: "account"
  }))
}));

export default function GroupedRows() {
  const [sort, setSort] = React.useState<Sort>({ columnId: "name", direction: "asc" });
  const [selected, setSelected] = React.useState<string[]>([]);
  const groups: DataTableGroup<Account>[] = resources.map((resource) => ({
    id: resource.id,
    label: (
      <Inline gap={8} align="center" wrap={false}>
        <Icon name="machine" />
        <span>{resource.name}</span>
      </Inline>
    ),
    meta: `${resource.accounts.length} ${resource.accounts.length === 1 ? "account" : "accounts"}`,
    actions: (
      <RowActions
        label={resource.name}
        menu={
          <DropdownMenuItem onSelect={() => toast(`Copied the ID of ${resource.name}.`)}>
            <Icon name="copy" />
            Copy resource ID
          </DropdownMenuItem>
        }
      />
    ),
    rows: [...resource.accounts].sort(
      (a, b) => a.name.localeCompare(b.name) * (sort.direction === "asc" ? 1 : -1)
    )
  }));
  const columns: DataTableColumn<Account>[] = [
    {
      id: "name",
      header: "Account",
      primary: true,
      grow: true,
      sortable: true,
      text: (row) => row.name,
      render: (row) => (
        <Inline gap={8} align="center" wrap={false}>
          <Icon name="user" />
          <span>{row.name}</span>
          <Badge tone="outline">{row.type}</Badge>
        </Inline>
      )
    },
    { id: "access", header: "Last access", width: 160, render: (row) => row.lastAccess }
  ];
  const treeColumns: DataTableColumn<Node>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      grow: true,
      text: (row) => row.name,
      render: (row) => (
        <Inline gap={8} align="center" wrap={false}>
          <Icon name={row.kind === "resource" ? "machine" : "user"} />
          <span>{row.name}</span>
        </Inline>
      )
    },
    {
      id: "kind",
      header: "Kind",
      width: 120,
      render: (row) => (row.kind === "resource" ? "Resource" : "Account")
    }
  ];
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <DataTable
            label="Accounts by resource"
            groups={groups}
            columns={columns}
            getRowId={(row) => row.id}
            rowLabel={(row) => row.name}
            sort={sort}
            onSortChange={setSort}
            selectable
            selectedIds={selected}
            onSelectionChange={setSelected}
            onRowActivate={(row) => toast(`Opened ${row.name}.`)}
            rowActions={{
              inline: [
                {
                  label: "Launch session",
                  icon: "terminal",
                  onSelect: (row) => toast(`Launched a session as ${row.name}.`)
                }
              ],
              renderMenu: (row) => (
                <DropdownMenuItem onSelect={() => toast(`Copied the ID of ${row.name}.`)}>
                  <Icon name="copy" />
                  Copy account ID
                </DropdownMenuItem>
              )
            }}
          />
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Accounts grouped by resource, sorted within each group"}
        </figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <DataTable
            label="Resources and their accounts"
            rows={tree}
            getRowChildren={(row) => row.children}
            columns={treeColumns}
            getRowId={(row) => row.id}
            rowLabel={(row) => row.name}
          />
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Child rows under a parent row"}
        </figcaption>
      </figure>
    </div>
  );
}
```

### Column toggle, permission matrix

Save this example at `src/pages/design-system/examples/table/column-toggle.tsx`; its relative imports are generated for that exact path. States: default, disabled, keyboard, controlled.

Registry items used: @cipher/button, @cipher/data-table, @cipher/icon, @cipher/sonner, @cipher/tooltip. Additional packages: lucide-react@^0.544.0. Install every listed item before compiling this example.

```tsx
import * as React from "react";
import { BanIcon, FilterIcon } from "lucide-react";

import { Button } from "../../../../components/v4/ui/button";
import { DataTable, type DataTableColumn } from "../../../../components/v4/ui/data-table";
import { Icon } from "../../../../components/v4/ui/icon";
import { toast } from "../../../../components/v4/ui/sonner";
import { Tooltip } from "../../../../components/v4/ui/tooltip";

type Action = "read" | "create" | "edit" | "delete";
type Grant = boolean | "some";
type Policy = {
  id: string;
  subject: string;
  managed?: boolean;
  actions: Action[];
  grants: Partial<Record<Action, Grant>>;
  conditions?: Partial<Record<Action, string>>;
  forbid?: Partial<Record<Action, string>>;
};

const actions: { id: Action; header: string }[] = [
  { id: "read", header: "Read" },
  { id: "create", header: "Create" },
  { id: "edit", header: "Edit" },
  { id: "delete", header: "Delete" }
];
const all: Action[] = ["read", "create", "edit", "delete"];

const initial: Policy[] = [
  {
    id: "secrets",
    subject: "Secrets",
    actions: all,
    grants: { read: true, create: true, edit: true },
    conditions: { edit: "Only in /payments, staging and production" }
  },
  {
    id: "folders",
    subject: "Secret folders",
    actions: all,
    grants: { read: "some" },
    conditions: { read: "Two rules: /payments allowed, /legacy forbidden" },
    forbid: { delete: "Forbidden by the Read only folders rule" }
  },
  { id: "imports", subject: "Secret imports", actions: all, grants: {} },
  { id: "rotation", subject: "Secret rotation", actions: ["read", "edit"], grants: { read: true } },
  { id: "audit", subject: "Audit logs", managed: true, actions: ["read"], grants: { read: true } }
];

function Mark({ kind, text }: { kind: "condition" | "forbid"; text: string }) {
  return (
    <Tooltip content={text}>
      <Button type="button" variant="ghost" size="icon-row">
        <Icon icon={kind === "condition" ? FilterIcon : BanIcon} />
        <span className="sr-only">
          {kind === "condition" ? `Conditions: ${text}` : `Forbidden: ${text}`}
        </span>
      </Button>
    </Tooltip>
  );
}

const markFor = (action: Action) => (row: Policy) => {
  const condition = row.conditions?.[action];
  const forbid = row.forbid?.[action];
  if (forbid) return <Mark kind="forbid" text={forbid} />;
  return condition ? <Mark kind="condition" text={condition} /> : null;
};

export default function ColumnToggle() {
  const [policies, setPolicies] = React.useState(initial);
  const columns: DataTableColumn<Policy>[] = [
    {
      id: "subject",
      header: "Policy",
      primary: true,
      grow: true,
      text: (row) => row.subject,
      render: (row) => row.subject
    },
    ...actions.map((action): DataTableColumn<Policy> => ({
      id: action.id,
      header: action.header,
      width: 120,
      toggle: {
        checked: (row) => {
          const grant = row.grants[action.id] ?? false;
          return grant === "some" ? "indeterminate" : grant;
        },
        absent: (row) => !row.actions.includes(action.id),
        disabledReason: (row) =>
          row.managed ? "Managed by Infisical. Audit log access cannot change." : undefined,
        adornment: markFor(action.id),
        onChange: (ids, checked) => {
          setPolicies((current) =>
            current.map((row) =>
              ids.includes(row.id)
                ? { ...row, grants: { ...row.grants, [action.id]: checked } }
                : row
            )
          );
          toast(
            `${checked ? "Allowed" : "Removed"} ${action.header.toLowerCase()} on ${ids.length} ${ids.length === 1 ? "policy" : "policies"}.`
          );
        }
      }
    }))
  ];
  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-6">
      <DataTable
        label="Developer role permissions"
        rows={policies}
        columns={columns}
        getRowId={(row) => row.id}
        rowLabel={(row) => row.subject}
      />
    </div>
  );
}
```

### Leading pins and a full-width cell

Save this example at `src/pages/design-system/examples/table/leading-pin.tsx`; its relative imports are generated for that exact path. States: default, controlled, overflow.

Registry items used: @cipher/button, @cipher/checkbox, @cipher/data-table, @cipher/dropdown-menu, @cipher/icon, @cipher/input, @cipher/popover, @cipher/table. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as React from "react";

import { Button } from "../../../../components/v4/ui/button";
import { Checkbox } from "../../../../components/v4/ui/checkbox";
import { DataTable, type DataTableColumn, EnvMark } from "../../../../components/v4/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../../../../components/v4/ui/dropdown-menu";
import { Icon } from "../../../../components/v4/ui/icon";
import { Input } from "../../../../components/v4/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from "../../../../components/v4/ui/popover";
import {
  RowActions,
  RowContextMenu,
  Table,
  TableActionsCell,
  TableActionsHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeadButton,
  TableHeader,
  TableRow
} from "../../../../components/v4/ui/table";

const environments = [
  "Development",
  "Staging",
  "QA",
  "UAT",
  "Performance",
  "Sandbox",
  "Demo",
  "Preview",
  "Canary",
  "Production US",
  "Production EU",
  "Production AP"
];

type Secret = { id: string; name: string; present: number[] };

const secrets: Secret[] = [
  { id: "stripe", name: "STRIPE_API_KEY", present: [0, 1, 2, 9, 10, 11] },
  { id: "database", name: "DATABASE_URL", present: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
  { id: "sentry", name: "SENTRY_DSN", present: [1, 9, 10] },
  { id: "redis", name: "REDIS_PASSWORD", present: [0, 1, 3, 9] },
  { id: "jwt", name: "JWT_SIGNING_SECRET", present: [0, 1, 2, 3, 9, 10, 11] },
  { id: "smtp", name: "SMTP_PASSWORD", present: [9, 10, 11] }
];

const copyAction = (name: string) => ({
  label: `Copy ${name}`,
  icon: "copy" as const,
  onSelect: () => navigator.clipboard?.writeText(name)
});

function ValueEditor({
  label,
  open,
  onOpenChange
}: {
  label: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs">
          ••••••••
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>{label}</PopoverTitle>
        </PopoverHeader>
        <Button onClick={() => onOpenChange(false)}>Done</Button>
      </PopoverContent>
    </Popover>
  );
}

function Matrix() {
  const [selected, setSelected] = React.useState<string[]>(["stripe"]);
  const [expanded, setExpanded] = React.useState<string | null>("database");
  const [editing, setEditing] = React.useState<string | null>(null);
  const [descending, setDescending] = React.useState(false);
  const ordered = [...secrets].sort((a, b) => a.name.localeCompare(b.name) * (descending ? -1 : 1));
  const allState = () => {
    if (selected.length === secrets.length) return true;
    return selected.length > 0 ? "indeterminate" : false;
  };
  const toggle = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((entry) => entry !== id) : [...current, id]
    );
  return (
    <Table aria-label="Secrets across twelve environments">
      <TableHeader>
        <TableRow>
          <TableHead selection pin="start">
            <Checkbox
              aria-label="Select every secret"
              checked={allState()}
              onCheckedChange={() =>
                setSelected(
                  selected.length === secrets.length ? [] : secrets.map((secret) => secret.id)
                )
              }
            />
          </TableHead>
          <TableHead scope="col" pin="start" aria-sort={descending ? "descending" : "ascending"}>
            <TableHeadButton data-active onClick={() => setDescending(!descending)}>
              Name
              <Icon name={descending ? "arrow-down" : "arrow-up"} />
            </TableHeadButton>
          </TableHead>
          {environments.map((environment) => (
            <TableHead key={environment} scope="col">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <TableHeadButton>
                    {environment}
                    <Icon name="chev-down" />
                  </TableHeadButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem>Sort by last change</DropdownMenuItem>
                  <DropdownMenuItem>{`Hide ${environment}`}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableHead>
          ))}
          <TableActionsHead slots={1} />
        </TableRow>
      </TableHeader>
      <TableBody>
        {ordered.map((secret) => (
          <React.Fragment key={secret.id}>
            <RowContextMenu label={secret.name} inline={[copyAction(secret.name)]}>
              <TableRow data-state={selected.includes(secret.id) ? "selected" : undefined}>
                <TableCell selection pin="start">
                  <Checkbox
                    aria-label={`Select ${secret.name}`}
                    checked={selected.includes(secret.id)}
                    onCheckedChange={() => toggle(secret.id)}
                  />
                </TableCell>
                <TableCell pin="start">
                  <Button
                    variant="ghost"
                    size="xs"
                    icon={expanded === secret.id ? "chev-down" : "chev-right"}
                    aria-expanded={expanded === secret.id}
                    onClick={() => setExpanded(expanded === secret.id ? null : secret.id)}
                  >
                    {secret.name}
                  </Button>
                </TableCell>
                {environments.map((environment, index) => (
                  <TableCell key={environment}>
                    <EnvMark env={environment} present={secret.present.includes(index)} />
                  </TableCell>
                ))}
                <TableActionsCell slots={1}>
                  <RowActions label={secret.name} inline={[copyAction(secret.name)]} />
                </TableActionsCell>
              </TableRow>
            </RowContextMenu>
            {expanded === secret.id && (
              <TableRow>
                <TableCell pin="viewport" colSpan={environments.length + 3}>
                  <div>
                    <Table aria-label={`${secret.name} by environment`}>
                      <TableHeader>
                        <TableRow>
                          <TableHead scope="col">Environment</TableHead>
                          <TableHead scope="col">Value</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {environments.slice(0, 4).map((environment) => (
                          <TableRow
                            key={environment}
                            focused={editing === `${secret.id}:${environment}`}
                          >
                            <TableCell>
                              <span>{environment}</span>
                            </TableCell>
                            <TableCell>
                              <ValueEditor
                                label={`${secret.name} in ${environment}`}
                                open={editing === `${secret.id}:${environment}`}
                                onOpenChange={(open) =>
                                  setEditing(open ? `${secret.id}:${environment}` : null)
                                }
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </TableCell>
              </TableRow>
            )}
          </React.Fragment>
        ))}
        <TableRow>
          <TableCell selection pin="start" />
          <TableCell pin="start">
            <Input aria-label="New secret name" placeholder="Add a secret name" />
          </TableCell>
          <TableCell colSpan={environments.length + 1}>
            <Input aria-label="New secret value" placeholder="Add a secret value" />
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  );
}

export default function LeadingPinExample() {
  const columns: DataTableColumn<Secret>[] = [
    {
      id: "name",
      header: "Name",
      primary: true,
      pin: "start",
      width: 220,
      render: (row) => row.name
    },
    ...environments.map((environment, index): DataTableColumn<Secret> => ({
      id: environment,
      header: environment,
      width: 128,
      render: (row) => <EnvMark env={environment} present={row.present.includes(index)} />
    }))
  ];
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Matrix />
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {
            "Native Table: selection and Name pinned at the start, actions at the end, an expanded row's full-width cell"
          }
        </figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <DataTable
            label="Secrets across twelve environments"
            variant="striped"
            rows={secrets}
            columns={columns}
            getRowId={(row) => row.id}
            rowLabel={(row) => row.name}
            selectable
            defaultSelectedIds={["database"]}
            rowActions={{
              inline: [{ label: "Copy name", icon: "copy", onSelect: () => undefined }]
            }}
          />
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"DataTable, striped: a start-pinned Name column after selection"}
        </figcaption>
      </figure>
    </div>
  );
}
```

### Row focus while editing

Save this example at `src/pages/design-system/examples/table/row-focus.tsx`; its relative imports are generated for that exact path. States: default, controlled.

Registry items used: @cipher/badge, @cipher/button, @cipher/data-table, @cipher/popover, @cipher/table, @cipher/text. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as React from "react";

import { Badge } from "../../../../components/v4/ui/badge";
import { Button } from "../../../../components/v4/ui/button";
import { DataTable, type DataTableColumn } from "../../../../components/v4/ui/data-table";
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger
} from "../../../../components/v4/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "../../../../components/v4/ui/table";
import { SmallText } from "../../../../components/v4/ui/text";

type Secret = { id: string; name: string; tags: string[] };

const secrets: Secret[] = [
  { id: "stripe", name: "STRIPE_API_KEY", tags: ["billing"] },
  { id: "database", name: "DATABASE_URL", tags: ["core", "rotated"] },
  { id: "sentry", name: "SENTRY_DSN", tags: [] },
  { id: "redis", name: "REDIS_PASSWORD", tags: ["core"] }
];

const environments = [
  { id: "development", name: "Development", tags: ["local"] },
  { id: "staging", name: "Staging", tags: [] },
  { id: "production", name: "Production", tags: ["pci"] }
];

function TagEditor({
  label,
  tags,
  open,
  onOpenChange
}: {
  label: string;
  tags: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs">
          {tags.length ? tags.join(", ") : "Add tags"}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start">
        <PopoverHeader>
          <PopoverTitle>{`Tags on ${label}`}</PopoverTitle>
        </PopoverHeader>
        <div className="flex flex-wrap gap-2">
          {tags.length ? tags.map((tag) => <Badge key={tag}>{tag}</Badge>) : "No tags yet"}
        </div>
        <Button onClick={() => onOpenChange(false)}>Done</Button>
      </PopoverContent>
    </Popover>
  );
}

function DimAmount() {
  const ref = React.useRef<HTMLSpanElement>(null);
  const [value, setValue] = React.useState("");
  React.useLayoutEffect(() => {
    if (ref.current)
      setValue(getComputedStyle(ref.current).getPropertyValue("--v4-opacity-row-dim").trim());
  }, []);
  return (
    <SmallText muted>
      <span ref={ref}>
        <code>opacity-row-dim</code> {value}
      </span>
    </SmallText>
  );
}

export default function RowFocusExample() {
  const [editing, setEditing] = React.useState<string | null>(null);
  const [nested, setNested] = React.useState<string | null>(null);
  const toggle = (set: (id: string | null) => void, id: string) => (open: boolean) =>
    set(open ? id : null);
  const columns: DataTableColumn<Secret>[] = [
    { id: "name", header: "Name", primary: true, grow: true, render: (row) => row.name },
    {
      id: "tags",
      header: "Tags",
      width: 220,
      render: (row) => (
        <TagEditor
          label={row.name}
          tags={row.tags}
          open={editing === row.id}
          onOpenChange={toggle(setEditing, row.id)}
        />
      )
    }
  ];
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <DimAmount />
          <DataTable
            label="Secrets"
            rows={secrets}
            columns={columns}
            getRowId={(row) => row.id}
            rowLabel={(row) => row.name}
            focusedRowId={editing ?? undefined}
          />
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Editing a row's tags focuses it; the other rows dim"}
        </figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Table aria-label="Secrets by environment">
            <TableHeader>
              <TableRow>
                <TableHead scope="col">Name</TableHead>
                <TableHead scope="col">Environments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell>STRIPE_API_KEY</TableCell>
                <TableCell>3 of 3</TableCell>
              </TableRow>
              <TableRow>
                <TableCell>DATABASE_URL</TableCell>
                <TableCell>3 of 3</TableCell>
              </TableRow>
              <TableRow>
                <TableCell colSpan={2}>
                  <Table aria-label="DATABASE_URL by environment">
                    <TableHeader>
                      <TableRow>
                        <TableHead scope="col">Environment</TableHead>
                        <TableHead scope="col">Tags</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {environments.map((environment) => (
                        <TableRow key={environment.id} focused={nested === environment.id}>
                          <TableCell>{environment.name}</TableCell>
                          <TableCell>
                            <TagEditor
                              label={`DATABASE_URL in ${environment.name}`}
                              tags={environment.tags}
                              open={nested === environment.id}
                              onOpenChange={toggle(setNested, environment.id)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell>SENTRY_DSN</TableCell>
                <TableCell>2 of 3</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Nested: focusing an environment row dims the outer rows too, not its secret"}
        </figcaption>
      </figure>
    </div>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- runtime: npm test -- src/components/v4/ui/data-grid-model.test.ts src/components/v4/ui/specialist.test.tsx
- static: npm run type:check
- browser: Open the executable example and verify keyboard, narrow viewport, dark theme and failure recovery.
