import type { ComponentDefinition } from "./types";

export const coverDefinition = {
  id: "cover",
  title: "Cover",
  group: "Utilities",
  summary:
    "The brand cover: a display title and tagline beside a block composition drawn from the system's tokens.",
  sourceFiles: ["src/components/v4/ui/cover.tsx", "src/components/v4/ui/cover.module.css"],
  exports: ["Cover"],
  referenceNames: ["Cover"],
  behavior: [
    "The cover keeps a 960 by 288 ratio and scales its type with its own width.",
    "The art is an ink slab, an accent square and a control band with a grid of dots, all filled from color tokens and rounded with the corner tokens, so it follows theme and corner changes."
  ],
  accessibility: [
    "The art is decorative and hidden from assistive technology. The title is an h1."
  ],
  limitations: ["For the workbench, docs and release surfaces only; product pages use PageHeader."],
  examples: [
    {
      id: "default",
      title: "Brand cover",
      module: "./examples/cover/default.tsx",
      states: ["default"]
    }
  ],
  coverage: [
    {
      axis: "size support",
      expected: ["no authored named size"],
      shown: [],
      omitted: [
        {
          value: "no authored named size",
          reason: "The cover scales with its container at a fixed ratio."
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Use Cover at the top of a brand or documentation surface with a short title and one-line tagline."
    ],
    avoid: ["Use it as a product page header or add photos or gradients to the art."],
    decision: "Choose Cover for brand surfaces. Use PageHeader for product pages.",
    rules: [
      {
        id: "cover-tokens",
        when: "The cover art changes.",
        do: "Draw blocks from color, radius and space tokens so theme and corner choices carry through.",
        avoid: "Hard-code colors or corner radii in the SVG.",
        reason: "The cover is the system's own sample and must follow its settings.",
        evidence: ["src/components/v4/ui/cover.tsx", "src/components/v4/ui/cover.module.css"],
        detect: {
          by: "review",
          how: "Toggle the theme and check that every block follows it."
        }
      }
    ],
    states: [
      {
        state: "narrow",
        guidance: "Type scales down with the container; the tagline keeps body size."
      }
    ],
    antiSlop: [
      {
        do: "Keep the tagline to one plain sentence.",
        avoid: "Stack slogans or badges over the art.",
        reason: "The composition carries the brand by itself."
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
      command: "npm run ui:dev; open /design-system#cover and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
