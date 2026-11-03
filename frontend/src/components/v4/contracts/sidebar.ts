import type { ComponentDefinition } from "./types";

export const sidebarDefinition = {
  id: "sidebar",
  title: "Sidebar",
  group: "Navigation",
  summary:
    "The app's navigation below the TopBar band and beside the content card: sections of rows (a back row first inside a scope), footer rows, and a bottom-left corner with the collapse toggle, help and announcements.",
  sourceFiles: ["src/components/v4/ui/sidebar.tsx", "src/components/v4/ui/sidebar.module.css"],
  exports: ["Sidebar"],
  referenceNames: ["Sidebar", "AppTile"],
  behavior: [
    "The nav starts at the top with no search; inside a scope the back row comes first. The bottom-left corner sits under a line rule: the collapse toggle in its left corner (36px, on the 26px center line in both widths), a gap, then the help button at the right end. An announcements trigger with the 6px size-unread square sits just before help only while announcements has unread items, and is gone otherwise. In the size-sidebar-rail (52px) rail the corner becomes a column: announcements and help stack above the rule and the toggle stays at exactly the same x and y as when expanded. Inside an AppShell the toggle's tooltip shows its Mod+B chord as a Kbd.",
    "Help opens a menu from the corner: a status line (a status dot and its label, linking to the status page), What's new (the unread count, or the latest date), the help items (Support Forum, Read Docs, GitHub Issues, Email Support), then the version in mono. Below size-shell-collapse help opens a bottom sheet with the same rows at size-touch-row.",
    "Mod+B (Cmd+B on Mac, Ctrl+B elsewhere) toggles the sidebar inside an AppShell: it collapses or expands the rail at size-shell-rail and wider, and opens or closes the Sheet below it. The shell that holds focus, or that took the last pointer press, owns the chord, so a nested composition shell toggles only itself. Inputs, textareas, selects, contenteditable regions and code editors keep the chord.",
    "With spaces, a segmented switch under the tools shows one space's sections at a time. The space holding the current page shows by default, a page opened from elsewhere brings its space with it, and a hidden space that holds a count shows a dot.",
    "Sections stack 36px rows 1px apart. A labeled section draws its 28px eyebrow with a rule that runs to the sidebar's edge. The leading group of a scope is unlabeled: a single generic group at the top (General, or the scope's own name) adds nothing, so it renders without an eyebrow, and only later groups that name a real split (Administration) carry one.",
    'An item that opens a deeper scope instead of navigating in place (Settings into the settings scope, a product or Projects into theirs) sets drillIn and shows a trailing muted chevron-right after any count, which takes ink on hover and when current. The rail drops the chevron and its tooltip reads the name followed by "opens section". The back row covers the way out.',
    "A row with children opens one level of 32px pages, without icons, on a guide line under its icon. It opens by itself when it holds the current page, and while closed it shows the sum of its pages' counts.",
    "The nav scrolls when it runs out of room and fades the edge where more rows are cut off.",
    "Between size-shell-collapse and size-shell-rail the sidebar starts as the rail, and its toggle opens the expanded navigation as a left Sheet with a scrim; below size-shell-collapse there is no rail and the TopBar menu button opens the Sheet. The Sheet's top holds the TopBar's organization switcher beside a close button and its product and project switchers below; below size-shell-collapse its foot adds the TopBar's user row and an icon row with notifications before announcements and help. The TopBar fills those slots through the AppShell, so a Sidebar without a TopBar shows only the close button. Navigating closes the Sheet.",
    "Collapsing narrows the sidebar to a rail of icons over the slide timing. Labels move into tooltips, counts become dots, the space switch stacks its icons vertically, section labels become rules and a group opens its pages in a menu to the right.",
    "Pass scope to show a product, project or settings level instead of the top level: a back row (chevron-left and the parent's name, named Back to the parent) above that scope's sections. The back row calls onNavigate with scope.back, so the host moves up one level and passes the parent scope, or none for the top level. Spaces show only at the top level.",
    "A scope change slides the rows in over duration-moderate on ease-standard, from the right going deeper and from the left going back; with reduced motion it only fades. In the rail the back row is the first icon, with a Back to tooltip.",
    "A section with an icon and a label collapses in the rail to one row with that icon, which opens the section's items in a flyout, so long navigations stay short in the rail."
  ],
  accessibility: [
    "A drillIn row keeps its name and adds the description Opens section (aria-description), so assistive tech hears the drill-in before activating it.",
    "The rows sit in a nav landmark named for the space it shows. Up and Down move between rows and Home and End jump; Tab still reaches every row.",
    "The space switch is a tablist: Left and Right move between spaces, Up and Down in the rail. A hidden space with a count is announced as having updates.",
    "Backspace or Alt+Left anywhere in the nav (outside a text field) activates the back row and moves focus to the first row of the parent level.",
    "The current page carries aria-current. Rail rows keep their label as the accessible name.",
    "Focus draws the 2px ink outline inside the row, so the scrolling nav never clips it.",
    "The corner buttons are named (Collapse sidebar or Expand sidebar, Help, and What's new with its unread count) and carry tooltips; the toggle reports aria-expanded."
  ],
  limitations: [
    "The host owns routing: rows call onNavigate or follow href, and the host passes the current id back.",
    "The person's account and the organization menu live in the TopBar, not here."
  ],
  examples: [
    {
      id: "default",
      title: "Expanded and rail",
      module: "./examples/sidebar/default.tsx",
      states: ["default", "controlled", "keyboard"]
    },
    {
      id: "scopes",
      title: "Scoped navigation",
      module: "./examples/sidebar/scopes.tsx",
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
      axis: "scope",
      expected: ["top level", "scoped"],
      shown: [
        { value: "top level", exampleId: "scopes", label: "Top level" },
        { value: "scoped", exampleId: "scopes", label: "Project scope with a back row" }
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
            "The sidebar has one width (size-sidebar) and a rail (size-sidebar-rail). Nav rows and corner buttons follow the 36px control recipe."
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Use Sidebar for the app's main navigation, with short noun labels, counts for things waiting on the person, help in the corner and announcements beside it when something is unread."
    ],
    avoid: [
      "Put an organization switcher, search or the account in the sidebar, or use counts for totals."
    ],
    decision:
      "Choose Sidebar for the persistent app navigation. Use TopBar for the product-level trail and Tabs for sections inside one page.",
    rules: [
      {
        id: "sidebar-scopes",
        when: "The person is inside a product, a project or the settings area.",
        do: "Pass that level as scope, with a back row named for the parent level, and keep the TopBar breadcrumb on the same level.",
        avoid:
          "Mix several products' rows in one long list, or leave the person without a way up except the breadcrumb.",
        reason:
          "The current app swaps the nav per scope with a back row, and a sidebar that disagrees with the breadcrumb hides where the person is.",
        evidence: [
          "src/components/v4/ui/sidebar.tsx",
          "src/pages/design-system/examples/sidebar/scopes.tsx"
        ],
        detect: {
          by: "review",
          how: "Open a scoped composition and confirm the back row names the breadcrumb's parent crumb and returns to it."
        }
      },
      {
        id: "sidebar-corner",
        when: "The person needs help, the status page or what's new.",
        do: "Pass help for the corner menu and announcements only with an unread count, so the toggle stays in the left corner and the corner grows only when something is unread.",
        avoid:
          "Add Docs or What's new rows to the footer, put help in the TopBar, or show an announcements trigger with nothing unread.",
        reason:
          "The corner is mechanical: one place for help, and the toggle never moves between expanded and rail.",
        evidence: [
          "src/components/v4/ui/sidebar.tsx",
          "src/pages/design-system/examples/sidebar/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Collapse and expand the example: the toggle keeps its position, help stacks above it in the rail, and the announcements trigger disappears once read."
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
      command: "npm run dev; open /design-system#sidebar and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
