import type { ComponentDefinition } from "./types";

export const tableDefinition = {
  id: "table",
  title: "Table",
  group: "Data display",
  summary: "Semantic object tables with a typed data companion for selection and large datasets.",
  sourceFiles: [
    "src/components/v4/ui/table.tsx",
    "src/components/v4/ui/data-table.tsx",
    "src/components/v4/ui/data.module.css"
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
    "DataTableColumn",
    "EnvMark"
  ],
  referenceNames: ["Table"],
  behavior: [
    "DataTable composes existing Table parts without imposing ARIA grid keyboard semantics.",
    "Basic/striped/bordered, controlled sorting, stable selection, empty and load-more.",
    "Content sizing floors, capped values, pinned action column and optional fixed-height row virtualization."
  ],
  accessibility: [
    "Native table/header/cell semantics, labelled selection and aria-sort buttons.",
    "With virtual rows, screen readers still hear the total row count and each row's real position.",
    "Focus remains on native controls; loading and selected totals announced politely."
  ],
  limitations: [
    "The host sorts data and owns pagination and cross-page selection policy. Header select-all touches eligible loaded rows only.",
    "Virtual tables use one uniform effective row height. rowHeight defaults to a requested 48px minimum; observed enlarged content can raise the shared metric used by rows, slices and spacers. This does not support arbitrary variable-height rows. Supply width/maxWidth for variable columns.",
    "Only a final column may be pinned. Prefer one or two actions per row. Use grow for a flexible resource column; an explicit numeric width takes precedence.",
    "Use text(row) for full hover text when render returns truncated complex content."
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
      states: ["default"]
    },
    {
      id: "data-table",
      title: "Virtual rows and sorting",
      module: "./examples/table/data-table.tsx",
      states: ["default", "controlled", "keyboard", "overflow"]
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
      expected: ["native", "empty", "protected-selection", "virtual"],
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
          "Use an ambiguous row click for selection and navigation, or claim every result is selected when only loaded ids changed.",
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
      }
    ],
    states: [
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
