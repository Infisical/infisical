# Sidebar

The app's navigation below the TopBar band and beside the content card: sections of rows (a back row first inside a scope), footer rows, and a bottom-left corner with the collapse toggle, help and announcements.

## Choose this component

Choose Sidebar for the persistent app navigation. Use TopBar for the product-level trail and Tabs for sections inside one page.

## Usage rules

### sidebar-scopes

Owner: sidebar.

When the person is inside a product, a project or the settings area.

Do: Pass that level as scope, with a back row named for the parent level, and keep the TopBar breadcrumb on the same level.

Avoid: Mix several products' rows in one long list, or leave the person without a way up except the breadcrumb.

Why: The current app swaps the nav per scope with a back row, and a sidebar that disagrees with the breadcrumb hides where the person is.

Checked by: review only. Look for: Open a scoped composition and confirm the back row names the breadcrumb's parent crumb and returns to it.

Source evidence:
- src/components/v4/ui/sidebar.tsx
- src/pages/design-system/examples/sidebar/scopes.tsx

### sidebar-routes

Owner: sidebar.

When the pages behind the sidebar are routes.

Do: Give each row a link built with linkOptions and pass the navigation as levels, so route matches pick the current row and the level that shows.

Avoid: Mirror the route in local state, pass current by hand beside links, or drill in with a hash.

Why: One source for where the person is keeps the sidebar, the breadcrumb and back and forward in step.

Checked by: review only. Look for: Open a routed page directly by URL and confirm its row is current and its level shows, then go back and forward.

Source evidence:
- src/components/v4/ui/sidebar.tsx
- src/pages/design-system/examples/sidebar/routes.tsx

### sidebar-corner

Owner: sidebar.

When the person needs help, the status page or what's new.

Do: Pass help for the corner menu and announcements only with an unread count, so the toggle stays in the left corner and the corner grows only when something is unread.

Avoid: Add Docs or What's new rows to the footer, put help in the TopBar, or show an announcements trigger with nothing unread.

Why: The corner is mechanical: one place for help, and the toggle never moves between expanded and rail.

Checked by: review only. Look for: Collapse and expand the example: the toggle keeps its position, help stacks above it in the rail, and the announcements trigger disappears once read.

Source evidence:
- src/components/v4/ui/sidebar.tsx
- src/pages/design-system/examples/sidebar/default.tsx

### sidebar-counts

Owner: sidebar.

When a row has items waiting on the person, such as approvals.

Do: Pass count for the waiting items only, so it shows as an accent Count and as a dot in the rail.

Avoid: Show totals such as the number of projects, or color the current row with the accent.

Why: The accent marks what needs the person; where they are stays neutral.

Checked by: review only. Look for: Every count in the example is something a person must act on, and the current row has no accent.

Source evidence:
- src/components/v4/ui/sidebar.tsx
- src/components/v4/ui/sidebar.module.css

## State guidance

- current: The current row takes the sidebar-current ground with ink text at 600; its group keeps its label in ink.
- rail: Only icons show. Each row keeps a tooltip and its accessible name, and counts become 6px dots.

## Presentation rules

Do: Keep labels to one or two words and put the page's full name in its PageHeader.

Avoid: Write long sidebar labels or add a second level of nested groups.

Why: Deeper structure belongs in the page as tabs or a tree.

## Import and exports

- src/components/v4/ui/sidebar.tsx
- src/components/v4/ui/sidebar.module.css

Exports: Sidebar. Source TypeScript defines the API.

## Behavior

- The nav starts at the top with no search; inside a scope the back row comes first. The bottom-left corner sits under a line-soft rule: the collapse toggle in its left corner (36px, on the 26px center line in both widths), a gap, then the help button at the right end. An announcements trigger with the 6px size-unread square sits just before help only while announcements has unread items, and is gone otherwise. In the size-sidebar-rail (52px) rail the corner becomes a column: announcements and help stack above the rule and the toggle stays at exactly the same x and y as when expanded. Inside an AppShell the toggle's tooltip shows its Mod+B chord as a Kbd.
- Help opens a menu from the corner: a status line (a status dot and its label, linking to the status page), What's new (the unread count, or the latest date), the help items (Support Forum, Read Docs, GitHub Issues, Email Support), then the version in mono. Below size-shell-collapse help opens a bottom sheet with the same rows at size-touch-row.
- Mod+B (Cmd+B on Mac, Ctrl+B elsewhere) toggles the sidebar inside an AppShell: it collapses or expands the rail at size-shell-rail and wider, and opens or closes the Sheet below it. The shell that holds focus, or that took the last pointer press, owns the chord, so a nested composition shell toggles only itself. Inputs, textareas, selects, contenteditable regions and code editors keep the chord.
- With spaces, a segmented switch under the tools shows one space's sections at a time. The space holding the current page shows by default, a page opened from elsewhere brings its space with it, and a hidden space that holds a count shows a dot.
- Sections stack 36px rows 1px apart. A labeled section draws its 28px eyebrow with a rule that runs to the sidebar's edge. The leading group of a scope is unlabeled: a single generic group at the top (General, or the scope's own name) adds nothing, so it renders without an eyebrow, and only later groups that name a real split (Administration) carry one.
- An item that opens a deeper scope instead of navigating in place (Settings into the settings scope, a product or Projects into theirs) sets drillIn and shows a trailing muted chevron-right after any count, which takes ink on hover and when current. The rail drops the chevron and its tooltip reads the name followed by "opens section". The back row covers the way out.
- A row with children opens one level of 32px pages, without icons, on a guide line under its icon. It opens by itself when it holds the current page, and while closed it shows the sum of its pages' counts.
- The nav scrolls when it runs out of room and fades the edge where more rows are cut off.
- Between size-shell-collapse and size-shell-rail the sidebar starts as the rail, and its toggle opens the expanded navigation as a left Sheet with a scrim; below size-shell-collapse there is no rail and the TopBar menu button opens the Sheet. The Sheet's top holds the TopBar's organization switcher beside a close button and its product and project switchers below; below size-shell-collapse its foot adds the TopBar's user row and an icon row with notifications before announcements and help. The TopBar fills those slots through the AppShell, so a Sidebar without a TopBar shows only the close button. Navigating closes the Sheet.
- Collapsing narrows the sidebar to a rail of icons over the slide timing. Labels move into tooltips, counts become dots, the space switch stacks its icons vertically, section labels become rules and a group opens its pages in a menu to the right.
- Pass scope to show a product, project or settings level instead of the top level: a back row (chevron-left and the parent's name, named Back to the parent) above that scope's sections. The back row calls onNavigate with scope.back, so the host moves up one level and passes the parent scope, or none for the top level. Spaces show only at the top level.
- A scope change slides the rows in over duration-moderate on ease-standard, from the right going deeper and from the left going back; with reduced motion it only fades. In the rail the back row is the first icon, with a Back to tooltip.
- A section with an icon and a label collapses in the rail to one row with that icon, which opens the section's items in a flyout, so long navigations stay short in the rail.
- Pass levels for routed, nested navigation: each level has an id, a label and its sections, and every level but the top names its parent. A row declares its route as link, built with linkOptions so to and params are typed against the route tree, and renders through CipherLink; the current row comes from the router's useLinkMatch. A row with level instead opens that level in place (the drill-in chevron comes with it) and a level with a parent gets a back row named for the parent that goes up one level, so a person can browse another level without leaving the page.
- With links, route matches pick the current row: a link matches its route and every route below it unless its activeOptions set exact, params must match, and when several rows match the most specific wins (an exact match, then the longest path). The level holding the current row shows, it follows every navigation (back and forward, deep links, reload), and drill-in rows on the way to it carry the holds-current ink. current is only the fallback when no route matches.

## Accessibility

- A drillIn row keeps its name and adds the description Opens section (aria-description), so assistive tech hears the drill-in before activating it.
- The rows sit in a nav landmark named for the space it shows. Up and Down move between rows and Home and End jump; Tab still reaches every row.
- The space switch is a tablist: Left and Right move between spaces, Up and Down in the rail. A hidden space with a count is announced as having updates.
- Backspace or Alt+Left anywhere in the nav (outside a text field) activates the back row and moves focus to the first row of the parent level.
- The current page carries aria-current. Rail rows keep their label as the accessible name.
- Focus draws the 2px ink outline inside the row, so the scrolling nav never clips it.
- The corner buttons are named (Collapse sidebar or Expand sidebar, Help, and What's new with its unread count) and carry tooltips; the toggle reports aria-expanded.

## Use cases

- Use Sidebar for the app's main navigation, with short noun labels, counts for things waiting on the person, help in the corner and announcements beside it when something is unread.

## Avoid

- Put an organization switcher, search or the account in the sidebar, or use counts for totals.

## Limits

- Without links the host owns routing: rows call onNavigate or follow href, and the host passes the current id back. Links need a CipherRouterProvider above the Sidebar, or they render plain anchors and no row is current from the route.
- Levels show one level at a time, so a row's children stay a single level of pages; deeper structure is another level.
- The person's account and the organization menu live in the TopBar, not here.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### width

- expanded: example `default`, visible label "Expanded, a child page current".
- rail: example `default`, visible label "Rail, counts as dots".

### scope

- top level: example `scopes`, visible label "Top level".
- scoped: example `scopes`, visible label "Project scope with a back row".

### navigation source

- local state: example `scopes`, visible label "Top level".
- routes: example `routes`, visible label "Routed levels, the current route's level open".

### size support


- no authored named size: omitted. The sidebar has one width (size-sidebar) and a rail (size-sidebar-rail). Nav rows and corner buttons follow the 36px control recipe.

## Executable examples

### Expanded and rail

Save this example at `src/pages/design-system/examples/sidebar/default.tsx`; its relative imports are generated for that exact path. States: default, controlled, keyboard.

Registry items used: @cipher/sidebar. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { Sidebar, type SidebarProps } from "../../../../components/v4/ui/sidebar";

const spaces: SidebarProps["spaces"] = [
  {
    id: "home",
    label: "Home",
    icon: "apps",
    sections: [
      {
        items: [
          { id: "home", label: "Home", icon: "home" },
          { id: "inbox", label: "Needs you", icon: "inbox", count: 4 }
        ]
      },
      {
        label: "Products",
        items: [
          {
            id: "secrets",
            label: "Secrets",
            icon: "key",
            children: [
              { id: "secrets-overview", label: "Overview" },
              { id: "secrets-integrations", label: "Integrations" },
              { id: "secrets-rotation", label: "Rotation" },
              { id: "secrets-approvals", label: "Approvals", count: 2 },
              { id: "secrets-scanning", label: "Secret scanning", count: 1 }
            ]
          },
          { id: "certificates", label: "Certificates", icon: "cert" },
          { id: "pam", label: "PAM", icon: "terminal" },
          { id: "kms", label: "KMS", icon: "lock" }
        ]
      }
    ]
  },
  {
    id: "org",
    label: "Organization",
    icon: "building",
    sections: [
      {
        items: [
          { id: "integrations", label: "Integrations", icon: "link" },
          {
            id: "access",
            label: "Access",
            icon: "user",
            children: [
              { id: "access-members", label: "Members" },
              { id: "access-identities", label: "Machine identities" },
              { id: "access-roles", label: "Roles" }
            ]
          },
          { id: "audit", label: "Audit logs", icon: "history" },
          { id: "billing", label: "Billing", icon: "file" },
          { id: "settings", label: "Settings", icon: "settings" }
        ]
      }
    ]
  }
];

const Shell = ({ start, defaultCollapsed }: { start: string; defaultCollapsed?: boolean }) => {
  const [current, setCurrent] = useState(start);
  const [unseen, setUnseen] = useState(2);
  return (
    <Sidebar
      spaces={spaces}
      current={current}
      onNavigate={(item) => setCurrent(item.id)}
      defaultCollapsed={defaultCollapsed}
      announcements={{ unread: unseen, onClick: () => setUnseen(0) }}
      help={{
        status: { label: "All systems operational", href: "#sidebar" },
        whatsNew: { unread: unseen, latest: "Oct 30", onSelect: () => setUnseen(0) },
        items: [
          { label: "Read Docs", href: "#sidebar", external: true },
          { label: "Email Support", href: "mailto:support@infisical.com" }
        ],
        version: "56a8340"
      }}
    />
  );
};

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <div className="relative isolate h-[600px] w-full min-w-0 [transform:translateZ(0)] overflow-auto">
            <Shell start="secrets-overview" />
          </div>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Expanded, a child page current"}
        </figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <div className="relative isolate h-[600px] w-full min-w-0 [transform:translateZ(0)] overflow-auto">
            <Shell start="secrets-approvals" defaultCollapsed />
          </div>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Rail, counts as dots"}</figcaption>
      </figure>
    </div>
  );
}
```

### Scoped navigation

Save this example at `src/pages/design-system/examples/sidebar/scopes.tsx`; its relative imports are generated for that exact path. States: default, controlled, keyboard.

Registry items used: @cipher/sidebar. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { Sidebar, type SidebarProps } from "../../../../components/v4/ui/sidebar";

const org: SidebarProps["sections"] = [
  {
    items: [
      { id: "home", label: "Home", icon: "home" },
      { id: "secret-management", label: "Secrets Management", icon: "key", drillIn: true },
      { id: "integrations", label: "Integrations", icon: "apps" }
    ]
  },
  {
    label: "Administration",
    items: [
      { id: "access", label: "Access control", icon: "user" },
      { id: "audit", label: "Audit logs", icon: "history" },
      { id: "settings", label: "Settings", icon: "settings" }
    ]
  }
];
const product: SidebarProps["sections"] = [
  {
    items: [
      { id: "projects", label: "Projects", icon: "folder", count: 2, drillIn: true },
      { id: "product-settings", label: "Product settings", icon: "settings" }
    ]
  }
];
const project: SidebarProps["sections"] = [
  {
    items: [
      { id: "secrets", label: "Secrets", icon: "key" },
      { id: "project-access", label: "Access control", icon: "user" },
      { id: "approvals", label: "Approvals", icon: "inbox", count: 4 }
    ]
  },
  {
    label: "Administration",
    items: [
      { id: "project-audit", label: "Audit logs", icon: "history" },
      { id: "project-settings", label: "Settings", icon: "settings" }
    ]
  }
];

type Level = "org" | "product" | "project";
const opens: Record<string, { level: Level; page: string }> = {
  "secret-management": { level: "product", page: "projects" },
  projects: { level: "project", page: "secrets" }
};
const up: Record<Level, { level: Level; page: string }> = {
  org: { level: "org", page: "home" },
  product: { level: "org", page: "secret-management" },
  project: { level: "product", page: "projects" }
};

const Scoped = ({ start, collapsed }: { start: Level; collapsed?: boolean }) => {
  const [at, setAt] = useState<{ level: Level; page: string }>(
    start === "org" ? up.org : { level: start, page: start === "product" ? "projects" : "secrets" }
  );
  const scope =
    at.level === "org"
      ? undefined
      : {
          id: at.level,
          back: {
            id: "back",
            label: at.level === "project" ? "Secrets Management" : "Acme Corp"
          },
          sections: at.level === "project" ? project : product
        };
  return (
    <Sidebar
      sections={org}
      scope={scope}
      current={at.page}
      defaultCollapsed={collapsed}
      onNavigate={(item) =>
        setAt(item.id === "back" ? up[at.level] : (opens[item.id] ?? { ...at, page: item.id }))
      }
    />
  );
};

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <div className="relative isolate h-[600px] w-full min-w-0 [transform:translateZ(0)] overflow-auto">
            <Scoped start="org" />
          </div>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Top level"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <div className="relative isolate h-[600px] w-full min-w-0 [transform:translateZ(0)] overflow-auto">
            <Scoped start="project" />
          </div>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Project scope with a back row"}
        </figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <div className="relative isolate h-[600px] w-full min-w-0 [transform:translateZ(0)] overflow-auto">
            <Scoped start="project" collapsed />
          </div>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Project scope in the rail"}
        </figcaption>
      </figure>
    </div>
  );
}
```

### Routed levels

Save this example at `src/pages/design-system/examples/sidebar/routes.tsx`; its relative imports are generated for that exact path. States: default, keyboard.

Registry items used: @cipher/sidebar. Additional packages: none. Install every listed item before compiling this example.

```tsx

import { Sidebar, type SidebarLevel } from "../../../../components/v4/ui/sidebar";

const page = (group: string, component: string, label: string) => ({
  id: component,
  label,
  link: { href: `/design-system/components/${group}/${component}` }
});

const levels: SidebarLevel[] = [
  {
    id: "root",
    label: "Design system",
    sections: [
      {
        items: [
          {
            id: "overview",
            label: "Overview",
            icon: "home",
            link: { href: "/design-system" }
          },
          { id: "open-navigation", label: "Navigation", icon: "menu", level: "navigation" },
          { id: "open-feedback", label: "Feedback", icon: "bell", level: "feedback" }
        ]
      }
    ]
  },
  {
    id: "navigation",
    label: "Navigation",
    parent: "root",
    sections: [
      {
        label: "Navigation",
        icon: "menu",
        items: [
          page("navigation", "breadcrumb", "Breadcrumb"),
          page("navigation", "sidebar", "Sidebar"),
          page("navigation", "tabs", "Tabs"),
          page("navigation", "top-bar", "Top bar")
        ]
      }
    ]
  },
  {
    id: "feedback",
    label: "Feedback",
    parent: "root",
    sections: [
      {
        label: "Feedback",
        icon: "bell",
        items: [
          page("feedback", "alert", "Alert"),
          page("feedback", "loader", "Loader"),
          page("feedback", "toast", "Toast")
        ]
      }
    ]
  }
];

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <div className="relative isolate h-[600px] w-full min-w-0 [transform:translateZ(0)] overflow-auto">
            <Sidebar label="Routed example" levels={levels} />
          </div>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Routed levels, the current route's level open"}
        </figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <div className="relative isolate h-[600px] w-full min-w-0 [transform:translateZ(0)] overflow-auto">
            <Sidebar label="Routed rail example" levels={levels} defaultCollapsed />
          </div>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Routed levels in the rail"}
        </figcaption>
      </figure>
    </div>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run dev; open /design-system/components/navigation/sidebar and exercise the documented interaction.
