import type { ComponentDefinition } from "./types";

export const dataGridDefinition = {
  id: "data-grid",
  title: "Data grid",
  group: "Data display",
  summary: "Spreadsheet selection and exact typed edits over stable row identities.",
  sourceFiles: [
    "src/components/v4/ui/data-grid.tsx",
    "src/components/v4/ui/data-grid-model.ts",
    "src/components/v4/ui/data.module.css"
  ],
  exports: ["DataGrid", "GridColumn", "GridChange", "GridSelection", "GridValue"],
  referenceNames: ["DataGrid"],
  behavior: [
    "Editable and read-only cells share range selection, copy and resize. rowHeight defaults to a requested 32px minimum. The measured content floor raises one uniform effective height used by cells, virtual positions and keyboard navigation; this is not arbitrary variable-height row support.",
    "Quoted TSV preserves null, literal NULL, empty text, embedded separators and quotes. Copy writes null as the unquoted marker \\N, and paste reads an unquoted \\N back as null.",
    "Invalid paste rejects the full batch. Async change failure keeps the edit draft.",
    "Rows and columns use stable ids through sorting, filtering and reordering. Keyboard selection scrolls the real active cell into view on both axes using measured header and viewport bounds."
  ],
  accessibility: [
    "The grid has a name and announces its row and column counts and the selected cell, even when that cell is scrolled out of view.",
    "Arrows, Home/End, PageUp/Down, Shift range, Enter/F2 edit, Escape cancel, Tab commit, mod+A/C/Z.",
    "Headers expose sorting buttons and keyboard-resizable separators."
  ],
  limitations: [
    "Values use exact strings or null. Named int2/smallint, int4/integer and int8/bigint codecs enforce signed 16/32/64-bit bounds without changing accepted text.",
    "numeric/decimal and floating-point codecs check syntax only. Hosts enforce precision, scale and storage range through column.parse; a custom parse callback owns validation.",
    "Changes are host-owned. The host must respect AbortSignal, apply a batch atomically and reject on failure.",
    "Delete writes explicit null only to nullable columns; Alt+Delete writes empty text.",
    "Sorting is delegated. Filtered selections retain identity, but navigating from an unavailable active cell starts at the first visible cell. Filtering away an edit cancels that draft.",
    "Sensitive cells are never readable, editable or copyable through this generic grid. Use a separate specialist editor.",
    "Undo applies the inverse of the last successful batch; cross-user conflict resolution belongs to the host."
  ],
  related: ["table", "sensitive-editor"],
  examples: [
    {
      id: "workspace",
      title: "Editing and sorting",
      module: "./examples/data-grid/workspace.tsx",
      states: ["default", "controlled", "keyboard", "editing", "error", "overflow"]
    }
  ],
  coverage: [
    {
      axis: "type",
      expected: [
        "text",
        "unknown",
        "int2",
        "smallint",
        "int4",
        "integer",
        "int8",
        "bigint",
        "numeric",
        "decimal",
        "float4",
        "float8",
        "real",
        "bool",
        "boolean",
        "uuid",
        "json",
        "jsonb"
      ],
      shown: [],
      omitted: [
        {
          value: "text",
          reason:
            'Cut to keep the page to the essentials; the data-grid fixture test renders it as "text / unknown".'
        },
        {
          value: "unknown",
          reason:
            'Cut to keep the page to the essentials; the data-grid fixture test renders it as "text / unknown".'
        },
        {
          value: "int2",
          reason:
            'Cut to keep the page to the essentials; the data-grid fixture test renders it as "int2 / smallint".'
        },
        {
          value: "smallint",
          reason:
            'Cut to keep the page to the essentials; the data-grid fixture test renders it as "int2 / smallint".'
        },
        {
          value: "int4",
          reason:
            'Cut to keep the page to the essentials; the data-grid fixture test renders it as "int4 / integer".'
        },
        {
          value: "integer",
          reason:
            'Cut to keep the page to the essentials; the data-grid fixture test renders it as "int4 / integer".'
        },
        {
          value: "int8",
          reason:
            'Cut to keep the page to the essentials; the data-grid fixture test renders it as "int8 / bigint".'
        },
        {
          value: "bigint",
          reason:
            'Cut to keep the page to the essentials; the data-grid fixture test renders it as "int8 / bigint".'
        },
        {
          value: "numeric",
          reason:
            'Cut to keep the page to the essentials; the data-grid fixture test renders it as "numeric / decimal / float4 / float8 / real".'
        },
        {
          value: "decimal",
          reason:
            'Cut to keep the page to the essentials; the data-grid fixture test renders it as "numeric / decimal / float4 / float8 / real".'
        },
        {
          value: "float4",
          reason:
            'Cut to keep the page to the essentials; the data-grid fixture test renders it as "numeric / decimal / float4 / float8 / real".'
        },
        {
          value: "float8",
          reason:
            'Cut to keep the page to the essentials; the data-grid fixture test renders it as "numeric / decimal / float4 / float8 / real".'
        },
        {
          value: "real",
          reason:
            'Cut to keep the page to the essentials; the data-grid fixture test renders it as "numeric / decimal / float4 / float8 / real".'
        },
        {
          value: "bool",
          reason:
            'Cut to keep the page to the essentials; the data-grid fixture test renders it as "bool / boolean".'
        },
        {
          value: "boolean",
          reason:
            'Cut to keep the page to the essentials; the data-grid fixture test renders it as "bool / boolean".'
        },
        {
          value: "uuid",
          reason:
            'Cut to keep the page to the essentials; the data-grid fixture test renders it as "uuid".'
        },
        {
          value: "json",
          reason:
            'Cut to keep the page to the essentials; the data-grid fixture test renders it as "json / jsonb".'
        },
        {
          value: "jsonb",
          reason:
            'Cut to keep the page to the essentials; the data-grid fixture test renders it as "json / jsonb".'
        }
      ]
    },
    {
      axis: "behavior",
      expected: [
        "null",
        "range-clipboard",
        "custom-parse-format",
        "protected-key",
        "sensitive",
        "host-conflict",
        "permission-change",
        "stale-commit",
        "virtual"
      ],
      shown: [
        {
          value: "virtual",
          exampleId: "workspace",
          label: "Example resources"
        }
      ],
      omitted: [
        {
          value: "host-conflict",
          reason:
            "Host conflict, permission revocation and dataset replacement are verified in DataGrid behavior tests without a host-control simulator in Human previews."
        },
        {
          value: "permission-change",
          reason:
            "Host conflict, permission revocation and dataset replacement are verified in DataGrid behavior tests without a host-control simulator in Human previews."
        },
        {
          value: "stale-commit",
          reason:
            "Host conflict, permission revocation and dataset replacement are verified in DataGrid behavior tests without a host-control simulator in Human previews."
        },
        {
          value: "null",
          reason:
            'Cut to keep the page to the essentials; the data-grid fixture test renders it as "Nullable text".'
        },
        {
          value: "range-clipboard",
          reason:
            'Cut to keep the page to the essentials; the data-grid fixture test renders it as "Atomic range clipboard".'
        },
        {
          value: "custom-parse-format",
          reason:
            'Cut to keep the page to the essentials; the data-grid fixture test renders it as "Monthly cost in cents".'
        },
        {
          value: "protected-key",
          reason:
            'Cut to keep the page to the essentials; the data-grid fixture test renders it as "Protected key".'
        },
        {
          value: "sensitive",
          reason:
            'Cut to keep the page to the essentials; the data-grid fixture test renders it as "Sensitive value".'
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Use stable row and column ids, validate edits with a supported column type or column.parse, apply each onCellsChange all or nothing, and stop applying it when its signal aborts."
    ],
    avoid: [],
    decision:
      "Choose DataGrid for cell editing and rectangular selection. Use DataTable for row comparison and actions without spreadsheet keyboard semantics.",
    rules: [
      {
        id: "data-grid-usage",
        when: "A pasted range contains an invalid value or a changed permission.",
        do: "Validate the complete batch and current target identities before committing; keep exact strings and null distinct.",
        avoid:
          "Coerce values through Number, overwrite a host-updated cell, or apply only the valid part of a rejected paste.",
        reason: "Partial or lossy updates can silently change values or write to the wrong cell.",
        evidence: [
          "src/components/v4/ui/data-grid.tsx",
          "src/pages/design-system/examples/data-grid/workspace.tsx"
        ],
        detect: {
          by: "review",
          how: "Paste a range with one invalid cell and revoke permission during editing. No partial/lossy batch is applied, stable identities persist and protected cells remain unchanged."
        }
      }
    ],
    states: [
      {
        state: "editing",
        guidance:
          "Keep the starting value and cancel or report conflict if permission or host data changes."
      },
      {
        state: "failure",
        guidance:
          "When a save fails, reject the whole change and keep a clear retry or cancel route."
      }
    ],
    antiSlop: [
      {
        do: "Keep keys, editable values, dirty cells and failures distinguishable within a shared column measure.",
        avoid:
          "Give every cell a bright badge, move rows on hover or use only short, valid data in an editing example.",
        reason:
          "Stable columns keep exact values comparable. Nulls, protected fields and invalid batches expose failures that uniform valid data hides."
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
