# Top bar

The 48px band across the top of the AppShell, outside the content card: the organization switcher, the product and project switchers and the page crumbs on the left, notifications, search and the account menu on the right.

## Choose this component

Choose TopBar for the product-level location and the person's account. Put the page-level trail (folders, an object's parents) in PageHeader.

## Usage rules

### top-bar-band

Owner: top-bar.

When a page sits in the app shell.

Do: Render TopBar, Sidebar and AppInset as direct children of AppShell and wrap the content in PageGutter, so the band spans the shell and the card holds page content only.

Avoid: Nest the bar inside the card, or give the page its own max-width and centering while the gutter comes from the card.

Why: The band is the context line and must not move with the card; two sources of width drift apart, so the page edge stops lining up at some widths.

Checked by: review only. Look for: Collapse and expand the sidebar and resize the example: the band does not move, and the divider after the organization switcher sits on the card's left edge at 1280px and wider.

Source evidence:
- src/components/v4/ui/top-bar.tsx
- src/components/v4/ui/top-bar.module.css
- src/pages/design-system/examples/top-bar/default.tsx

### top-bar-switcher-segment

Owner: top-bar.

When a crumb switches the organization, product, project or environment.

Do: Give the crumb a switcher and its level's page (link, href or onNavigate), so the name navigates and the chevron opens the Switcher.

Avoid: Let the name open the Switcher when the level has a page, or draw one hover ground across the name and chevron when the name has its own page.

Why: A crumb's name reads as a way back to that level, and separate grounds on the name and chevron show two targets.

Checked by: review only. Look for: Click each crumb's name and confirm it navigates without opening the popover; Tab reaches the name and then the chevron. A name with a page and its chevron each take their own hover ground; a switcher-only crumb is one button, so any point of it, glyph and gaps included, takes one ground across the whole segment and opens the Switcher.

Source evidence:
- src/components/v4/ui/top-bar.tsx
- src/pages/design-system/examples/top-bar/default.tsx

## State guidance

- open: The open switcher's chevron, the whole segment of a switcher-only crumb, and the open account trigger keep the press ground until the popover closes.
- overflow: Labels truncate with an ellipsis and keep the full text in the switcher.
- unread: Unread notifications put the 6px accent-fg square on the bell; below size-shell-collapse the menu button carries it, and the nav Sheet shows the count.

## Presentation rules

Do: Size every band target from size-shell-target: Buttons at size sm, crumbs through the product Breadcrumb.

Avoid: Give the band's Buttons size md or a crumb a nested-sm ground, so hover boxes of 24, 32 and 36px sit side by side.

Why: Grounds of different heights in one 48px row read as misaligned, whatever their padding.

Do: Keep the right side to notifications, search and the account trigger.

Avoid: Add a New button, a theme toggle, help or promotional buttons to the band.

Why: Theme lives in the account menu, help in the Sidebar corner, and the page's accent create is the one create action.

## Import and exports

- src/components/v4/ui/top-bar.tsx
- src/components/v4/ui/top-bar.module.css

Exports: TopBar, AppShell, AppInset, PageGutter. Source TypeScript defines the API.

## Behavior

- AppShell is a grid on the sidebar ground: the TopBar band (size-shell-bar, 48px) spans the full width on top, and below it the Sidebar sits beside the AppInset content card. TopBar, Sidebar and AppInset are direct children of AppShell, in that order. The card holds page content only and starts directly under the band, with space-shell-gap (8px) on its right and bottom (its top when there is no TopBar, its left when there is no Sidebar), a 1px line-soft border and square corners. One line tint, line-soft, draws the shell chrome: the card border, the band rule, the sidebar separators and the corner rule; only the band's divider marks use line. Content scrolls inside the card with crisp edges; the band and the sidebar never scroll away. The shell fills its parent and clips; at page level that parent is 100dvh, so the document never scrolls, and hash and palette navigation scroll only the card (scrollInsetTo).
- From the left the band holds the breadcrumb trail: the organization switcher, then the product and project switchers, then the page crumbs, separated by the vertical breadcrumb divider. Each switcher crumb is two targets: its name goes to that level's page (link, href or onNavigate) and its chevron opens the Switcher, with no dead pixels between them. A level without a page of its own, or the current one, makes the whole segment one button that opens the Switcher, so its glyph, gaps and padding open it too. The root crumb reads in ink at 600 with its media glyph. Above size-shell-collapse the band starts with the organization zone, laid out like the Sidebar below it: the band's start padding is space-8, the Sidebar's nav padding, and the switcher's ground, glyph and label sit on the same x as a nav row's (space-sidebar-row-inset before a size-sidebar-icon glyph, then space-10 to the label). While the Sidebar is open the zone is exactly size-sidebar wide, space-8 on each side of the trigger, so the divider that starts the first crumb sits on the card's left border. While the Sidebar is collapsed (the rail, by choice or between size-shell-collapse and size-shell-rail) the trigger has no minimum and hugs its content, up to the same maximum as the open zone, so it never grows past it; a longer name truncates with an ellipsis. The BandDivider follows the trigger in the layout flow, space-crumb-divider past its ground, so a short name leaves no empty run before the first crumb. When the Sidebar opens or collapses, the trigger's width eases between the zone width and its content width over the Sidebar's own duration-slow and ease-standard, so the divider and the crumbs travel with the Sidebar instead of jumping; reduced motion makes the change instant.
- Every target in the band has one hover and press box: size-shell-target (32px) tall, centered in the 48px band, with space-control-inline-sm (10px) inline padding on text targets other than the organization switcher, which takes the Sidebar row's inset. That covers crumb names, switcher chevrons, the organization switcher, plain ancestor crumbs, and the search, notifications and account Buttons, which use size sm for that height. Crumbs set their text in the label role (14px), the same role as the band's Buttons. The current page crumb is plain text and draws no hover ground.
- On the right: notifications (a bell with the 6px size-unread square in accent-fg when unread), a search icon button whose tooltip reads Search with its Mod+K Kbd, a BandDivider (the same element the crumbs use, space-crumb-divider from the grounds on each side), and the account trigger (a user glyph, the person's name and a chevron, no avatar). The account menu lists the name and email, items (Personal settings, Invite users), the Theme radio group (System, then every theme in tokens.json themes: Lightly Peach, Light, Dark), then endItems (Copy token, Log out). There is no create button in the band; the page's own accent create is the only one.
- Between size-shell-collapse (800px) and size-shell-rail (1280px) the Sidebar starts as the rail, and expanding it opens the full navigation as a left Sheet with a scrim over the band and the card. Below size-shell-collapse there is no rail: the band shows a menu button on the left (with the unread square when there are unread notifications or announcements), at most the last two crumbs as plain names centered between the buttons, and search on the right, both 40px. The menu button opens the nav Sheet, whose top repeats the organization switcher (beside its close button) and the product and project switchers, and whose foot holds a size-touch-row user row that opens the account bottom sheet, then an icon row with notifications and their count. The card drops its gaps and border and fills the shell. Shell width is measured on the AppShell itself, so an embedded shell picks its mode by its own width.
- AppInset defines one page gutter from its own width and size-content, the one page content width (1160px): the larger of 16px, 5% of the card capped at 40px, and half of what the card has beyond size-content. PageGutter pads by it, so the page header and the page body share one width and one left edge at every width.
- AppShell owns the Mod+B chord (Cmd+B on Mac, Ctrl+B elsewhere) for the Sidebar it holds: the rail on wide shells, the Sheet below size-shell-rail. The menu button exposes the chord through aria-keyshortcuts, and the search button exposes Mod+K.
- Long crumb labels truncate and keep their full text in the switcher.

## Accessibility

- The trail is a named breadcrumb landmark. Each switcher crumb with a page takes two tab stops, the name and then the chevron, both with the ink focus outline; the chevron is named for its purpose and the current value. A switcher-only crumb is one tab stop with the same name.
- Icon buttons are named (Notifications, with the unread count when there is one; Search; Open navigation, with unread updates when marked) and carry tooltips. The account trigger is named Account and the person's name.
- The account and help bottom sheets below size-shell-collapse are dialogs with a title, 48px rows and the same items as the desktop menus.
- AppInset renders the main landmark.

## Use cases

- Use TopBar as the first child of AppShell with the organization as the root crumb (building glyph and the organization menu), then the product and project switchers and the page crumbs, plus notifications, search and the account menu.

## Avoid

- Put TopBar inside AppInset, add a create button or an avatar to the band, or repeat the page-level trail here.

## Limits

- Crumbs and Switcher options built from a project, organization, environment or folder name stay in the sans: those are names people chose, not machine values (rule/mono-machine-values).
- Between size-shell-collapse and size-shell-rail the band keeps every crumb and truncates labels; it does not swap the organization name for a glyph or drop leading crumbs.
- The gutter grows past 40px only when the card is wider than the page measure plus the gutters.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### shell

- beside sidebar: example `default`, visible label "Beside the sidebar, organization switcher over the sidebar".
- standalone: example `default`, visible label "Without a sidebar, long project name truncates".

### size support


- no authored named size: omitted. The band has one 48px height; its width follows the shell.

## Executable examples

### App shell with the band

Save this example at `src/pages/design-system/examples/top-bar/default.tsx`; its relative imports are generated for that exact path. States: default, controlled, overflow, keyboard.

Registry items used: @cipher/badge, @cipher/button, @cipher/icon, @cipher/page-header, @cipher/sidebar, @cipher/top-bar. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { Badge } from "../../../../components/v4/ui/badge";
import { Button } from "../../../../components/v4/ui/button";
import { Icon } from "../../../../components/v4/ui/icon";
import { PageHeader } from "../../../../components/v4/ui/page-header";
import { Sidebar } from "../../../../components/v4/ui/sidebar";
import {
  AppInset,
  AppShell,
  PageGutter,
  type ShellTheme,
  TopBar
} from "../../../../components/v4/ui/top-bar";

const organizations = [
  { value: "acme", label: "Acme Corp", group: "Current organization" },
  { value: "acme-eu", label: "acme-eu", group: "Sub-organizations" },
  { value: "globex", label: "Globex", group: "Other organizations" }
];
const projects = [
  { value: "payments", label: "payments-api" },
  { value: "platform", label: "platform-core-services-and-shared-infrastructure" },
  { value: "web", label: "web-dashboard" }
];
const environments = [
  { value: "dev", label: "Development" },
  { value: "staging", label: "Staging" },
  { value: "prod", label: "Production" }
];
const labelOf = (options: { value: string; label: string }[], value: string) =>
  options.find((option) => option.value === value)?.label ?? value;

const Bar = ({ defaultProject = "payments" }: { defaultProject?: string }) => {
  const [org, setOrg] = useState("acme");
  const [project, setProject] = useState(defaultProject);
  const [environment, setEnvironment] = useState("prod");
  const [theme, setTheme] = useState<ShellTheme>("system");
  return (
    <TopBar
      breadcrumb={[
        {
          label: labelOf(organizations, org),
          href: "#top-bar",
          media: <Icon name="building" />,
          switcher: {
            label: "Switch organization",
            searchable: true,
            placeholder: "Search organizations",
            options: organizations,
            value: org,
            onChange: setOrg,
            actions: [{ label: "Organization settings", icon: "settings" }]
          }
        },
        {
          label: labelOf(projects, project),
          href: "#top-bar",
          switcher: {
            label: "Switch project",
            options: projects,
            value: project,
            onChange: setProject
          }
        },
        {
          label: labelOf(environments, environment),
          switcher: {
            label: "Switch environment",
            options: environments,
            value: environment,
            onChange: setEnvironment
          }
        }
      ]}
      notifications={{ unread: 2 }}
      search={{ onClick: () => {} }}
      account={{
        name: "Sarah Lin",
        email: "sarah@acme.dev",
        items: [
          { label: "Personal settings", icon: "user" },
          { label: "Invite users", icon: "user-plus" }
        ],
        theme: { value: theme, onChange: setTheme },
        endItems: [
          { label: "Copy token", icon: "copy" },
          { type: "separator" },
          { label: "Log out" }
        ]
      }}
    />
  );
};

export default function Example() {
  const [current, setCurrent] = useState("secrets");
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <div className="relative isolate h-[600px] w-full min-w-0 [transform:translateZ(0)] overflow-auto">
            <AppShell>
              <Bar />
              <Sidebar
                sections={[
                  {
                    items: [
                      { id: "home", label: "Home", icon: "home" },
                      { id: "secrets", label: "Secrets", icon: "key" },
                      { id: "approvals", label: "Approvals", icon: "inbox", count: 3 }
                    ]
                  }
                ]}
                current={current}
                onNavigate={(item) => setCurrent(item.id)}
              />
              <AppInset>
                <PageGutter>
                  <PageHeader
                    title="Secrets"
                    badges={<Badge tone="warn">Production</Badge>}
                    description="3 secrets are missing in production."
                    actions={<Button variant="accent">Add secret</Button>}
                  />
                </PageGutter>
              </AppInset>
            </AppShell>
          </div>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Beside the sidebar, organization switcher over the sidebar"}
        </figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <div className="relative isolate h-40 w-full min-w-0 [transform:translateZ(0)] overflow-auto">
            <AppShell>
              <Bar defaultProject="platform" />
              <AppInset />
            </AppShell>
          </div>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Without a sidebar, long project name truncates"}
        </figcaption>
      </figure>
    </div>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run dev; open /design-system#top-bar and exercise the documented interaction.
