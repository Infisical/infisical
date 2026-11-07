import type { ComponentDefinition } from "./types";

export const providerIconDefinition = {
  id: "provider-icon",
  title: "Provider icon",
  group: "Data display",
  summary: "A third-party provider's logo from public/images/integrations, swapped for the theme.",
  sourceFiles: [
    "src/components/v4/ui/provider-icon.tsx",
    "src/components/v4/ui/provider-icon.module.css"
  ],
  exports: ["ProviderIcon", "providerIconPath"],
  referenceNames: ["ProviderIcon"],
  behavior: [
    "icon is main's filename under /images/integrations (for example Amazon Web Services.png). Logos with a light or dark counterpart (onLight or onDark, the same map main uses) resolve to it from the V4Scope theme.",
    "size is sm, md, lg or xl: size-icon-sm (14px), size-icon (16px), size-icon-lg (20px) and size-icon-xl (24px). md is the default. The logo is contained, never cropped.",
    "A file that fails to load falls back to the apps glyph in faint ink at the same size, so the row keeps its layout."
  ],
  accessibility: [
    "alt is required. Name the provider (AWS logo) when the logo stands alone, or pass an empty string when the provider's name is beside it.",
    "The fallback keeps the alt as its accessible name (role img), or is hidden when alt is empty."
  ],
  limitations: [
    "Only files shipped under public/images/integrations resolve. A new logo with a theme counterpart needs an entry in the variants map.",
    "It renders the logo bare; put it in Media for a framed tile."
  ],
  related: ["icon", "item"],
  examples: [
    {
      id: "default",
      title: "Sizes, theme variants and fallback",
      module: "./examples/provider-icon/default.tsx",
      states: ["default", "error"]
    }
  ],
  coverage: [
    {
      axis: "size",
      expected: ["sm", "md", "lg", "xl"],
      shown: [
        { value: "sm", exampleId: "default", label: "sm" },
        { value: "md", exampleId: "default", label: "md" },
        { value: "lg", exampleId: "default", label: "lg" },
        { value: "xl", exampleId: "default", label: "xl" }
      ]
    }
  ],
  guidance: {
    use: ["Use ProviderIcon wherever a row, picker or header shows a third-party provider's logo."],
    avoid: ["Do not draw an img with a /images/integrations path and a theme check by hand."],
    decision:
      "Choose ProviderIcon for third-party logos so the theme swap, sizes and fallback stay in one place. Use Icon for interface glyphs.",
    rules: [
      {
        id: "provider-icon-theme-variant",
        when: "A provider logo is unreadable on one theme (dark marks on dark ground, white marks on light).",
        do: "Add the counterpart file and its entry to the variants map, and keep passing main's base filename as icon.",
        avoid: "Pick the file at the call site from the theme.",
        reason: "One map keeps every surface on the same file for the same provider and theme.",
        evidence: [
          "src/components/v4/ui/provider-icon.tsx",
          "src/pages/design-system/examples/provider-icon/default.tsx"
        ],
        detect: {
          by: "test",
          test: "src/components/v4/ui/provider-icon.test.tsx",
          how: "Renders GitHub.png in a light scope and checks the src resolves to the on-light file."
        }
      }
    ],
    states: [
      { state: "light and dark", guidance: "The counterpart file swaps with the scope's theme." },
      { state: "missing file", guidance: "The apps glyph stands in at the same size." }
    ],
    antiSlop: [
      {
        do: "Pick one size per surface and keep it across rows.",
        avoid: "Scale logos with arbitrary width classes.",
        reason: "Mixed logo sizes make a list look misaligned."
      }
    ]
  },
  checks: [
    { kind: "runtime", command: "npm test -- src/components/v4/ui/provider-icon.test.tsx" },
    { kind: "static", command: "npm run type:check" },
    {
      kind: "browser",
      command: "Verify both themes for GitHub, OpenAI and Anthropic, and the fallback."
    }
  ]
} satisfies ComponentDefinition;
