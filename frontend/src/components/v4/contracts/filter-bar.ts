import type { ComponentDefinition } from "./types";

export const filterBarDefinition = {
  id: "filter-bar",
  title: "Filter bar",
  group: "Patterns",
  summary:
    "Search plus an Add filter menu; each applied filter becomes a removable chip that opens its own value picker.",
  sourceFiles: [
    "src/components/v4/patterns/filter-bar.tsx",
    "src/components/v4/patterns/filter-bar.module.css"
  ],
  exports: ["FilterBar", "describeFilter"],
  referenceNames: ["FilterBar", "FilterChips"],
  related: ["multi-select", "calendar", "button-group", "dropdown-menu"],
  behavior: [
    "Add filter opens a menu of the host's fields. A field already applied stays in the menu, disabled, with Already applied as its reason.",
    "Choosing a field adds its chip and opens that chip's picker at once. Closing a picker that still has no value removes the chip.",
    "Select fields pick one value, multi-select fields pick several, date fields pick Before or After plus a day, and text fields match a typed fragment. Every change calls onChange immediately; there is no Apply step.",
    "Each chip is an outline ButtonGroup: the value button reads field, verb and value (Status is Active or Renewed), and the x button removes it.",
    "Chips wrap onto more lines as the row fills, and Clear filters follows the last chip.",
    "The search slot fills the first row; the actions slot sits after Add filter for list tools such as Columns and Export."
  ],
  accessibility: [
    "The bar is a search landmark named by label, and the chips are a list named Applied filters, so the count is announced.",
    "Each chip is a group named after its field. Its value button is named field, verb and value, and its remove button is named Remove <field> filter.",
    "Removing a chip moves focus to the next chip, else the previous one, else Add filter. Clear filters and a picker closed empty also return focus to Add filter."
  ],
  limitations: [
    "The host owns filtering: FilterBar reports field, operator and values and never filters rows itself.",
    "One chip per field. Metadata key and value pairs and number ranges are not supported field types.",
    "Date values are local calendar days as YYYY-MM-DD; time of day is not offered."
  ],
  examples: [
    {
      id: "default",
      title: "Empty and with filters applied",
      module: "./examples/filter-bar/default.tsx",
      states: ["default", "empty", "overflow", "keyboard"]
    }
  ],
  coverage: [
    {
      axis: "field type",
      expected: ["select", "multi-select", "date", "text"],
      shown: [
        {
          value: "select",
          exampleId: "default",
          label: "Four filters, one per field type; the row wraps when it fills"
        },
        {
          value: "multi-select",
          exampleId: "default",
          label: "Four filters, one per field type; the row wraps when it fills"
        },
        {
          value: "date",
          exampleId: "default",
          label: "Four filters, one per field type; the row wraps when it fills"
        },
        {
          value: "text",
          exampleId: "default",
          label: "Four filters, one per field type; the row wraps when it fills"
        }
      ]
    },
    {
      axis: "applied count",
      expected: ["none", "several"],
      shown: [
        { value: "none", exampleId: "default", label: "No filters: search and Add filter only" },
        {
          value: "several",
          exampleId: "default",
          label: "Four filters, one per field type; the row wraps when it fills"
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Use FilterBar when a list has more filterable fields than fit as always-visible selects, or when most people filter by one or two of them."
    ],
    avoid: [
      "Keep a row of always-visible selects next to the search once a list has more than two filter fields."
    ],
    decision:
      "Choose FilterBar for lists with three or more filter fields. Keep a single Select or ToggleGroup beside the search when there is one filter people always use.",
    rules: [
      {
        id: "filter-bar-host-filters",
        when: "A FilterBar sits above a table or list.",
        do: "Filter the rows from the reported filters, ignore a filter with no values and show the matching count.",
        avoid:
          "Render chips that do not change the rows, or treat an empty chip as matching nothing.",
        reason: "A chip that does not narrow the list breaks trust in every other filter.",
        evidence: ["src/pages/design-system/examples/filter-bar/default.tsx"],
        detect: {
          by: "review",
          how: "Apply two filters and check the row count drops to rows that match both."
        }
      },
      {
        id: "filter-bar-focus-after-remove",
        when: "A chip is removed by its x button.",
        do: "Let FilterBar move focus to the neighboring chip or Add filter.",
        avoid: "Unmount the bar or rebuild chips with new keys, which drops focus to the page.",
        reason: "Keyboard and screen reader users lose their place when focus falls to the body.",
        evidence: ["src/components/v4/patterns/filter-bar.tsx"],
        detect: {
          by: "test",
          test: "src/components/v4/patterns/filter-bar.test.tsx",
          how: "Removes the first of two chips and expects focus on the remaining chip."
        }
      }
    ],
    states: [
      { state: "empty", guidance: "Only search and Add filter; no chip row is drawn." },
      {
        state: "pending value",
        guidance: "A newly added chip reads is any with its picker open until a value is chosen."
      }
    ],
    antiSlop: [
      {
        do: "Write the chip as a sentence: Expiration date before 2026-12-01.",
        avoid: "Show a bare value such as 2026-12-01 or a count such as Status (2).",
        reason: "People read the field and the comparison without opening the picker."
      }
    ]
  },
  checks: [
    { kind: "static", command: "npm run type:check" },
    { kind: "runtime", command: "npx vitest run src/components/v4/patterns/filter-bar.test.tsx" },
    {
      kind: "browser",
      command:
        "npm run dev; open /design-system#filter-bar, add, edit and remove filters by keyboard."
    }
  ]
} satisfies ComponentDefinition;
