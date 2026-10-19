import type { ComponentDefinition } from "./types";

export const layoutDefinition = {
  id: "layout",
  title: "Layout measures",
  group: "Utilities",
  summary: "Compose responsive layouts with source spacing tokens and shared width measures.",
  sourceFiles: ["src/components/v4/ui/layout.tsx", "src/components/v4/ui/text.module.css"],
  exports: ["Stack", "Inline", "Grid", "Container", "Measure", "PageMeasure", "FormMeasure"],
  referenceNames: ["Layout"],
  behavior: [
    "Stack and Inline use source spacing tokens, alignment and wrapping; Inline wraps by default.",
    "Grid automatically preserves the tile-width floor and drops columns in narrow containers. Explicit columns use equal flexible tracks.",
    "Container centers the page width; Measure constrains prose, forms or page content."
  ],
  accessibility: ["Caller owns semantic main, section and form elements."],
  limitations: ["Do not nest page measures; use one per page content area."],
  examples: [
    {
      id: "default",
      title: "Stack, Inline, Grid and measures",
      module: "./examples/layout/default.tsx",
      states: ["default", "overflow"]
    }
  ],
  coverage: [
    {
      axis: "Measure.size",
      expected: ["page", "form", "prose"],
      shown: [
        { value: "page", exampleId: "default", label: "page" },
        { value: "form", exampleId: "default", label: "form" },
        { value: "prose", exampleId: "default", label: "prose" }
      ]
    },
    {
      axis: "Grid columns",
      expected: ["2", "3", "4", "auto-fit"],
      shown: [
        { value: "3", exampleId: "default", label: "3 columns" },
        { value: "auto-fit", exampleId: "default", label: "auto-fit" }
      ],
      omitted: [
        { value: "2", reason: "Explicit counts use the same equal tracks as 3 columns." },
        { value: "4", reason: "Explicit counts use the same equal tracks as 3 columns." }
      ]
    },
    {
      axis: "gap tokens",
      expected: ["0", "4", "8", "12", "16", "24", "32", "48"],
      shown: [{ value: "8", exampleId: "default", label: "Stack" }],
      omitted: ["0", "4", "12", "16", "24", "32", "48"].map((value) => ({
        value,
        reason: "The Spacing page shows the whole gap scale; one gap demonstrates the prop."
      }))
    },
    {
      axis: "alignment",
      expected: ["start", "center", "end", "stretch"],
      shown: [],
      omitted: ["start", "center", "end", "stretch"].map((value) => ({
        value,
        reason: "Alignment maps directly to CSS align-items; the examples keep the default."
      }))
    },
    {
      axis: "justification",
      expected: ["start", "center", "end", "between"],
      shown: [],
      omitted: ["start", "center", "end", "between"].map((value) => ({
        value,
        reason: "Justification maps directly to CSS justify-content; the examples keep the default."
      }))
    },
    {
      axis: "wrap",
      expected: ["true", "false"],
      shown: [
        {
          value: "true",
          exampleId: "default",
          label: "Inline, wraps when the row runs out of room"
        }
      ],
      omitted: [
        { value: "false", reason: "Turning wrap off only removes the wrapping shown here." }
      ]
    }
  ],
  guidance: {
    use: [
      "Use supported spacing and width roles to relate siblings. Choose one page measure and narrower inner form or prose measures where useful."
    ],
    avoid: [],
    decision:
      "Choose Stack, Inline and Grid for layout relationships, and Measure for content width. Use one page measure and narrower form measures within it.",
    rules: [
      {
        id: "layout-usage",
        when: "An action row outgrows the available width.",
        do: "Let Inline or an outer layout wrap while preserving each control's own dimensions.",
        avoid: "Nest multiple page measures or shrink every control to keep one desktop row.",
        reason:
          "Layout should adapt the group without changing the control's interaction geometry.",
        evidence: [
          "src/components/v4/ui/layout.tsx",
          "src/pages/design-system/examples/layout/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Constrain a page/form measure and wrap its action row. Controls keep usable dimensions and one page measure contains the intended content without redundant nested constraints."
        }
      },
      {
        id: "layout-relationship-and-measure",
        when: "Components need shared spacing without changing their internal design.",
        do: "Use Stack, Inline and Grid for sibling relationships, choose a supported gap and use one page Measure with narrower form or prose measures where needed.",
        avoid:
          "Add type or padding classes to a component to compensate for a missing recipe, nest page measures or disable wrapping merely to preserve a screenshot.",
        reason:
          "Layout wrappers own relationships; component internals and readable width need one effective owner each.",
        detect: {
          by: "review",
          how: "Resize a related control cluster and enlarge text. Wrapping preserves order, the content measure is deliberate and no child needs local styling to align with its peers."
        },
        evidence: [
          "src/components/v4/ui/layout.tsx",
          "src/pages/design-system/examples/layout/default.tsx"
        ]
      }
    ],
    states: [
      {
        state: "narrow",
        guidance: "Keep form and prose measure within the viewport."
      },
      {
        state: "dense",
        guidance: "Choose a smaller gap deliberately without collapsing unrelated action groups."
      }
    ],
    antiSlop: [
      {
        do: "Use spacing to express actual grouping.",
        avoid: "Add an empty Card around every Stack or force equal heights on unrelated content.",
        reason: "Layout primitives should reduce containers and clarify relationships."
      }
    ]
  },
  checks: [
    {
      kind: "static",
      command: "npm run type:check"
    },
    {
      kind: "browser",
      command: "npm run ui:dev; open /design-system#layout and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
