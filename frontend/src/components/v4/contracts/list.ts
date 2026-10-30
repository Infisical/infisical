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
    "Interactive rows use a translucent ink overlay on hover and press (opacity-hover and opacity-press tokens), so tinted surfaces behind the list show through.",
    "Framed (default: the shared tint frame with an uppercase eyebrow title and caption action, rows on an inset raised surface), plain (a bordered surface) or bare; md/sm, static/link/button rows and actions below.",
    "Link and button rows tint with ink on hover (6% light, 12% dark) and a step further while pressed; current and selected rows keep their select ground.",
    "Section heads are 32px uppercase eyebrow labels with an optional tabular meta count.",
    "Selection skips disabled and locked rows. Current details and bulk selection remain independent.",
    "Loading appends placeholders below retained rows; sections, empty and footer compose.",
    "DataList terms wrap only between words and never break inside one; a term keeps at least its longest word even past its 45% share, and values wrap instead.",
    "DataList density compact draws 32px rows (size-data-list-row) with no gap between them: the term sits in a size-data-list-term column and the value starts beside it instead of aligning right. Its terms keep the same word-only wrapping, and a single word longer than the column widens it.",
    'In compact density an item marked { span: "half" } pairs with the next half item, two to a row, each with its term stacked over its value. Pairing runs in order, so a half item with no half neighbor takes the full row. Default density ignores span.'
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
    "Large columnar datasets belong in DataTable; cell editing belongs in DataGrid.",
    "Compact density is for props and meta DataLists. A stat value keeps the display role and grows its row past 32px.",
    "A compact full-width row gives the value less room than default density, so a UUID in a size-sidecar card wraps onto a second line."
  ],
  related: ["item"],
  examples: [
    {
      id: "default",
      title: "Rows and empty list",
      module: "./examples/list/default.tsx",
      states: ["default", "empty"]
    },
    {
      id: "interactive",
      title: "Link and button rows",
      module: "./examples/list/interactive.tsx",
      states: ["default", "controlled", "keyboard", "disabled"]
    },
    {
      id: "variants",
      title: "Framed, sections, plain and sm",
      module: "./examples/list/variants.tsx",
      states: ["default"]
    },
    {
      id: "density",
      title: "DataList default and compact density",
      module: "./examples/list/density.tsx",
      states: ["default"]
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
        },
        {
          value: "plain",
          exampleId: "variants",
          label: "plain"
        }
      ],
      omitted: [
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
      shown: [
        {
          value: "md",
          exampleId: "variants",
          label: "md"
        },
        {
          value: "sm",
          exampleId: "variants",
          label: "sm"
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
      axis: "DataList.density",
      expected: ["default", "compact"],
      shown: [
        {
          value: "default",
          exampleId: "density",
          label: "default"
        },
        {
          value: "compact",
          exampleId: "density",
          label: "compact, half pairs and a lone half"
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
        },
        {
          value: "disabled",
          exampleId: "interactive",
          label: "Button rows, hover or press a row. Opened: None"
        },
        {
          value: "current row",
          exampleId: "interactive",
          label: "Link rows, hover a row, staging is current"
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
          value: "protected",
          reason: "A protected row keeps a disabled checkbox; the list fixture test renders it."
        },
        {
          value: "loading",
          reason:
            "Loading appends skeleton rows under retained rows; the list fixture test renders it."
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Use framed, plain or bare List with sm or md rows, and keep current details independent from optional multiple selection.",
      "Use DataList density compact for the facts of one record on a detail page (the details card, a DetailLayout sidecar, subject and key usage cards), and keep default density for short summaries, stat lists and sheets."
    ],
    avoid: [],
    decision:
      "Choose List for a stable collection of comparable resource rows. Use Item for an isolated rich object and DataTable when columns need comparison. For a DataList, choose compact when a card holds more than about five facts that a reader scans for one value, and default when it holds a few facts that each deserve a full row.",
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
      },
      {
        id: "list-data-density",
        when: "A detail card or sidecar lists many facts about one record.",
        do: "Use DataList density compact and mark short single-line values with span half so they pair, keeping long values such as IDs and metadata on full rows.",
        avoid:
          "Pair a value that wraps or holds a list, or use compact for a two-fact summary, so pairs stop lining up and the card gains nothing.",
        reason:
          "Compact rows fit more of the record above the fold, but only when paired values stay on one line.",
        detect: {
          by: "review",
          how: "Render the detail card at size-sidecar width in both densities. Compact rows measure 32px, every half pair shares one row with both values on one line, and terms wrap only between words."
        },
        evidence: [
          "src/components/v4/ui/list.tsx",
          "src/components/v4/ui/data.module.css",
          "src/pages/design-system/examples/list/density.tsx"
        ]
      }
    ],
    states: [
      {
        state: "compact",
        guidance:
          "Pair only short single-line values with span half: roles, dates, On or Off, a status badge. Keep IDs, links, lists and metadata as full rows."
      },
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
      kind: "runtime",
      command: "npm test -- src/components/v4/ui/data-list-density.test.tsx"
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
