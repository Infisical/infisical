import type { ComponentDefinition } from "./types";

export const topBarDefinition = {
  id: "top-bar",
  title: "Top bar",
  group: "Navigation",
  summary:
    "The strip across the top of the inset with the product-level breadcrumb on the left and page-wide tools on the right.",
  sourceFiles: ["src/components/v4/ui/top-bar.tsx", "src/components/v4/ui/top-bar.module.css"],
  exports: ["TopBar", "AppShell", "AppInset", "PageGutter"],
  referenceNames: ["TopBar"],
  behavior: [
    "TopBar is 48px tall on a line-soft rule and the inset ground, and sticks to the top of the inset while the page scrolls.",
    "Each crumb with a menu is a switcher segment: clicking its text or its chevron opens the same Switcher, and only the chevron highlights.",
    "AppInset defines one page gutter from its own width. TopBar and PageGutter both pad by it, so the root crumb's text and the page content share a left edge at every width.",
    "Long crumb labels truncate and keep their full text in the switcher."
  ],
  accessibility: [
    "The trail is a named breadcrumb landmark. Each switcher's chevron is the only tab stop for its crumb and is named for its purpose and the current value.",
    "AppInset renders the main landmark."
  ],
  limitations: [
    "The reference's staged narrow-width rules (hiding the search label and ancestor labels) are not implemented; labels truncate instead.",
    "The gutter grows past 40px only when the inset is wider than the page measure plus the gutters."
  ],
  examples: [
    {
      id: "default",
      title: "App shell with switcher crumbs",
      module: "./examples/top-bar/default.tsx",
      states: ["default", "controlled", "overflow", "keyboard"]
    }
  ],
  coverage: [
    {
      axis: "shell",
      expected: ["beside sidebar", "standalone"],
      shown: [
        {
          value: "beside sidebar",
          exampleId: "default",
          label: "Beside the sidebar, crumb root on the content edge"
        },
        {
          value: "standalone",
          exampleId: "default",
          label: "Without a sidebar, long project name truncates"
        }
      ]
    },
    {
      axis: "size support",
      expected: ["no authored named size"],
      shown: [],
      omitted: [
        {
          value: "no authored named size",
          reason: "The bar has one 48px height; its width follows the inset."
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Use TopBar inside AppInset with the organization as the root crumb, then the project and environment, each a switcher, and three or four tools on the right."
    ],
    avoid: [
      "Pad the bar or the page by hand, add an organization avatar to the root crumb, or repeat the page-level trail here."
    ],
    decision:
      "Choose TopBar for the product-level location. Put the page-level trail (folders, an object's parents) in PageHeader.",
    rules: [
      {
        id: "top-bar-shared-gutter",
        when: "A page sits under the top bar.",
        do: "Render TopBar and the page content inside one AppInset and wrap the content in PageGutter.",
        avoid: "Give the page its own max-width and centering while the bar uses a fixed padding.",
        reason:
          "Two sources of width drift apart, so the root crumb stops lining up with the content edge at some widths.",
        evidence: [
          "src/components/v4/ui/top-bar.tsx",
          "src/components/v4/ui/top-bar.module.css",
          "src/pages/design-system/examples/top-bar/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Resize the example from narrow to very wide and compare the left edge of the root crumb's text with the page title."
        }
      },
      {
        id: "top-bar-switcher-segment",
        when: "A crumb switches the organization, project or environment.",
        do: "Give the crumb a menu, so the segment opens the Switcher from its text or its chevron and only the chevron highlights.",
        avoid:
          "Draw a hover ground or padding on the whole segment, or make the label a second focus stop.",
        reason:
          "A segment without padding keeps the root text on the content edge, and one focusable trigger keeps the keyboard path short.",
        evidence: [
          "src/components/v4/ui/top-bar.tsx",
          "src/pages/design-system/examples/top-bar/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Hover the crumb text and confirm only the chevron takes the hover ground; Tab reaches one stop per crumb."
        }
      }
    ],
    states: [
      {
        state: "open",
        guidance: "The open switcher's chevron keeps the press ground until the popover closes."
      },
      {
        state: "overflow",
        guidance: "Labels truncate with an ellipsis and keep the full text in the switcher."
      }
    ],
    antiSlop: [
      {
        do: "Keep the right side to search and two or three icon tools with tooltips.",
        avoid: "Fill the bar with account menus, theme toggles and promotional buttons.",
        reason: "The account and theme already live in the Sidebar account popover."
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
        "npm run ui:dev; open /design-system#top-bar and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
