import type { ComponentDefinition } from "./types";

export const iconDefinition = {
  id: "icon",
  title: "Icon",
  group: "Utilities",
  summary: "Render the 52 owned product glyphs as safe SVG geometry.",
  sourceFiles: ["src/components/v4/ui/icon.tsx", "src/components/v4/ui/icon-data.ts"],
  exports: ["Icon", "iconNames"],
  referenceNames: ["Icon"],
  behavior: [
    "Names are a TypeScript union derived from the immutable owned shape map.",
    "Size and stroke width preserve the shared 24-unit geometry."
  ],
  accessibility: [
    "Icons are decorative by default. With label, the icon is announced as an image with that name."
  ],
  limitations: ["Do not rely on an unlabeled glyph to explain an icon-only action or a status."],
  examples: [
    {
      id: "default",
      title: "Owned glyphs with visible names",
      module: "./examples/icon/default.tsx",
      states: ["default"]
    },
    {
      id: "sizes",
      title: "Sizes and naming",
      module: "./examples/icon/sizes.tsx",
      states: ["default"]
    }
  ],
  coverage: [
    {
      axis: "representative numeric size",
      expected: ["12", "16", "20", "24"],
      shown: [
        {
          value: "12",
          exampleId: "sizes",
          label: "12px"
        },
        {
          value: "16",
          exampleId: "sizes",
          label: "16px"
        },
        {
          value: "20",
          exampleId: "sizes",
          label: "20px"
        },
        {
          value: "24",
          exampleId: "sizes",
          label: "24px"
        }
      ]
    },
    {
      axis: "name and semantics",
      expected: ["all owned names", "decorative", "named", "action"],
      shown: [
        {
          value: "all owned names",
          exampleId: "default",
          label: "search"
        },
        {
          value: "decorative",
          exampleId: "sizes",
          label: "12px"
        },
        {
          value: "named",
          exampleId: "sizes",
          label: "Named image"
        },
        {
          value: "action",
          exampleId: "sizes",
          label: "Action icon"
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Choose an existing IconName, keep decorative glyphs unnamed beside visible text and name the action itself when it has no text."
    ],
    avoid: [
      "Invent a new glyph for ordinary status, label both icon and button with duplicate names or use an unfamiliar symbol for a destructive action alone."
    ],
    decision:
      "Choose Icon for an owned product glyph and Avatar for a person. Use visible text when the meaning is unfamiliar or consequential.",
    rules: [
      {
        id: "icon-usage",
        when: "An icon is the only visible content of a button.",
        do: "Name the button with its action and keep the glyph decorative inside that named control.",
        avoid:
          "Treat a raw SVG glyph as a complete action or rely on its shape to explain a destructive consequence.",
        reason: "Geometry alone does not provide a reliable action name.",
        evidence: [
          "src/components/v4/ui/icon.tsx",
          "src/pages/design-system/examples/icon/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Inspect each icon-only action without seeing its glyph. The action still has a purpose-specific accessible name, and decorative glyphs do not add duplicate names."
        }
      }
    ],
    states: [
      {
        state: "decorative",
        guidance: "Hide the glyph from assistive output when nearby text already names it."
      },
      {
        state: "standalone",
        guidance: "Name the meaning through the component or its containing control."
      }
    ],
    antiSlop: [
      {
        do: "Use a glyph when it improves scanning or recognition.",
        avoid: "Add an icon to every label and every metadata value.",
        reason: "Repeated symbols increase visual density without adding distinctions."
      }
    ]
  },
  checks: [
    {
      kind: "static",
      command: "npm run type:check"
    },
    {
      kind: "runtime",
      command: "npm test -- src/components/v4/ui/brand-runtime.test.tsx"
    },
    {
      kind: "browser",
      command: "npm run ui:dev; open /design-system#icon and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
