import type { ComponentDefinition } from "./types";

export const topBarDefinition = {
  id: "top-bar",
  title: "Top bar",
  group: "Navigation",
  summary:
    "The 48px band across the top of the AppShell, outside the content card: the organization switcher, the product and project switchers and the page crumbs on the left, notifications, search and the account menu on the right.",
  sourceFiles: ["src/components/v4/ui/top-bar.tsx", "src/components/v4/ui/top-bar.module.css"],
  exports: ["TopBar", "AppShell", "AppInset", "PageGutter"],
  referenceNames: ["TopBar"],
  behavior: [
    "AppShell is a grid on the sidebar ground: the TopBar band (size-shell-bar, 48px) spans the full width on top, and below it the Sidebar sits beside the AppInset content card. TopBar, Sidebar and AppInset are direct children of AppShell, in that order. The card holds page content only and starts directly under the band, with space-shell-gap (8px) on its right and bottom (its top when there is no TopBar, its left when there is no Sidebar), a 1px line border and square corners. One line tint, line, draws the shell chrome: the card border, the sidebar separators and the corner rule. Content scrolls inside the card with crisp edges; the band and the sidebar never scroll away. The shell fills its parent and clips; at page level that parent is 100dvh, so the document never scrolls, and hash and palette navigation scroll only the card (scrollInsetTo).",
    "From the left the band holds the breadcrumb trail: the organization switcher, then the product and project switchers, then the page crumbs, separated by the vertical breadcrumb divider. Each switcher crumb is two targets: its name goes to that level's page (link, href or onNavigate) and its chevron opens the Switcher. A level without a page of its own, or the current one, makes its name open the same Switcher. The root crumb reads in ink at 600 with its media glyph. Above size-shell-collapse the band starts with the organization zone, laid out like the Sidebar below it: the band's start padding is space-8, the Sidebar's nav padding, and the switcher's ground, glyph and label sit on the same x as a nav row's (space-sidebar-row-inset before a size-sidebar-icon glyph, then space-10 to the label). While the Sidebar is open the zone is exactly size-sidebar wide, space-8 on each side of the trigger, so the divider that starts the first crumb sits on the card's left border. While the Sidebar is collapsed (the rail, by choice or between size-shell-collapse and size-shell-rail) the trigger has no minimum and hugs its content, up to the same maximum as the open zone, so it never grows past it; a longer name truncates with an ellipsis. The zone itself keeps the open width in every state, so the divider stays at size-sidebar, space-8 past the widest trigger, and the crumbs never shift between open and collapsed or as the organization name changes length.",
    "Every target in the band has one hover and press box: size-shell-target (32px) tall, centered in the 48px band, with space-control-inline-sm (10px) inline padding on text targets other than the organization switcher, which takes the Sidebar row's inset. That covers crumb names, switcher chevrons, the organization switcher, plain ancestor crumbs, and the search, notifications and account Buttons, which use size sm for that height. Crumbs set their text in the label role (14px), the same role as the band's Buttons. The current page crumb is plain text and draws no hover ground.",
    "On the right: notifications (a bell with the 6px size-unread square in accent-fg when unread), a search icon button whose tooltip reads Search with its Mod+K Kbd, a BandDivider (the same element the crumbs use, space-crumb-divider from the grounds on each side), and the account trigger (a user glyph, the person's name and a chevron, no avatar). The account menu lists the name and email, items (Personal settings, Invite users), the Theme radio group (System, Dark, Light), then endItems (Copy token, Log out). There is no create button in the band; the page's own accent create is the only one.",
    "Between size-shell-collapse (800px) and size-shell-rail (1280px) the Sidebar starts as the rail, and expanding it opens the full navigation as a left Sheet with a scrim over the band and the card. Below size-shell-collapse there is no rail: the band shows a menu button on the left (with the unread square when there are unread notifications or announcements), at most the last two crumbs as plain names centered between the buttons, and search on the right, both 40px. The menu button opens the nav Sheet, whose top repeats the organization switcher (beside its close button) and the product and project switchers, and whose foot holds a size-touch-row user row that opens the account bottom sheet, then an icon row with notifications and their count. The card drops its gaps and border and fills the shell. Shell width is measured on the AppShell itself, so an embedded shell picks its mode by its own width.",
    "AppInset defines one page gutter from its own width and size-content, the one page content width (1160px): the larger of 16px, 5% of the card capped at 40px, and half of what the card has beyond size-content. PageGutter pads by it, so the page header and the page body share one width and one left edge at every width.",
    "AppShell owns the Mod+B chord (Cmd+B on Mac, Ctrl+B elsewhere) for the Sidebar it holds: the rail on wide shells, the Sheet below size-shell-rail. The menu button exposes the chord through aria-keyshortcuts, and the search button exposes Mod+K.",
    "Long crumb labels truncate and keep their full text in the switcher."
  ],
  accessibility: [
    "The trail is a named breadcrumb landmark. Each switcher crumb takes two tab stops, the name and then the chevron, both with the ink focus outline; the chevron is named for its purpose and the current value.",
    "Icon buttons are named (Notifications, with the unread count when there is one; Search; Open navigation, with unread updates when marked) and carry tooltips. The account trigger is named Account and the person's name.",
    "The account and help bottom sheets below size-shell-collapse are dialogs with a title, 48px rows and the same items as the desktop menus.",
    "AppInset renders the main landmark."
  ],
  limitations: [
    "Between size-shell-collapse and size-shell-rail the band keeps every crumb and truncates labels; it does not swap the organization name for a glyph or drop leading crumbs.",
    "The gutter grows past 40px only when the card is wider than the page measure plus the gutters."
  ],
  examples: [
    {
      id: "default",
      title: "App shell with the band",
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
          label: "Beside the sidebar, organization switcher over the sidebar"
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
          reason: "The band has one 48px height; its width follows the shell."
        }
      ]
    }
  ],
  guidance: {
    use: [
      "Use TopBar as the first child of AppShell with the organization as the root crumb (building glyph and the organization menu), then the product and project switchers and the page crumbs, plus notifications, search and the account menu."
    ],
    avoid: [
      "Put TopBar inside AppInset, add a create button or an avatar to the band, or repeat the page-level trail here."
    ],
    decision:
      "Choose TopBar for the product-level location and the person's account. Put the page-level trail (folders, an object's parents) in PageHeader.",
    rules: [
      {
        id: "top-bar-band",
        when: "A page sits in the app shell.",
        do: "Render TopBar, Sidebar and AppInset as direct children of AppShell and wrap the content in PageGutter, so the band spans the shell and the card holds page content only.",
        avoid:
          "Nest the bar inside the card, or give the page its own max-width and centering while the gutter comes from the card.",
        reason:
          "The band is the context line and must not move with the card; two sources of width drift apart, so the page edge stops lining up at some widths.",
        evidence: [
          "src/components/v4/ui/top-bar.tsx",
          "src/components/v4/ui/top-bar.module.css",
          "src/pages/design-system/examples/top-bar/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Collapse and expand the sidebar and resize the example: the band does not move, and the divider after the organization switcher sits on the card's left edge at 1280px and wider."
        }
      },
      {
        id: "top-bar-switcher-segment",
        when: "A crumb switches the organization, product, project or environment.",
        do: "Give the crumb a switcher and its level's page (link, href or onNavigate), so the name navigates and the chevron opens the Switcher.",
        avoid:
          "Let the name open the Switcher when the level has a page, or draw one hover ground across the name and chevron when the name has its own page.",
        reason:
          "A crumb's name reads as a way back to that level, and separate grounds on the name and chevron show two targets.",
        evidence: [
          "src/components/v4/ui/top-bar.tsx",
          "src/pages/design-system/examples/top-bar/default.tsx"
        ],
        detect: {
          by: "review",
          how: "Click each crumb's name and confirm it navigates without opening the popover; Tab reaches the name and then the chevron. A name with a page and its chevron each take their own hover ground; a crumb whose name only opens the Switcher takes one ground across the whole segment."
        }
      }
    ],
    states: [
      {
        state: "open",
        guidance:
          "The open switcher's chevron, the whole segment of a switcher-only crumb, and the open account trigger keep the press ground until the popover closes."
      },
      {
        state: "overflow",
        guidance: "Labels truncate with an ellipsis and keep the full text in the switcher."
      },
      {
        state: "unread",
        guidance:
          "Unread notifications put the 6px accent-fg square on the bell; below size-shell-collapse the menu button carries it, and the nav Sheet shows the count."
      }
    ],
    antiSlop: [
      {
        do: "Size every band target from size-shell-target: Buttons at size sm, crumbs through the product Breadcrumb.",
        avoid:
          "Give the band's Buttons size md or a crumb a nested-sm ground, so hover boxes of 24, 32 and 36px sit side by side.",
        reason:
          "Grounds of different heights in one 48px row read as misaligned, whatever their padding."
      },
      {
        do: "Keep the right side to notifications, search and the account trigger.",
        avoid: "Add a New button, a theme toggle, help or promotional buttons to the band.",
        reason:
          "Theme lives in the account menu, help in the Sidebar corner, and the page's accent create is the one create action."
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
      command: "npm run dev; open /design-system#top-bar and exercise the documented interaction."
    }
  ]
} satisfies ComponentDefinition;
