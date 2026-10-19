import type { ComponentDefinition } from "./types";

export const textDefinition = {
  id: "text",
  title: "Text",
  group: "Utilities",
  summary: "Use shared body and supporting-text measures.",
  sourceFiles: ["src/components/v4/ui/text.tsx", "src/components/v4/ui/text.module.css"],
  exports: ["Text", "SmallText", "Heading", "Meta"],
  referenceNames: ["Text"],
  behavior: [
    "Body uses the complete 14/20 role; supporting copy uses 13/18. Each role owns font family, weight and tracking as well as size and line height.",
    "Muted text uses the semantic muted role.",
    "Heading separates semantic level from visual size. page uses 28/32, explicit display uses 44/44, and section/subsection use the shared section role. Meta uses the 12/16 metadata role with optional monospace.",
    "Native attributes and refs are preserved."
  ],
  accessibility: [
    "Text and SmallText render paragraphs; Heading renders the requested h1-h6 level; Meta renders a span."
  ],
  limitations: ["Do not use a visually styled paragraph in place of a semantic section heading."],
  examples: [
    {
      id: "default",
      title: "Heading roles and body text",
      module: "./examples/text/default.tsx",
      states: ["default"]
    }
  ],
  coverage: [
    {
      axis: "Heading.size",
      expected: ["page", "display", "section", "subsection"],
      shown: [
        { value: "display", exampleId: "default", label: "display" },
        { value: "page", exampleId: "default", label: "page" },
        { value: "section", exampleId: "default", label: "section" },
        { value: "subsection", exampleId: "default", label: "subsection" }
      ]
    },
    {
      axis: "Heading level",
      expected: ["1", "2", "3", "4", "5", "6"],
      shown: [],
      omitted: ["1", "2", "3", "4", "5", "6"].map((value) => ({
        value,
        reason:
          "Level sets the document outline and the tag, not the look. The workbench owns the page h1, and size is shown above."
      }))
    },
    {
      axis: "body roles",
      expected: ["Text", "SmallText", "Meta mono", "Meta plain"],
      shown: [
        { value: "Text", exampleId: "default", label: "Text" },
        { value: "SmallText", exampleId: "default", label: "SmallText" },
        { value: "Meta mono", exampleId: "default", label: "Meta, mono" },
        { value: "Meta plain", exampleId: "default", label: "Meta, plain" }
      ]
    }
  ],
  guidance: {
    use: [
      "Use Text, SmallText, Heading and Meta for their content roles. Choose semantic heading level separately from page, display, section or subsection size."
    ],
    avoid: [],
    decision:
      "Choose Text and Meta for shared body and supporting styles, and Heading for actual section hierarchy. Use Code for machine literals.",
    rules: [
      {
        id: "text-usage",
        when: "A section title needs a smaller visual size than the page title.",
        do: "Choose a semantic heading level from the document hierarchy and a visual size from its role.",
        avoid:
          "Use a styled div as a heading or choose h3 only because its default text looks smaller.",
        reason: "Structure and visual scale solve different problems.",
        evidence: [
          "src/components/v4/ui/text.tsx",
          "src/pages/design-system/examples/text/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Read section headings and supporting facts in document order. Semantic heading levels express hierarchy while visual sizes/weights express emphasis without turning every line into a heading."
        }
      },
      {
        id: "text-complete-type-role",
        when: "Several components express the same title or supporting-text role.",
        do: "Use Heading for hierarchy and its supported visual size, Text or SmallText for prose and Meta for secondary facts; reserve mono for exact technical content.",
        avoid:
          "Patch font size, line height and weight separately in each caller or let a border variant turn a section title into uppercase metadata.",
        reason:
          "A type role needs consistent measurements and meaning across components, independent of framing.",
        detect: {
          by: "review",
          how: "Compare equivalent titles and secondary facts in related components. Rank, line height, weight and family agree by role while technical values remain exact."
        },
        evidence: [
          "src/components/v4/ui/text.tsx",
          "src/pages/design-system/examples/text/default.tsx"
        ]
      }
    ],
    states: [
      {
        state: "supporting",
        guidance: "Keep Meta legible and reserve it for secondary facts."
      },
      {
        state: "long-content",
        guidance: "Use readable measure and allow wrapping rather than truncating instructions."
      }
    ],
    antiSlop: [
      {
        do: "Use monospace for identifiers, commands and machine values. Keep labels and explanations in the interface family, with emphasis only where meaning changes.",
        avoid: "Set every label, sentence and supporting line in monospace, bold or uppercase.",
        reason:
          "Technical values benefit from a fixed measure; ordinary prose needs a readable hierarchy."
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
      command: "npm run ui:dev; open /design-system#text and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
