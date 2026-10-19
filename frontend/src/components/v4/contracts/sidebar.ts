import type { ComponentDefinition } from "./types";

export const sidebarDefinition = {
  id: "sidebar",
  title: "Sidebar",
  group: "Navigation",
  summary:
    "The app's navigation beside the inset: tools, sections of rows, footer rows and one account button for the person and their organization.",
  sourceFiles: ["src/components/v4/ui/sidebar.tsx", "src/components/v4/ui/sidebar.module.css"],
  exports: ["Sidebar"],
  referenceNames: ["Sidebar", "AppTile"],
  behavior: [
    "The tools row holds the collapse toggle, then search and invite icon buttons with tooltips.",
    "Sections stack rows 1px apart. A labeled section draws its eyebrow with a rule that runs to the sidebar's edge.",
    "A row with children opens one level of pages on a guide line. It opens by itself when it holds the current page, and while closed it shows the sum of its pages' counts.",
    "Collapsing narrows the sidebar to a rail of icons over the slide timing. Labels move into tooltips, counts become dots, section labels become rules and a group opens its pages in a menu to the right.",
    "The account button opens one Switcher: organizations with their plan, organization actions, the person's items, a theme row and the person's own row for their settings."
  ],
  accessibility: [
    "The rows sit in a named nav landmark. Up and Down move between rows and Home and End jump; Tab still reaches every row.",
    "The current page carries aria-current. Rail rows keep their label as the accessible name.",
    "Focus draws the 2px ink outline inside the row, so the scrolling nav never clips it.",
    "The account button is named for the person and the organization, and the popover returns focus to it on close."
  ],
  limitations: [
    "The reference's two-space switch (Home and Organization) is not implemented; pass the sections for the space you show.",
    "The host owns routing: rows call onNavigate or follow href, and the host passes the current id back.",
    "Organizations never show an avatar or icon. The account button shows the person's avatar."
  ],
  examples: [
    {
      id: "default",
      title: "Expanded and rail",
      module: "./examples/sidebar/default.tsx",
      states: ["default", "controlled", "keyboard"]
    }
  ],
  coverage: [
    {
      axis: "width",
      expected: ["expanded", "rail"],
      shown: [
        { value: "expanded", exampleId: "default", label: "Expanded, a child page current" },
        { value: "rail", exampleId: "default", label: "Rail, counts as dots" }
      ]
    },
    {
      axis: "size support",
      expected: ["no authored named size"],
      shown: [],
      omitted: [
        {
          value: "no authored named size",
          reason:
            "The sidebar has one width and a rail. Row heights follow the 36px control recipe."
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Use Sidebar for the app's main navigation, with short noun labels, counts for things waiting on the person and the account at the bottom."
    ],
    avoid: [
      "Put a separate organization switcher in the nav, show an organization avatar, or use counts for totals."
    ],
    decision:
      "Choose Sidebar for the persistent app navigation. Use TopBar for the product-level trail and Tabs for sections inside one page.",
    rules: [
      {
        id: "sidebar-account-identity",
        when: "The account button shows who is signed in and which organization they are in.",
        do: "Show the person's avatar with their name over the organization's name, and list organizations by name and plan.",
        avoid:
          "Render an organization avatar, initials tile or icon in the button, the switcher rows or the crumb.",
        reason:
          "Organizations have no avatar in the product, so a generated tile would be a mark nobody chose.",
        evidence: [
          "src/components/v4/ui/sidebar.tsx",
          "src/pages/design-system/examples/sidebar/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Open the account popover and confirm no organization row or the button renders an avatar for the organization."
        }
      },
      {
        id: "sidebar-counts",
        when: "A row has items waiting on the person, such as approvals.",
        do: "Pass count for the waiting items only, so it shows as an accent Count and as a dot in the rail.",
        avoid:
          "Show totals such as the number of projects, or color the current row with the accent.",
        reason: "The accent marks what needs the person; where they are stays neutral.",
        evidence: ["src/components/v4/ui/sidebar.tsx", "src/components/v4/ui/sidebar.module.css"],
        detect: {
          by: "review",
          how: "Every count in the example is something a person must act on, and the current row has no accent."
        }
      }
    ],
    states: [
      {
        state: "current",
        guidance:
          "The current row takes the sidebar-current ground with ink text at 600; its group keeps its label in ink."
      },
      {
        state: "rail",
        guidance:
          "Only icons show. Each row keeps a tooltip and its accessible name, and counts become 6px dots."
      }
    ],
    antiSlop: [
      {
        do: "Keep labels to one or two words and put the page's full name in its PageHeader.",
        avoid: "Write long sidebar labels or add a second level of nested groups.",
        reason: "Deeper structure belongs in the page as tabs or a tree."
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
        "npm run ui:dev; open /design-system#sidebar and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
