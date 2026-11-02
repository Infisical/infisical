import type { ComponentDefinition } from "./types";

export const documentationLinkBadgeDefinition = {
  id: "documentation-link-badge",
  title: "Documentation link badge",
  group: "Navigation",
  summary:
    "An info Badge that opens a documentation page in a new tab, with a fixed label and tooltip.",
  sourceFiles: [
    "src/components/v4/ui/documentation-link-badge.tsx",
    "src/components/v4/ui/documentation-link-badge.module.css"
  ],
  exports: ["DocumentationLinkBadge"],
  referenceNames: ["DocumentationLinkBadge"],
  behavior: [
    "The caller passes only href. The component owns the Documentation label, the external icon, target _blank and rel noopener noreferrer.",
    "default is an info-tone Badge drawn as an anchor; hover lays translucent ink over the info ground. Its tooltip says it opens in a new tab.",
    "minified is the external icon alone in a badge-height square in info color, for tight rows; its tooltip says Documentation."
  ],
  accessibility: [
    "Both variants are real links. Their accessible name is Documentation (opens in a new tab): default adds the phrase as visually hidden text, minified sets it as aria-label.",
    "The icon is decorative and hidden from assistive technology.",
    "Focus draws the shared ink outline."
  ],
  limitations: [
    "The label is fixed. A link to something other than documentation, or with its own wording, is an ordinary link or Button.",
    "It always opens a new tab; in-app navigation uses a router link."
  ],
  related: ["badge", "tooltip"],
  examples: [
    {
      id: "default",
      title: "Variants and placement",
      module: "./examples/documentation-link-badge/default.tsx",
      states: ["default"]
    }
  ],
  coverage: [
    {
      axis: "variant",
      expected: ["default", "minified"],
      shown: [
        { value: "default", exampleId: "default", label: "default" },
        { value: "minified", exampleId: "default", label: "minified" }
      ]
    }
  ],
  guidance: {
    use: [
      "Use it beside a page, section or field title that has a documentation page, passing only that page's URL."
    ],
    avoid: ["Do not use it for links to product pages, changelogs or support."],
    decision:
      "Choose DocumentationLinkBadge over a hand-built Badge link so every documentation link has the same label, tab behavior, safe rel and accessible name.",
    rules: [
      {
        id: "documentation-link-badge-owned-attributes",
        when: "A title or field links to its documentation page.",
        do: "Render DocumentationLinkBadge with href and nothing else.",
        avoid:
          "Wrap a Badge around an anchor and set target, rel and the label by hand, or pass a custom label.",
        reason:
          "A hand-built link drifts on rel, label and the new-tab announcement, and a missing noopener hands the opened page a handle on this window.",
        evidence: [
          "src/components/v4/ui/documentation-link-badge.tsx",
          "src/pages/design-system/examples/documentation-link-badge/default.tsx"
        ],
        detect: {
          by: "test",
          test: "src/components/v4/ui/documentation-link-badge.test.tsx",
          how: "Renders the badge and checks target, rel and the accessible name that says it opens in a new tab."
        }
      }
    ],
    states: [
      {
        state: "hover",
        guidance: "Translucent ink over the info ground; the label does not change."
      },
      { state: "focus", guidance: "The shared ink outline, offset by the focus-ring size." }
    ],
    antiSlop: [
      {
        do: "Place one badge per documented section.",
        avoid: "Repeat the badge on every row or field of the same section.",
        reason: "Repeated identical links add noise and tab stops without new destinations."
      }
    ]
  },
  checks: [
    {
      kind: "runtime",
      command: "npm test -- src/components/v4/ui/documentation-link-badge.test.tsx"
    },
    { kind: "static", command: "npm run type:check" },
    { kind: "browser", command: "Verify both themes, hover, focus and the tooltip." }
  ]
} satisfies ComponentDefinition;
