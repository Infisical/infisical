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
    'min="card" raises the auto-fit floor to size-card-min (320px) for grids of Cards holding DataLists, so a pair of cards drops to one column before label and value rows start wrapping.',
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
      command: "npm run dev; open /design-system#layout and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;

export const detailLayoutDefinition = {
  id: "detail-layout",
  title: "Detail layout",
  group: "Utilities",
  summary:
    "Lay out a detail page as stacked content cards with a details sidecar on the right that stacks above them in narrow containers.",
  sourceFiles: ["src/components/v4/ui/layout.tsx", "src/components/v4/ui/detail-layout.module.css"],
  exports: ["DetailLayout"],
  referenceNames: ["DetailLayout", "Sidecar"],
  related: ["layout", "card", "list", "top-bar"],
  behavior: [
    "DetailLayout renders two columns: children stack as the main column and aside holds the sidecar, usually one details Card with a props DataList. Both columns stack their cards at space-24, and the columns sit space-24 apart.",
    "At size-sidecar-collapse (896px) of its own width and wider, the main column fills the space left of a size-sidecar (384px) sidecar on the right. The layout is its own container, so it answers to the width it gets inside the page gutter, not to the viewport.",
    "Narrower than size-sidecar-collapse, the columns stack and the sidecar comes first, above the main cards, because it is the summary of the record.",
    "In two columns the sidecar sticks below the TopBar (size-shell-bar plus space-24 inside an AppInset with a TopBar, space-24 elsewhere) while the main column scrolls, but only when the whole sidecar fits in the scroll area's visible height with space-24 to spare at the bottom. It measures itself and its scroll container whenever either resizes; a sidecar taller than that scrolls with the page, so no part of it is ever out of reach."
  ],
  accessibility: [
    "The sidecar renders an aside named by asideLabel (for example Details or Certificate details), so screen reader users can jump to it as a complementary region inside the main landmark.",
    "The sidecar comes first in the DOM, in reading and Tab order, at every width. Stacked, the visual order matches the DOM exactly. In two columns, focus moves from the page header actions at the top right into the sidecar on the right, then to the main column, and the two columns start on the same top edge, so the only reordering is the sidecar's placement to the right; no CSS order property moves content (WCAG 1.3.2 and 2.4.3).",
    "Sticking never hides focus: the sidecar sticks only when it fits entirely in view, so a focused control inside it is never under the TopBar or below the fold."
  ],
  limitations: [
    "One sidecar on the right only; there is no left placement and no width prop. Use size-sidecar as given.",
    "The container breakpoint is written as 896px in the stylesheet because container conditions cannot read custom properties. A test fails if it drifts from size-sidecar-collapse.",
    "Sticking needs every ancestor between the layout and its scroll container to leave overflow visible; an overflow hidden or auto wrapper in between turns it into a plain column."
  ],
  examples: [
    {
      id: "default",
      title: "Wide and narrow containers",
      module: "./examples/detail-layout/default.tsx",
      states: ["default", "overflow"]
    }
  ],
  coverage: [
    {
      axis: "container width",
      expected: ["wide", "narrow"],
      shown: [
        { value: "wide", exampleId: "default", label: "Wide container, sidecar on the right" },
        {
          value: "narrow",
          exampleId: "default",
          label: "Narrow container, sidecar stacks above the main cards"
        }
      ]
    },
    {
      axis: "sticky sidecar",
      expected: ["fits", "taller than the scroll area"],
      shown: [],
      omitted: [
        {
          value: "fits",
          reason:
            "Sticking needs a scroll container taller than a docs specimen; the Machine identity and Certificate comparison pages show it, and detail-layout.test.tsx checks the measurement."
        },
        {
          value: "taller than the scroll area",
          reason:
            "detail-layout.test.tsx checks that a sidecar taller than its scroll area does not stick."
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Use DetailLayout for a record's detail page: one details card that summarizes the record, beside stacked cards for its related content (auth methods, projects, subject alternative names, installations)."
    ],
    avoid: [
      "Do not use it for settings pages or dashboards whose cards are peers; use Stack or Grid there."
    ],
    decision:
      "Choose DetailLayout when a page pairs one summary card with stacked content cards. Choose Grid for peer cards of equal weight and Stack for a single column.",
    rules: [
      {
        id: "detail-layout-sidecar-right",
        when: "A detail page shows a details card next to stacked content cards.",
        do: "Pass the details card as aside with an asideLabel and the content cards as children, so the sidecar sits on the right and stacks above them when narrow.",
        avoid:
          "Hand-build a two-column grid with a fractional details column on the left, or reorder columns with CSS order.",
        reason:
          "One primitive keeps the sidecar width, gap, breakpoint and reading order the same on every detail page.",
        evidence: [
          "src/components/v4/ui/layout.tsx",
          "src/pages/design-system/examples/detail-layout/default.tsx"
        ],
        detect: {
          by: "test",
          test: "src/components/v4/ui/detail-layout.test.tsx",
          how: "Render a DetailLayout and check that the named aside comes before the main column in the DOM and that the stylesheet's container breakpoint equals size-sidecar-collapse."
        }
      },
      {
        id: "detail-layout-sticky-reachable",
        when: "The sidecar may be taller than the visible scroll area.",
        do: "Let DetailLayout decide: it sticks only when the whole sidecar fits below the TopBar.",
        avoid: "Force position sticky on the sidecar or cap its height with an inner scroller.",
        reason:
          "A sticky panel taller than the viewport hides its lower rows until the page ends, and a nested scroller traps wheel and keyboard scrolling.",
        evidence: [
          "src/components/v4/ui/layout.tsx",
          "src/components/v4/ui/detail-layout.module.css"
        ],
        detect: {
          by: "test",
          test: "src/components/v4/ui/detail-layout.test.tsx",
          how: "Give the sidecar a height under and over its scroll container's height and check data-sticky follows."
        }
      }
    ],
    states: [
      {
        state: "narrow",
        guidance:
          "Below size-sidecar-collapse the sidecar stacks above the main cards at full width."
      },
      {
        state: "long",
        guidance:
          "A tall sidecar scrolls with the page instead of sticking; keep its card to the record's summary fields."
      }
    ],
    antiSlop: [
      {
        do: "Keep the sidecar to one or two summary cards.",
        avoid: "Move content lists or tables into the sidecar to balance column heights.",
        reason: "The sidecar is the record summary; lists need the main column's width."
      }
    ]
  },
  checks: [
    { kind: "static", command: "npm run type:check" },
    { kind: "runtime", command: "npx vitest run src/components/v4/ui/detail-layout.test.tsx" },
    {
      kind: "browser",
      command:
        "npm run dev; open /design-system#detail-layout and /design-system#compare-identities, resize below 896px of layout width."
    }
  ]
} satisfies ComponentDefinition;
