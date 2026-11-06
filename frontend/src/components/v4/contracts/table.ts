import type { ComponentDefinition } from "./types";

export const tableDefinition = {
  id: "table",
  title: "Table",
  group: "Data display",
  summary: "Semantic object tables with a typed data companion for selection and large datasets.",
  sourceFiles: [
    "src/components/v4/ui/table.tsx",
    "src/components/v4/ui/data-table.tsx",
    "src/components/v4/ui/data.module.css",
    "src/components/v4/ui/data-table.test.tsx",
    "src/components/v4/ui/frame.module.css",
    "src/components/v4/tokens.json"
  ],
  exports: [
    "DataTable",
    "Table",
    "TableHeader",
    "TableBody",
    "TableRow",
    "TableHead",
    "TableCell",
    "TableFooter",
    "TableCaption",
    "TableRowActions",
    "TableRowIndicators",
    "TableActionsHead",
    "TableActionsCell",
    "RowActions",
    "RowAction",
    "RowActionList",
    "DataTableColumn",
    "DataTableToggle",
    "DataTableRowAction",
    "DataTableRowActions",
    "DataTableGroup",
    "EnvMark"
  ],
  referenceNames: ["Table"],
  behavior: [
    "Row states are layers over the row's ground, which is surface, or row-done on a striped even row. The selected surface and the hover overlay (ink at the opacity-hover token) stack over the ground on every cell, and a pinned cell or the sticky tail repaints the same ground and layers opaquely, so a striped, selected or hovered row reads as one band to the frame edge and scrolled cells never show through.",
    "DataTable composes existing Table parts without imposing ARIA grid keyboard semantics.",
    "DataTable sits in the shared tint frame: the column header row is a 40px uppercase eyebrow row in the frame and the body rows sit on the inset raised surface.",
    "Basic/striped/bordered, controlled sorting, stable selection, empty and load-more.",
    "Sortable headers show the direction with a custom-set arrow: up for ascending and down for descending, always visible on the sorted column. An unsorted column shows the up arrow it would apply only while its header is hovered or focused. The sorted header steps up to ink.",
    "Content sizing floors, capped values, pinned action column and optional fixed-height row virtualization.",
    "Rows are size-row (40px) through one variable, --v4-table-row-height, which falls back to the token; DataTable reads size-row at runtime as its default virtual metric, so the CSS row and the scroll model never disagree. Cells pad by space-row-inline (12px), the content edge text and glyphs share.",
    "Row actions are persistent. rowActions adds a sticky tail column, pinned to the inline end, that shows every row's actions at rest: up to three inline icon actions (Button icon-row, the same set on every row, each with a tooltip of its label or its disabled reason) followed by the More menu when renderMenu is set. A blocked action stays in place, disabled, with its reason. Nothing appears on hover, so a hovered row never changes a cell's width or the row's layout.",
    "Destructive row actions (Delete, Remove, Revoke, Disable and similar irreversible or access-removing actions) never appear in rowActions.inline or RowActions inline. They appear in the More menu as its last item, after a DropdownMenuSeparator if the menu has other items, as a DropdownMenuItem with variant destructive. A row whose only action is destructive still uses More, so More is the single action in its tail.",
    "The actions tail end-aligns its actions, header included: on every row the last action's end edge sits space-row-actions-inset inside the frame edge, whatever the row's action count, so a row with fewer actions than the widest leaves its gap at the start, by the line-soft divider. A single action sits 5px clear of each line. Its width follows its contents: size-row (40px, a square) for one action and size-row-action-step (28px) more for each further one, so More alone is 40, one inline action and More is 68, two is 96 and three is 124. The cell keeps the pinned divider, the frame-pad fill, the row's stripe, the hover overlay and the selected surface.",
    "Every actions tail uses this standard by default, whether it comes from rowActions, TableActionsCell or a column with actions true: it caps each Button inside it at size-target-row (28px), the row target height, so icon-row targets and a text button such as Open share one height, centered vertically in the row and end-aligned. The cell's inline padding is the same space-row-actions-inset, so a single target reads square and a text button gets the same clearance on each side. Examples and composites set no width, size or padding on the actions tail.",
    "TableRowActions is the end-aligned group inside the actions tail, with targets touching (space-row-actions-gap, 0). For a native Table, TableActionsHead and TableActionsCell take slots, the widest row's action count, and draw the same actions tail; RowActions renders the inline actions and More inside it. TableRowIndicators lays persistent row marks in size-target-row slots with size-glyph glyphs, pulled so the last glyph lands on the 12px content edge; marks never swap out for actions.",
    "The selection column is size-row wide with its Checkbox centered between the frame edge and a persistent line-soft divider on its right, the same line as the actions tail divider, on the header and every row, at rest, hovered and selected.",
    'The selection column always uses one hook, the selection prop on TableHead and TableCell (data-slot "table-selection"), in DataTable and in a native Table alike. It owns the width, padding, centered Checkbox and divider, and repaints the row\'s ground and its stripe, hover and selected layers on the cell, so the column reads as one band with its row and stays opaque if pinned. The selection cell counts as row-interactive, so a click on it never activates the row. Nothing else draws a selection column. The divider is on by default; an icon or expand column that doubles as selection, such as the one on the Secrets overview, may pass divider false on its TableHead and TableCell (data-divider "false") to drop it, and keeps everything else the hook owns.',
    "Responsibilities: tokens own the numbers (size-row, size-target-row, size-row-action-step, size-glyph, space-row-inline, space-row-actions-gap, space-row-actions-inset, space-row-indent); DataTable rowActions, the tail cells, RowActions and TableRowIndicators own geometry; a composite chooses which actions a row shows and their order, and sets no sizes, gaps or offsets.",
    "With a fixed height, load-more sits in flow after the last loaded row, inside the scroll frame, so nothing covers readable rows; the outline button morphs to its loading state in place. Once loadMore is undefined, the optional end message takes the same slot.",
    "onRowActivate makes every row a pointer target with the ordinary hover overlay. A click anywhere in the row activates it unless it lands on a link, button, input, checkbox, menu item, tooltip trigger, the selection cell, the actions cell or anything marked data-row-interactive, or it ends a text selection inside the row. Menu items rendered in a portal never reach the row.",
    "TableRow's onClick applies the same filter, in one place that DataTable's onRowActivate also goes through: it runs only for a primary click whose target is inside the row's own DOM and not on an interactive element there. Clicks that bubble through React from portaled content opened from the row (a menu, popover or dialog) are ignored, so a native Table row needs no stopPropagation on its menus, buttons, checkboxes or actions cell.",
    "pagination renders its node in a foot inside the tint frame, below the rows. It stays in view while a wide table scrolls sideways and, with a fixed height, while the rows scroll.",
    "loading replaces the rows with loadingRows (default 5) skeleton rows at the same row height: a square for the selection and actions cells and a size-skeleton-text bar for each value, shorter in the primary column. Empty and load-more stay hidden while loading.",
    "When every column declares a width, grows to fill the rest or is an actions column, the table uses fixed layout with a floor of the declared widths plus size-cell-min per growing column, so widths never move between loading and loaded rows or as cell content changes.",
    "actionBar hosts the table's FloatingActionBar. While the bar shows, the table reserves size-action-bar plus the bar's offset (space-action-bar-offset, or space-action-bar-offset-contained) below itself, so the last row can scroll clear of the bar.",
    "Table's ref targets the table element. containerRef targets its horizontal scroll container (what v3 Table's ref pointed at) and containerClassName adds layout classes to it. DataTable takes the same two props for its scroll frame, which scrolls both ways when height is set, so ports keep reading scrollTop, observing scroll or calling scrollTo.",
    "A column with toggle is a boolean column: every cell is a Checkbox and the header gets a tri-state Checkbox before its title. The header reads checked when every enabled row is on, indeterminate when some are, and unchecked when none are. Selecting it turns every enabled row on, or off when all are on, and calls onChange once with only the row ids that change. Rows with a disabledReason keep their value, are left out of the count, and show the reason on their disabled cell; with no enabled rows the header is disabled. render is optional on a toggle column.",
    'checked may return "indeterminate" for a partial grant: the cell shows a mixed Checkbox, and the header counts the row as not on, so it reads checked only when every counted row is fully on. From mixed, a cell click or a header click that turns the column on sets the row on. absent(row) marks a row with no such action: the cell shows a muted dash and no control, and the row is left out of the count like a disabled one. adornment(row) renders after the Checkbox inside the same cell, for marks such as conditions or forbid rules; they keep their own tab stops, and clicks on them never activate the row.'
  ],
  accessibility: [
    "Native table/header/cell semantics, labelled selection and aria-sort buttons.",
    "selectionDisabledReason(row) disables that row's selection Checkbox, shows the reason in a tooltip and sets it as the Checkbox's accessible description. Header select-all skips and does not count those rows; isSelectable remains for rows that need no explanation.",
    "With virtual rows, screen readers still hear the total row count and each row's real position.",
    "A truncated cell never clips the focus ring of a control rendered in it, and Tab scrolls a control far enough above the scroll frame's bottom edge to show its whole ring.",
    "Focus remains on native controls; loading and selected totals announced politely.",
    'Each row action is a named button: "<label> for <rowLabel>", and the More trigger is "More actions for <rowLabel>" unless menuLabel renames it. A disabled action carries its reason as its accessible description and in its tooltip. The header cell names the column Actions for screen readers.',
    "After load-more appends rows, the table scrolls the first new row into view and moves focus to it, so keyboard and screen reader users continue from what just arrived.",
    "With onRowActivate, rows join the tab order without an interactive role, so the table keeps native row semantics and never nests a button or link role around the row's own controls. Enter activates the focused row and Space toggles its selection when the table is selectable. Keep a real link or button for the same destination in the primary cell, so screen reader users meet a named control.",
    "Loading rows are hidden from assistive technology; the table is aria-busy and the polite status says Loading rows.",
    'Toggle checkboxes are named, not left to the header: each cell is "<header> for <rowLabel>" and the header control is "<header> for every row in <label>" unless toggle.label overrides it. The header control announces mixed for some. A disabled cell carries its reason as its accessible description. An absent cell has no control; its dash is hidden from assistive technology and replaced by "<header> for <rowLabel>: not applicable". An adornment is a sibling of the Checkbox, never inside it, so a button mark is its own named control in the tab order with no nested interactive roles; give icon-only marks a visible tooltip and an accessible name.',
    "Grouped rows: pass groups ({ id, label, rows, meta?, actions? }) instead of rows. Each group with rows is its own tbody whose first row is the group header: a th with scope rowgroup that spans the data columns on the tint ground, with the label in label type and meta (such as a count) in muted small type. The selection cell stays in place, empty, and with rowActions the actions tail holds the group's actions end-aligned like every other row. The frame stays one surface across the groups.",
    "Rows under a group header, and child rows from getRowChildren (one level under a parent row), indent the primary column (or the first column when none is primary) by space-row-indent per depth. Only the primary cell moves: the selection column, the other columns and the actions tail keep their positions.",
    "Group headers are not row-activatable and never join the tab order. Rows under them keep every row behavior: Tab, Enter with onRowActivate, Space to select. aria-rowindex and aria-rowcount count the header rows.",
    "Selection with groups has no group checkbox: header select-all covers the eligible rows of every group and every child row, and its mixed state counts them the same way. A group header is never selected."
  ],
  limitations: [
    "The host sorts data and owns pagination and cross-page selection policy. Header select-all touches eligible loaded rows only.",
    "Grouped rows: DataTable never reorders rows, so the host sorts within each group and keeps the groups in their own order; a sort never moves a row across groups. With getRowChildren the host sorts the parents and each parent's children separately, and children always follow their parent. Paginate the rows first and group the page, so a group cut by a page boundary repeats its header on the next page.",
    "Grouped rows render every row: virtual is ignored with groups. getRowChildren works with virtual, since its rows stay one flat list.",
    "Group headers have no checkbox and do not collapse. A group's own actions render only in the actions tail, so they need rowActions. Striped rows restart in each group.",
    "getRowChildren is one level and visual: the table has no treegrid semantics, so a child row's rowLabel and primary cell must name it without its parent. Use groups when the parent relation must be announced.",
    "There is no muted row state. Lowered opacity drops text below contrast and carries the state by color alone; mark an inactive row with a Badge in its name cell (for example Deactivated) and, when it cannot be acted on, a selectionDisabledReason.",
    "Virtual tables use one uniform effective row height. rowHeight defaults to the size-row token (40px) as a requested minimum; observed enlarged content can raise the shared metric used by rows, slices and spacers. This does not support arbitrary variable-height rows. Supply width/maxWidth for variable columns.",
    "Only a final column may be pinned. rowActions.inline takes at most three actions, enforced by its tuple type; everything else goes in renderMenu. Use grow for a flexible resource column; an explicit numeric width takes precedence.",
    "A column with actions true remains for tail content that is not icon actions, such as an Open text button; it takes the same end-aligned actions tail and 28px target cap, and sizes to its content without a declared width. In a fixed-layout table it holds one target (size-row) unless the column declares a width. Prefer rowActions for icon actions.",
    "Use text(row) for full hover text when render returns truncated complex content.",
    "The host owns how many rows load and how tall the frame grows; pass a larger height as rows arrive, leave loadMore undefined once every row is loaded and pass end to say so. Remount or reset scroll when a filter replaces the rows.",
    "onRowActivate is a pointer and keyboard shortcut. It cannot open a new tab or be copied as a link; navigation that needs those belongs on the link in the primary cell.",
    "The pagination slot takes any node. The host slices rows, owns page and page size, and resets the page when filters change.",
    "Migration: v3 Table's ref is the scroll container; in v4 pass that ref as containerRef, or ref still lands on the table element. There is no hasAttachedFooter or TableAttachedFooter: DataTable's loadMore, end and pagination slots render inside the frame below the rows, so a load-more action or completion message joins the table without a second border.",
    "Only a FloatingActionBar passed through actionBar reserves space. A bar rendered elsewhere on the page cannot reach the table.",
    "A toggle column acts on the rows passed in. With pagination the header counts and sets the current page only; the host decides whether a bulk change spans pages. The host owns the values and persists them through onChange."
  ],
  related: ["data-grid", "pagination"],
  examples: [
    {
      id: "variants",
      title: "Variants",
      module: "./examples/table/variants.tsx",
      states: ["default", "overflow"]
    },
    {
      id: "states",
      title: "Empty and protected selection",
      module: "./examples/table/states.tsx",
      states: ["empty", "controlled", "disabled", "keyboard", "loading"]
    },
    {
      id: "semantic",
      title: "Native semantic table",
      module: "./examples/table/semantic.tsx",
      states: ["default", "controlled"]
    },
    {
      id: "sorting",
      title: "Sort direction",
      module: "./examples/table/sorting.tsx",
      states: ["default", "controlled", "keyboard"]
    },
    {
      id: "data-table",
      title: "Virtual rows and sorting",
      module: "./examples/table/data-table.tsx",
      states: ["default", "controlled", "keyboard", "overflow"]
    },
    {
      id: "load-more",
      title: "Virtual rows, load more",
      module: "./examples/table/load-more.tsx",
      states: ["default", "loading", "keyboard"]
    },
    {
      id: "scroll-container",
      title: "Scroll container ref",
      module: "./examples/table/scroll-container.tsx",
      states: ["default", "overflow"]
    },
    {
      id: "row-actions",
      title: "Row actions",
      module: "./examples/table/row-actions.tsx",
      states: ["default", "disabled", "keyboard"]
    },
    {
      id: "row-activation",
      title: "Row activation",
      module: "./examples/table/row-activation.tsx",
      states: ["default", "keyboard", "controlled"]
    },
    {
      id: "pagination",
      title: "Pagination",
      module: "./examples/table/pagination.tsx",
      states: ["default", "controlled"]
    },
    {
      id: "loading",
      title: "Loading rows",
      module: "./examples/table/loading.tsx",
      states: ["loading", "default"]
    },
    {
      id: "grouped-rows",
      title: "Grouped rows",
      module: "./examples/table/grouped-rows.tsx",
      states: ["default", "controlled", "keyboard"]
    },
    {
      id: "column-toggle",
      title: "Column toggle, permission matrix",
      module: "./examples/table/column-toggle.tsx",
      states: ["default", "disabled", "keyboard", "controlled"]
    }
  ],
  coverage: [
    {
      axis: "variant",
      expected: ["basic", "striped", "bordered"],
      shown: [
        {
          value: "basic",
          exampleId: "variants",
          label: "basic"
        },
        {
          value: "striped",
          exampleId: "variants",
          label: "striped"
        },
        {
          value: "bordered",
          exampleId: "variants",
          label: "bordered"
        }
      ]
    },
    {
      axis: "alignment",
      expected: ["start", "end", "center"],
      shown: [
        {
          value: "start",
          exampleId: "variants",
          label: "Environment"
        },
        {
          value: "end",
          exampleId: "variants",
          label: "Secrets"
        },
        {
          value: "center",
          exampleId: "variants",
          label: "Present"
        }
      ]
    },
    {
      axis: "collection",
      expected: [
        "native",
        "empty",
        "protected-selection",
        "virtual",
        "load-more",
        "row-activation",
        "paginated",
        "loading",
        "grouped",
        "tree"
      ],
      shown: [
        {
          value: "native",
          exampleId: "semantic",
          label: "Fabricated environment inventory"
        },
        {
          value: "empty",
          exampleId: "states",
          label: "Empty"
        },
        {
          value: "protected-selection",
          exampleId: "states",
          label: "Protected selection"
        },
        {
          value: "virtual",
          exampleId: "data-table",
          label: "Example resource table"
        },
        {
          value: "load-more",
          exampleId: "load-more",
          label: "Example event log"
        },
        {
          value: "row-activation",
          exampleId: "row-activation",
          label: "Certificates"
        },
        {
          value: "paginated",
          exampleId: "pagination",
          label: "Audit events"
        },
        {
          value: "loading",
          exampleId: "loading",
          label: "Keys, loading"
        },
        {
          value: "grouped",
          exampleId: "grouped-rows",
          label: "Accounts grouped by resource"
        },
        {
          value: "tree",
          exampleId: "grouped-rows",
          label: "Child rows under a parent row"
        }
      ]
    },
    {
      axis: "column layout",
      expected: ["grow", "pin", "hideHeader"],
      shown: [
        { value: "grow", exampleId: "variants", label: "Environment" },
        { value: "pin", exampleId: "variants", label: "Open" },
        { value: "hideHeader", exampleId: "variants", label: "Actions" }
      ]
    },
    {
      axis: "row actions",
      expected: ["more-only", "one-inline", "two-inline", "three-inline", "disabled", "indicators"],
      shown: [
        { value: "more-only", exampleId: "row-actions", label: "More only, one square cell" },
        { value: "one-inline", exampleId: "row-actions", label: "One inline action and More" },
        { value: "two-inline", exampleId: "row-actions", label: "Two inline actions and More" },
        {
          value: "three-inline",
          exampleId: "row-actions",
          label: "Three inline actions, the cap, and More"
        },
        { value: "disabled", exampleId: "row-actions", label: "JWT_SIGNING_KEY" },
        { value: "indicators", exampleId: "row-actions", label: "DATABASE_URL" }
      ]
    }
  ],
  guidance: {
    use: [
      "Use basic, striped or bordered DataTable for row comparison with native table semantics, controlled sort and optional loaded-row selection."
    ],
    avoid: [],
    decision:
      "Choose DataTable for row comparison, sorting and selection. Use DataGrid when cells need spreadsheet editing, range selection or clipboard navigation.",
    rules: [
      {
        id: "table-usage",
        when: "A table header selects rows from a paged result.",
        do: "Select eligible loaded rows and keep total or cross-page selection policy explicit in the host.",
        avoid:
          "Imply select-all includes unloaded records or add ARIA grid roles to a plain table without grid keyboard behavior.",
        reason: "Selection scope and semantics must match what the user can operate.",
        evidence: [
          "src/components/v4/ui/table.tsx",
          "src/pages/design-system/examples/table/data-table.tsx"
        ],
        detect: {
          by: "review",
          how: "Select-all with ineligible and unloaded rows, then sort/reload by stable id. Only eligible loaded rows change selection and the claimed scope remains accurate."
        }
      },
      {
        id: "table-action-scope",
        when: "A table exposes both per-row actions and a bulk selection action.",
        do: "Name the selected scope and keep each row action distinct from its selection checkbox. Make loaded-row select-all explicit when other pages exist.",
        avoid:
          "Make a row click select the row as well as open it, or claim every result is selected when only loaded ids changed.",
        reason: "The person must know which records an action will affect before committing it.",
        evidence: [
          "src/components/v4/ui/table.tsx",
          "src/pages/design-system/examples/table/data-table.tsx"
        ],
        detect: {
          by: "review",
          how: "Select a subset, navigate pages and use a row action; row identity, selected count and the operation scope agree, and one target does not activate another."
        }
      },
      {
        id: "table-virtual-metric-and-row-identity",
        when: "A row-comparison table can virtualize and select loaded records.",
        do: "Use stable ids and meaningful column alignment. Treat rowHeight as a minimum; every row keeps the same height while scrolling, so the list neither jumps nor leaves gaps. Use DataGrid only when spreadsheet editing is required.",
        avoid:
          "Let a row action make one row taller than the others, treat header selection as all server records or sort the displayed rows without updating the host data.",
        reason: "Scrolling, selection and sorting must all refer to the rows the person sees.",
        detect: {
          by: "review",
          how: "Scroll across virtual slices with row actions present, sort and select eligible rows. The measured row height matches the model, scroll position stays stable and selection excludes protected rows."
        },
        evidence: [
          "src/components/v4/ui/table.tsx",
          "src/pages/design-system/examples/table/data-table.tsx"
        ]
      },
      {
        id: "table-row-action-geometry",
        when: "A table row has actions, standalone indicator marks or both.",
        do: "Declare the actions with DataTable rowActions (or TableActionsCell and RowActions in a native Table): up to three inline icon actions, the same on every row, then renderMenu for the rest. Put Delete, Remove, Revoke, Disable and other destructive actions only in the More menu, last, after a separator when other items precede them, with the destructive variant; a row whose only action is destructive shows More alone. Keep marks in TableRowIndicators. Choose which actions and marks a row shows and their order; leave target, glyph, gap, inset and column width to the primitives and tokens.",
        avoid:
          "Show actions only on hover, put them inside a value cell, swap marks for actions, add a fourth inline action, expose a destructive action inline, hide a blocked action, or set a local width, gap or margin on the actions tail.",
        reason:
          "Persistent actions in one sticky column never shift the row, line up across rows and stay reachable without a pointer; one owner keeps the actions tail end-aligned and sized by its contents.",
        evidence: [
          "src/components/v4/ui/table.tsx",
          "src/components/v4/ui/data-table.tsx",
          "src/components/v4/ui/data.module.css",
          "src/pages/design-system/examples/table/row-actions.tsx"
        ],
        detect: {
          by: "review",
          how: "Measure a row at rest and on hover: the value cell keeps its width, the tail is 40 for one action and 28 wider per further action, and its first and last targets sit the same distance from the divider and the frame edge. Tab reaches every action and a disabled one reads its reason. ui:lint flags a reveal or swap prop and hover-only layout changes in table CSS."
        }
      },
      {
        id: "table-selection-column",
        when: "A table, DataTable or native Table, has a column of row selection checkboxes.",
        do: "Mark the header cell and every body cell of that column with selection (TableHead selection, TableCell selection) and put only the Checkbox inside. DataTable selectable renders the same cells.",
        avoid:
          "Build a local check or icon cell class with its own width, padding, divider or background for the selection column.",
        reason:
          "One hook keeps the column's width, Checkbox position, divider and row layers identical in every table.",
        evidence: [
          "src/components/v4/ui/table.tsx",
          "src/components/v4/ui/data-table.tsx",
          "src/components/v4/ui/data.module.css",
          "src/pages/design-system/examples/table/semantic.tsx"
        ],
        detect: {
          by: "review",
          how: "Measure the selection column in a DataTable and a native Table: both are size-row wide with the Checkbox centered and a line-soft divider on the right, and hovering or selecting the row repaints the selection cell with the row."
        }
      },
      {
        id: "table-row-activation",
        when: "Each row opens one detail page or sheet for its resource.",
        do: "Pass onRowActivate (or, in a native Table, TableRow onClick) with the same destination as the link or button in the primary cell, and keep selection on the checkbox and Space.",
        avoid:
          "Navigate from a cell's own onClick, give the row a button or link role, let a row click change the selection, or add stopPropagation to the row's controls and menus to keep them from activating it.",
        reason:
          "One handler keeps pointer, Enter and the named control in agreement, while the row's own controls keep their clicks and the row keeps native table semantics.",
        evidence: [
          "src/components/v4/ui/table.tsx",
          "src/components/v4/ui/data-table.tsx",
          "src/components/v4/ui/data-table.test.tsx",
          "src/pages/design-system/examples/table/row-activation.tsx"
        ],
        detect: {
          by: "test",
          test: "src/components/v4/ui/data-table.test.tsx",
          how: "Clicks a cell, the row menu, the selection cell and a text selection, then presses Enter and Space on a focused row; only the cell click and Enter activate, and Space selects. A native TableRow onClick ignores a click on a portaled menu item opened from the row and runs for a click on a cell."
        }
      },
      {
        id: "table-grouped-rows",
        when: "Rows belong to a parent the person scans by, such as search results grouped by folder or accounts by resource.",
        do: "Pass groups with each parent's label, a count or other meta, its rows sorted within the group and, with rowActions, the parent's own actions. Use getRowChildren for one level of child rows under a parent row that is itself a resource row.",
        avoid:
          "Fake a group with a full-width row in rows, indent a cell with local padding, put a checkbox on a group header or sort rows across groups.",
        reason:
          "One owner keeps the header semantics, the indent token, the selection column and the actions tail identical in every grouped table, and select-all stays one rule.",
        evidence: [
          "src/components/v4/ui/data-table.tsx",
          "src/components/v4/ui/data.module.css",
          "src/pages/design-system/examples/table/grouped-rows.tsx"
        ],
        detect: {
          by: "test",
          test: "src/components/v4/ui/data-table.test.tsx",
          how: "Renders groups with an empty one: each non-empty group is a tbody whose header is a th with scope rowgroup and is not focusable or activatable, rows are indented at depth 1 and keep Enter activation and their aria-rowindex, and select-all selects the eligible rows of every group."
        }
      },
      {
        id: "table-loading-geometry",
        when: "A DataTable waits for its first rows or reloads them.",
        do: "Pass loading and a loadingRows count close to the page size, and declare a width on every column except the one that grows and an actions tail, so the table uses fixed layout.",
        avoid:
          "Swap the table for a Loader, or leave columns sized by content so they jump when rows arrive.",
        reason:
          "Skeleton rows at the loaded row height and column widths keep the page still when the data replaces them.",
        evidence: [
          "src/components/v4/ui/data-table.tsx",
          "src/pages/design-system/examples/table/loading.tsx"
        ],
        detect: {
          by: "test",
          test: "src/components/v4/ui/data-table.test.tsx",
          how: "Compares each cell's width style between loading and loaded rows and checks fixed layout only when every column has a width or grows."
        }
      }
    ],
    states: [
      {
        state: "hover and focus",
        guidance:
          "Hover adds only the translucent row overlay, on striped rows too, and the sticky tail cell repeats it over its opaque ground. Row actions are already visible, so nothing appears, moves or resizes, and keyboard focus rings sit inside the row."
      },
      {
        state: "empty",
        guidance:
          "Show an explanation spanning the table's columns while retaining relevant filters."
      },
      {
        state: "virtual",
        guidance:
          "Keep every row one height and set explicit column widths when the table is virtualized. Larger content raises all rows above the requested rowHeight."
      }
    ],
    antiSlop: [
      {
        do: "Lead with resource rows. Align comparable values and keep row geometry stationary while hovering or selecting.",
        avoid:
          "Lift rows on hover, animate loaded totals, replace ordinary metadata with badges or add decorative columns.",
        reason:
          "Stable lanes support comparison. Counts must describe actual loaded rows and meaningful exceptions belong beside their resource."
      }
    ]
  },
  checks: [
    {
      kind: "runtime",
      command:
        "npm test -- src/components/v4/ui/data-grid-model.test.ts src/components/v4/ui/specialist.test.tsx"
    },
    {
      kind: "static",
      command: "npm run type:check"
    },
    {
      kind: "browser",
      command:
        "Open the executable example and verify keyboard, narrow viewport, dark theme and failure recovery."
    }
  ]
} satisfies ComponentDefinition;
