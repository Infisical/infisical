import type { ComponentDefinition } from "./types";

export const listDefinition = {
  id: "list",
  title: "List",
  group: "Data display",
  summary: "Object rows with independent current state, selection and actions.",
  sourceFiles: ["src/components/v4/ui/list.tsx", "src/components/v4/ui/data.module.css"],
  exports: ["List", "ListRow", "ListSection", "DataList"],
  referenceNames: ["List"],
  behavior: [
    "Framed/plain/bare, md/sm, static/link/button rows and actions below.",
    "Selection skips disabled and locked rows. Current details and bulk selection remain independent.",
    "Loading appends placeholders below retained rows; sections, empty and footer compose."
  ],
  accessibility: [
    "Semantic lists with named selection controls; no nested interactive row targets.",
    "Arrow/Home/End movement across row targets; Tab reaches independent actions.",
    "Removing a focused row moves focus to its nearest remaining main target, or the named list fallback when empty. External focused controls keep focus.",
    "Unread and selected counts have textual announcements."
  ],
  limitations: [
    "Supply unique string row ids and accessible labels.",
    "ListRow and ListSection must be direct descendants or wrappers that forward children for selection discovery.",
    "Large columnar datasets belong in DataTable; cell editing belongs in DataGrid."
  ],
  related: ["item"],
  examples: [
    {
      id: "default",
      title: "Rows and empty list",
      module: "./examples/list/default.tsx",
      states: ["default", "empty"]
    }
  ],
  coverage: [
    {
      axis: "variant",
      expected: ["framed", "plain", "bare"],
      shown: [
        {
          value: "framed",
          exampleId: "default",
          label: "framed"
        }
      ],
      omitted: [
        {
          value: "plain",
          reason:
            "plain drops the outer border and keeps the row rules and inset; the list fixture test renders it."
        },
        {
          value: "bare",
          reason:
            "bare drops the border and the row rules and keeps the inset; the list fixture test renders it."
        }
      ]
    },
    {
      axis: "size",
      expected: ["md", "sm"],
      shown: [],
      omitted: [
        {
          value: "md",
          reason: "Both lists use md; their captions name the variant and state."
        },
        {
          value: "sm",
          reason:
            "sm hides descriptions and shortens rows to 40px; the list fixture test renders it."
        }
      ]
    },
    {
      axis: "DataList.variant",
      expected: ["stat", "meta", "props"],
      shown: [
        {
          value: "stat",
          exampleId: "default",
          label: "stat"
        }
      ],
      omitted: [
        {
          value: "meta",
          reason:
            "meta and props render the same muted term and plain value; only stat enlarges the value. the list fixture test renders it."
        },
        {
          value: "props",
          reason:
            "meta and props render the same muted term and plain value; only stat enlarges the value. the list fixture test renders it."
        }
      ]
    },
    {
      axis: "state and behavior",
      expected: [
        "no selection",
        "multiple",
        "below actions",
        "disabled",
        "protected",
        "loading",
        "empty",
        "current row"
      ],
      shown: [
        {
          value: "no selection",
          exampleId: "default",
          label: "framed"
        },
        {
          value: "empty",
          exampleId: "default",
          label: "Empty"
        }
      ],
      omitted: [
        {
          value: "multiple",
          reason:
            "Multiple selection adds a checkbox to each row and the header; the list fixture test renders it."
        },
        {
          value: "below actions",
          reason:
            "Actions below move the row actions under the description; the list fixture test renders it."
        },
        {
          value: "disabled",
          reason:
            "A disabled row mutes its text and drops its link; the list fixture test renders it."
        },
        {
          value: "protected",
          reason: "A protected row keeps a disabled checkbox; the list fixture test renders it."
        },
        {
          value: "loading",
          reason:
            "Loading appends skeleton rows under retained rows; the list fixture test renders it."
        },
        {
          value: "current row",
          reason: "The current row takes the selected fill; the list fixture test renders it."
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Use framed, plain or bare List with sm or md rows, and keep current details independent from optional multiple selection."
    ],
    avoid: [],
    decision:
      "Choose List for a stable collection of comparable resource rows. Use Item for an isolated rich object and DataTable when columns need comparison.",
    rules: [
      {
        id: "list-usage",
        when: "A focused row disappears after removal or filtering.",
        do: "Supply stable row ids and keep focus on the nearest remaining row target, or the named empty list when no rows remain.",
        avoid:
          "Use indexes as ids or move focus away from an external control that the person has already chosen.",
        reason:
          "Focus recovery belongs to the removed list target and must not steal unrelated focus.",
        evidence: [
          "src/components/v4/ui/list.tsx",
          "src/pages/design-system/examples/list/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Remove a focused row and update a selected collection. Focus recovers only from the removed target, unique row identities remain stable and unrelated external focus is preserved."
        }
      },
      {
        id: "list-row-and-selection",
        when: "A comparable collection has current details, bulk selection and independent actions.",
        do: "Use stable row values and explicit title, meta, badge and actions slots; preserve the distinction between current and selected ids.",
        avoid:
          "Use row index as identity, concatenate a title with its count or let a trailing action activate the row as well.",
        reason:
          "Opening details and choosing records for bulk work are separate operations that need stable identity.",
        detect: {
          by: "review",
          how: "Select, open, remove and reorder rows with long titles. Selection follows ids, actions do not open details accidentally and title/metadata lanes remain readable."
        },
        evidence: [
          "src/components/v4/ui/list.tsx",
          "src/pages/design-system/examples/list/default.tsx"
        ]
      }
    ],
    states: [
      {
        state: "empty",
        guidance: "Explain the empty result and retain a named focus fallback."
      },
      {
        state: "selection",
        guidance: "Keep selection eligibility distinct from the row's primary open action."
      }
    ],
    antiSlop: [
      {
        do: "Use title, metadata and optional actions consistently across rows.",
        avoid:
          "Populate every optional row slot or repeat the same information below and beside the title.",
        reason:
          "Consistent meaningful geometry helps compare resources without unnecessary density."
      }
    ]
  },
  checks: [
    {
      kind: "runtime",
      command: "npm test -- src/components/v4/ui/list-activity-lifecycle.test.tsx"
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
