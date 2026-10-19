import type { ComponentDefinition } from "./types";

export const pageHeaderDefinition = {
  id: "page-header",
  title: "Page header",
  group: "Navigation",
  summary:
    "The top of a page: the page-level trail, the title with its badges, a lede, actions and tabs.",
  sourceFiles: [
    "src/components/v4/ui/page-header.tsx",
    "src/components/v4/ui/page-header.module.css"
  ],
  exports: ["PageHeader"],
  referenceNames: ["PageHeader"],
  behavior: [
    "The breadcrumb sits 8px above the title and every crumb is an ancestor, so none is marked current.",
    "lg sets the title in the 44/44 display role for top-level pages; md uses the 28/32 role for one object's page.",
    "Actions sit beside the title and drop under it when both cannot share a line. Titles wrap and never truncate.",
    "Tabs sit 24px below everything else."
  ],
  accessibility: [
    "The title is the page's one h1.",
    "A long folder path collapses its middle into a named button that expands in place."
  ],
  limitations: ["The host provides the tab panels and routes; the header only places them."],
  examples: [
    {
      id: "default",
      title: "Top-level page and object page",
      module: "./examples/page-header/default.tsx",
      states: ["default", "overflow"]
    }
  ],
  coverage: [
    {
      axis: "size",
      expected: ["lg", "md"],
      shown: [
        { value: "lg", exampleId: "default", label: "lg" },
        { value: "md", exampleId: "default", label: "md" }
      ]
    }
  ],
  guidance: {
    use: [
      "Use one PageHeader per page with a title, a lede that says what needs attention and at most one primary action."
    ],
    avoid: [
      "Repeat the organization, project or environment trail here, or repeat the title as the last crumb."
    ],
    decision:
      "Choose PageHeader for the page's own title and trail. The product-level trail belongs in TopBar.",
    rules: [
      {
        id: "page-header-lede",
        when: "A page has a lede under its title.",
        do: "Say what needs attention with a count, such as 3 secrets are missing in production.",
        avoid: "Describe what the page is, such as This page lists your secrets.",
        reason:
          "The title already names the page; the lede earns its line by telling the person what to do.",
        evidence: [
          "src/components/v4/ui/page-header.tsx",
          "src/pages/design-system/examples/page-header/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Read each lede and check that it states a count or a needed action."
        }
      },
      {
        id: "page-header-actions",
        when: "A page offers actions in its header.",
        do: "Place at most one primary action, last, and keep the rest secondary or in a menu.",
        avoid: "Line up several primary buttons beside the title.",
        reason: "One primary action tells the person what the page is for.",
        evidence: ["src/pages/design-system/examples/page-header/default.tsx"],
        detect: { by: "review", how: "Count primary buttons in each header." }
      }
    ],
    states: [
      {
        state: "overflow",
        guidance: "Long titles wrap, and long folder paths collapse their middle crumbs."
      }
    ],
    antiSlop: [
      {
        do: "Use sentence case for titles and keep keys, paths and hosts in mono.",
        avoid: "Title case every word or add an eyebrow that repeats the root crumb.",
        reason: "The root crumb already sits in the top bar above the title."
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
      command:
        "npm run ui:dev; open /design-system#page-header and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
