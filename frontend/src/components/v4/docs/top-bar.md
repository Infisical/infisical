# Top bar

The strip across the top of the inset with the product-level breadcrumb on the left and page-wide tools on the right.

## Choose this component

Choose TopBar for the product-level location. Put the page-level trail (folders, an object's parents) in PageHeader.

## Usage rules

### top-bar-shared-gutter

Owner: top-bar.

When a page sits under the top bar.

Do: Render TopBar and the page content inside one AppInset and wrap the content in PageGutter.

Avoid: Give the page its own max-width and centering while the bar uses a fixed padding.

Why: Two sources of width drift apart, so the root crumb stops lining up with the content edge at some widths.

Checked by: review only. Look for: Resize the example from narrow to very wide and compare the left edge of the root crumb's text with the page title.

Source evidence:
- src/components/v4/ui/top-bar.tsx
- src/components/v4/ui/top-bar.module.css
- src/pages/design-system/examples/top-bar/default.tsx

### top-bar-switcher-segment

Owner: top-bar.

When a crumb switches the organization, project or environment.

Do: Give the crumb a menu, so the segment opens the Switcher from its text or its chevron and only the chevron highlights.

Avoid: Draw a hover ground or padding on the whole segment, or make the label a second focus stop.

Why: A segment without padding keeps the root text on the content edge, and one focusable trigger keeps the keyboard path short.

Checked by: review only. Look for: Hover the crumb text and confirm only the chevron takes the hover ground; Tab reaches one stop per crumb.

Source evidence:
- src/components/v4/ui/top-bar.tsx
- src/pages/design-system/examples/top-bar/default.tsx

## State guidance

- open: The open switcher's chevron keeps the press ground until the popover closes.
- overflow: Labels truncate with an ellipsis and keep the full text in the switcher.

## Presentation rules

Do: Keep the right side to search and two or three icon tools with tooltips.

Avoid: Fill the bar with account menus, theme toggles and promotional buttons.

Why: The account and theme already live in the Sidebar account popover.

## Import and exports

- src/components/v4/ui/top-bar.tsx
- src/components/v4/ui/top-bar.module.css

Exports: TopBar, AppShell, AppInset, PageGutter. Source TypeScript defines the API.

## Behavior

- TopBar is 48px tall on a line-soft rule and the inset ground, and sticks to the top of the inset while the page scrolls.
- Each crumb with a menu is a switcher segment: clicking its text or its chevron opens the same Switcher, and only the chevron highlights.
- AppInset defines one page gutter from its own width. TopBar and PageGutter both pad by it, so the root crumb's text and the page content share a left edge at every width.
- Long crumb labels truncate and keep their full text in the switcher.

## Accessibility

- The trail is a named breadcrumb landmark. Each switcher's chevron is the only tab stop for its crumb and is named for its purpose and the current value.
- AppInset renders the main landmark.

## Use cases

- Use TopBar inside AppInset with the organization as the root crumb, then the project and environment, each a switcher, and three or four tools on the right.

## Avoid

- Pad the bar or the page by hand, add an organization avatar to the root crumb, or repeat the page-level trail here.

## Limits

- The reference's staged narrow-width rules (hiding the search label and ancestor labels) are not implemented; labels truncate instead.
- The gutter grows past 40px only when the inset is wider than the page measure plus the gutters.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### shell

- beside sidebar: example `default`, visible label "Beside the sidebar, crumb root on the content edge".
- standalone: example `default`, visible label "Without a sidebar, long project name truncates".

### size support


- no authored named size: omitted. The bar has one 48px height; its width follows the inset.

## Executable examples

### App shell with switcher crumbs

Save this example at `src/pages/design-system/examples/top-bar/default.tsx`; its relative imports are generated for that exact path. States: default, controlled, overflow, keyboard.

Registry items used: @infisical/badge, @infisical/button, @infisical/page-header, @infisical/sidebar, @infisical/tooltip, @infisical/top-bar. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Badge } from "../../../../components/v4/ui/badge";
import { Button } from "../../../../components/v4/ui/button";
import { PageHeader } from "../../../../components/v4/ui/page-header";
import { Sidebar } from "../../../../components/v4/ui/sidebar";
import { Tooltip, TooltipProvider } from "../../../../components/v4/ui/tooltip";
import { AppInset, AppShell, PageGutter, TopBar } from "../../../../components/v4/ui/top-bar";
const organizations = [
    { value: "acme", label: "Acme Corp", meta: "Enterprise" },
    { value: "acme-eu", label: "Acme EU", meta: "Enterprise" },
    { value: "globex", label: "Globex", meta: "Pro" }
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
    return (<TopBar breadcrumb={[
            {
                label: labelOf(organizations, org),
                menu: {
                    label: "Switch organization",
                    options: organizations,
                    value: org,
                    onChange: setOrg,
                    actions: [{ label: "Create organization", icon: "plus" }]
                }
            },
            {
                label: labelOf(projects, project),
                mono: true,
                menu: {
                    label: "Switch project",
                    options: projects,
                    value: project,
                    onChange: setProject
                }
            },
            {
                label: labelOf(environments, environment),
                menu: {
                    label: "Switch environment",
                    options: environments,
                    value: environment,
                    onChange: setEnvironment
                }
            }
        ]} actions={<TooltipProvider>
          <Tooltip content="Search" shortcut="mod+K" side="bottom">
            <Button variant="ghost" size="icon" icon="search" iconOnly>
              Search
            </Button>
          </Tooltip>
          <Tooltip content="Notifications" side="bottom">
            <Button variant="ghost" size="icon" icon="bell" iconOnly>
              Notifications
            </Button>
          </Tooltip>
        </TooltipProvider>}/>);
};
export default function Example() {
    const [current, setCurrent] = useState("secrets");
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <div className="relative min-w-0 w-full overflow-auto h-[600px] isolate [transform:translateZ(0)]">
          <AppShell>
            <Sidebar sections={[
            {
                items: [
                    { id: "home", label: "Home", icon: "home" },
                    { id: "secrets", label: "Secrets", icon: "key" },
                    { id: "approvals", label: "Approvals", icon: "inbox", count: 3 }
                ]
            }
        ]} current={current} onNavigate={(item) => setCurrent(item.id)} user={{ name: "Sarah Lin", email: "sarah@acme.dev" }}/>
            <AppInset>
              <Bar />
              <PageGutter>
                <PageHeader title="Secrets" badges={<Badge tone="warn">Production</Badge>} description="3 secrets are missing in production." actions={<Button variant="primary">Add secret</Button>}/>
              </PageGutter>
            </AppInset>
          </AppShell>
        </div>
      </div><figcaption className="text-muted-foreground text-xs">{"Beside the sidebar, crumb root on the content edge"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <div className="relative min-w-0 w-full overflow-auto h-40 isolate [transform:translateZ(0)]">
          <AppInset>
            <Bar defaultProject="platform"/>
          </AppInset>
        </div>
      </div><figcaption className="text-muted-foreground text-xs">{"Without a sidebar, long project name truncates"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#top-bar and exercise the documented interaction.
