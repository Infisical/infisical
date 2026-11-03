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

Avoid: Let the name open the Switcher when the level has a page, or draw a hover ground or padding on the whole segment.

Why: A crumb's name reads as a way back to that level, and an unpadded segment keeps the root text on its edge.

Checked by: review only. Look for: Click each crumb's name and confirm it navigates without opening the popover; Tab reaches the name and then the chevron, and only the chevron takes a hover ground.

Source evidence:
- src/components/v4/ui/top-bar.tsx
- src/pages/design-system/examples/top-bar/default.tsx

## State guidance

- open: The open switcher's chevron and the open account trigger keep the press ground until the popover closes.
- overflow: Labels truncate with an ellipsis and keep the full text in the switcher.
- unread: Unread notifications put the 6px accent-fg square on the bell; below size-shell-collapse the menu button carries it, and the nav Sheet shows the count.

## Presentation rules

Do: Keep the right side to notifications, search and the account trigger.

Avoid: Add a New button, a theme toggle, help or promotional buttons to the band.

Why: Theme lives in the account menu, help in the Sidebar corner, and the page's accent create is the one create action.

## Import and exports

- src/components/v4/ui/top-bar.tsx
- src/components/v4/ui/top-bar.module.css

Exports: TopBar, AppShell, AppInset, PageGutter. Source TypeScript defines the API.

## Behavior

- AppShell is a grid on the sidebar ground: the TopBar band (size-shell-bar, 48px) spans the full width on top, and below it the Sidebar sits beside the AppInset content card. TopBar, Sidebar and AppInset are direct children of AppShell, in that order. The card holds page content only and starts directly under the band, with space-shell-gap (8px) on its right and bottom (its top when there is no TopBar, its left when there is no Sidebar), a 1px line border and square corners. One line tint, line, draws the shell chrome: the card border, the sidebar separators and the corner rule. Content scrolls inside the card with crisp edges; the band and the sidebar never scroll away. The shell fills its parent and clips; at page level that parent is 100dvh, so the document never scrolls, and hash and palette navigation scroll only the card (scrollInsetTo).
- From the left the band holds the breadcrumb trail: the organization switcher, then the product and project switchers, then the page crumbs, separated by the vertical breadcrumb divider. Each switcher crumb is two targets: its name goes to that level's page (link, href or onNavigate) and its chevron opens the Switcher. A level without a page of its own, or the current one, makes its name open the same Switcher. The root crumb reads in ink at 600 with its media glyph. At size-shell-rail (1280px) and wider, the organization switcher fills size-sidebar less the band's start padding, so the divider after it lines up with the card's left edge; collapsing the sidebar to the rail does not change the band.
- On the right: notifications (a bell with the 6px size-unread square in accent-fg when unread), a search icon button whose tooltip reads Search with its Mod+K Kbd, a divider, and the account trigger (a user glyph, the person's name and a chevron, no avatar). The account menu lists the name and email, items (Personal settings, Invite users), the Theme radio group (System, Dark, Light), then endItems (Copy token, Log out). There is no create button in the band; the page's own accent create is the only one.
- Between size-shell-collapse (800px) and size-shell-rail (1280px) the Sidebar starts as the rail, and expanding it opens the full navigation as a left Sheet with a scrim over the band and the card. Below size-shell-collapse there is no rail: the band shows a menu button on the left (with the unread square when there are unread notifications or announcements), at most the last two crumbs as plain names centered between the buttons, and search on the right, both 40px. The menu button opens the nav Sheet, whose top repeats the organization switcher (beside its close button) and the product and project switchers, and whose foot holds a size-touch-row user row that opens the account bottom sheet, then an icon row with notifications and their count. The card drops its gaps and border and fills the shell. Shell width is measured on the AppShell itself, so an embedded shell picks its mode by its own width.
- AppInset defines one page gutter from its own width and size-content, the one page content width (1160px): the larger of 16px, 5% of the card capped at 40px, and half of what the card has beyond size-content. PageGutter pads by it, so the page header and the page body share one width and one left edge at every width.
- AppShell owns the Mod+B chord (Cmd+B on Mac, Ctrl+B elsewhere) for the Sidebar it holds: the rail on wide shells, the Sheet below size-shell-rail. The menu button exposes the chord through aria-keyshortcuts, and the search button exposes Mod+K.
- Long crumb labels truncate and keep their full text in the switcher.

## Accessibility

- The trail is a named breadcrumb landmark. Each switcher crumb takes two tab stops, the name and then the chevron, both with the ink focus outline; the chevron is named for its purpose and the current value.
- Icon buttons are named (Notifications, with the unread count when there is one; Search; Open navigation, with unread updates when marked) and carry tooltips. The account trigger is named Account and the person's name.
- The account and help bottom sheets below size-shell-collapse are dialogs with a title, 48px rows and the same items as the desktop menus.
- AppInset renders the main landmark.

## Use cases

- Use TopBar as the first child of AppShell with the organization as the root crumb (building glyph and the organization menu), then the product and project switchers and the page crumbs, plus notifications, search and the account menu.

## Avoid

- Put TopBar inside AppInset, add a create button or an avatar to the band, or repeat the page-level trail here.

## Limits

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

Registry items used: @infisical/badge, @infisical/button, @infisical/icon, @infisical/page-header, @infisical/sidebar, @infisical/top-bar. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Badge } from "../../../../components/v4/ui/badge";
import { Button } from "../../../../components/v4/ui/button";
import { Icon } from "../../../../components/v4/ui/icon";
import { PageHeader } from "../../../../components/v4/ui/page-header";
import { Sidebar } from "../../../../components/v4/ui/sidebar";
import { AppInset, AppShell, PageGutter, type ShellTheme, TopBar } from "../../../../components/v4/ui/top-bar";
const organizations = [
    { value: "acme", label: "Acme Corp", group: "Current organization" },
    { value: "acme-eu", label: "acme-eu", group: "Sub-organizations" },
    { value: "globex", label: "Globex", group: "Other organizations" }
];
const projects = [
    { value: "payments", label: "payments-api", mono: true },
    { value: "platform", label: "platform-core-services-and-shared-infrastructure", mono: true },
    { value: "web", label: "web-dashboard", mono: true }
];
const environments = [
    { value: "dev", label: "Development" },
    { value: "staging", label: "Staging" },
    { value: "prod", label: "Production" }
];
const labelOf = (options: {
    value: string;
    label: string;
}[], value: string) => options.find((option) => option.value === value)?.label ?? value;
const Bar = ({ defaultProject = "payments" }: {
    defaultProject?: string;
}) => {
    const [org, setOrg] = useState("acme");
    const [project, setProject] = useState(defaultProject);
    const [environment, setEnvironment] = useState("prod");
    const [theme, setTheme] = useState<ShellTheme>("system");
    return (<TopBar breadcrumb={[
            {
                label: labelOf(organizations, org),
                href: "#top-bar",
                media: <Icon name="building"/>,
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
                mono: true,
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
        ]} notifications={{ unread: 2 }} search={{ onClick: () => { } }} account={{
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
        }}/>);
};
export default function Example() {
    const [current, setCurrent] = useState("secrets");
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <div className="relative min-w-0 w-full overflow-auto h-[600px] isolate [transform:translateZ(0)]">
          <AppShell>
            <Bar />
            <Sidebar sections={[
            {
                items: [
                    { id: "home", label: "Home", icon: "home" },
                    { id: "secrets", label: "Secrets", icon: "key" },
                    { id: "approvals", label: "Approvals", icon: "inbox", count: 3 }
                ]
            }
        ]} current={current} onNavigate={(item) => setCurrent(item.id)}/>
            <AppInset>
              <PageGutter>
                <PageHeader title="Secrets" badges={<Badge tone="warn">Production</Badge>} description="3 secrets are missing in production." actions={<Button variant="accent">Add secret</Button>}/>
              </PageGutter>
            </AppInset>
          </AppShell>
        </div>
      </div><figcaption className="text-muted-foreground text-xs">{"Beside the sidebar, organization switcher over the sidebar"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <div className="relative min-w-0 w-full overflow-auto h-40 isolate [transform:translateZ(0)]">
          <AppShell>
            <Bar defaultProject="platform"/>
            <AppInset />
          </AppShell>
        </div>
      </div><figcaption className="text-muted-foreground text-xs">{"Without a sidebar, long project name truncates"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run dev; open /design-system#top-bar and exercise the documented interaction.
