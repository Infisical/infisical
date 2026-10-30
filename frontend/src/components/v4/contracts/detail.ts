import type { ComponentDefinition } from "./types";

export const detailDefinition = {
  id: "detail",
  title: "Detail",
  group: "Data display",
  summary:
    "Stacked label and value pairs for a resource's details, optionally grouped under headers.",
  sourceFiles: ["src/components/v4/ui/detail.tsx", "src/components/v4/ui/detail.module.css"],
  exports: ["Detail", "DetailLabel", "DetailValue", "DetailGroup", "DetailGroupHeader"],
  referenceNames: ["Detail"],
  behavior: [
    "Detail is one label over one value: the label in the caption role and muted, the value in the body role and ink, space-4 apart.",
    "Values take any node (text, code, a Badge, a copy button) and wrap long unbroken identifiers instead of overflowing.",
    "DetailGroup stacks its children space-16 apart. DetailGroupHeader is a label-role heading that sits in that same stack, so headers and Details interleave as siblings, as they do on main.",
    "DetailGroupHeader takes an optional action slot at its end for a section's Edit button, so the title and the action never share one string."
  ],
  accessibility: [
    "Each Detail renders its own description list: dl with one dt and one dd. It is valid wherever it lands, inside a group, a Card or a Sheet, with no wrapping list.",
    "DetailGroupHeader renders a real heading, h3 by default; set level so it nests under the page's outline.",
    "The header action is outside the heading element, so the heading's name is the title alone."
  ],
  limitations: [
    "Detail stacks the label over the value. For a two-column term and value table with the value on the right, use DataList.",
    "A Detail holds one label and one value; repeat Detail for each pair rather than putting several dt and dd in one.",
    "DetailGroup does not draw dividers or a frame; put it in a Card or a Sheet body for that."
  ],
  related: ["list", "card", "detail-layout"],
  examples: [
    {
      id: "default",
      title: "Groups, headers and loose details",
      module: "./examples/detail/default.tsx",
      states: ["default", "overflow", "disabled"]
    }
  ],
  coverage: [
    {
      axis: "composition",
      expected: ["grouped with header", "header action", "loose"],
      shown: [
        {
          value: "grouped with header",
          exampleId: "default",
          label: "Groups with headers and an edit action"
        },
        {
          value: "header action",
          exampleId: "default",
          label: "Groups with headers and an edit action"
        },
        { value: "loose", exampleId: "default", label: "Loose details, no group" }
      ]
    }
  ],
  guidance: {
    use: [
      "Use Detail for the properties of one resource in a details card or a sheet, where each value may be rich content and sections need their own headers."
    ],
    avoid: [
      "Do not use Detail for numbers that compare across a grid of cards; DataList stat or props puts terms and values in two aligned columns."
    ],
    decision:
      "Choose Detail when labels sit above values and values hold arbitrary nodes, which is how main's details cards and sheets read. Choose DataList for compact right-aligned term and value rows built from data.",
    rules: [
      {
        id: "detail-header-action",
        when: "A section of details has an action such as Edit that applies to the whole section.",
        do: "Pass the button through DetailGroupHeader's action prop and keep the title as the header's children.",
        avoid:
          "Put the button inside the header children or hand-build a flex row with justify-between around the title.",
        reason:
          "The action slot keeps the button out of the heading's accessible name and keeps every section's edge and gap the same.",
        evidence: [
          "src/components/v4/ui/detail.tsx",
          "src/pages/design-system/examples/detail/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Read each DetailGroupHeader: the children are text only and any button is in action. A screen reader's heading list reads the title alone."
        }
      }
    ],
    states: [
      {
        state: "missing value",
        guidance: "Write a word such as None or Not set in the value; never leave the dd empty."
      },
      {
        state: "blocked action",
        guidance: "Keep a header action visible and disabled when the person lacks permission."
      }
    ],
    antiSlop: [
      {
        do: "Let the label and value roles carry the hierarchy.",
        avoid: "Add bold, uppercase or color classes to labels to make them stand out.",
        reason:
          "The caption and body roles already separate the two; restyling drifts across pages."
      }
    ]
  },
  checks: [
    { kind: "runtime", command: "npm test -- src/components/v4/ui/detail.test.tsx" },
    { kind: "static", command: "npm run type:check" },
    { kind: "browser", command: "Verify both themes, a long unbroken value and a narrow card." }
  ]
} satisfies ComponentDefinition;
