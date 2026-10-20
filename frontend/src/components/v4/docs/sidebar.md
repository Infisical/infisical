# Sidebar

The app's navigation beside the inset: tools, a Home and Organization switch, sections of rows, footer rows and one account button for the person and their organization.

## Choose this component

Choose Sidebar for the persistent app navigation. Use TopBar for the product-level trail and Tabs for sections inside one page.

## Usage rules

### sidebar-account-identity

Owner: sidebar.

When the account button shows who is signed in and which organization they are in.

Do: Show the person's avatar with their name over the organization's name, and list organizations by name and plan.

Avoid: Render an organization avatar, initials tile or icon in the button, the switcher rows or the crumb.

Why: Organizations have no avatar in the product, so a generated tile would be a mark nobody chose.

Checked by: review only. Look for: Open the account popover and confirm no organization row or the button renders an avatar for the organization.

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

- The tools row holds the collapse toggle, then search and invite: 36px icon buttons with 18px icons and tooltips.
- With spaces, a segmented switch under the tools shows one space's sections at a time. The space holding the current page shows by default, a page opened from elsewhere brings its space with it, and a hidden space that holds a count shows a dot.
- Sections stack 36px rows 1px apart. A labeled section draws its 28px eyebrow with a rule that runs to the sidebar's edge.
- A row with children opens one level of 32px pages, without icons, on a guide line under its icon. It opens by itself when it holds the current page, and while closed it shows the sum of its pages' counts.
- The nav scrolls when it runs out of room and fades the edge where more rows are cut off.
- Collapsing narrows the sidebar to a rail of icons over the slide timing. Labels move into tooltips, counts become dots, the space switch stacks its icons vertically, section labels become rules and a group opens its pages in a menu to the right.
- The account button opens one Switcher: organizations with their plan, organization actions, the person's items, a theme row and the person's own row for their settings.

## Accessibility

- The rows sit in a nav landmark named for the space it shows. Up and Down move between rows and Home and End jump; Tab still reaches every row.
- The space switch is a tablist: Left and Right move between spaces, Up and Down in the rail. A hidden space with a count is announced as having updates.
- The current page carries aria-current. Rail rows keep their label as the accessible name.
- Focus draws the 2px ink outline inside the row, so the scrolling nav never clips it.
- The account button is named for the person and the organization, and the popover returns focus to it on close.

## Use cases

- Use Sidebar for the app's main navigation, with short noun labels, counts for things waiting on the person and the account at the bottom.

## Avoid

- Put a separate organization switcher in the nav, show an organization avatar, or use counts for totals.

## Limits

- The host owns routing: rows call onNavigate or follow href, and the host passes the current id back.
- Organizations never show an avatar or icon. The account button shows the person's avatar.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### width

- expanded: example `default`, visible label "Expanded, a child page current".
- rail: example `default`, visible label "Rail, counts as dots".

### size support


- no authored named size: omitted. The sidebar has one width and a rail. Row heights follow the 36px control recipe.

## Executable examples

### Expanded and rail

Save this example at `src/pages/design-system/examples/sidebar/default.tsx`; its relative imports are generated for that exact path. States: default, controlled, keyboard.

Registry items used: @infisical/sidebar. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Sidebar, type SidebarProps, type SidebarTheme } from "../../../../components/v4/ui/sidebar";
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
const organizations = [
    { value: "acme", label: "Acme Corp", plan: "Enterprise" },
    { value: "globex", label: "Globex", plan: "Pro" },
    { value: "initech", label: "Initech", plan: "Free" }
];
const Shell = ({ start, defaultCollapsed }: {
    start: string;
    defaultCollapsed?: boolean;
}) => {
    const [current, setCurrent] = useState(start);
    const [org, setOrg] = useState("acme");
    const [unseen, setUnseen] = useState(3);
    const [theme, setTheme] = useState<SidebarTheme>("system");
    return (<Sidebar spaces={spaces} current={current} onNavigate={(item) => setCurrent(item.id)} defaultCollapsed={defaultCollapsed} search={{ onClick: () => setCurrent("home") }} invite={{ onClick: () => setCurrent("access-members") }} footerItems={[
            {
                id: "news",
                label: "What's new",
                icon: "megaphone",
                count: unseen,
                onClick: () => setUnseen(0)
            },
            { id: "docs", label: "Docs", icon: "file", href: "#sidebar", external: true }
        ]} user={{
            name: "Sarah Lin",
            email: "sarah@acme.dev",
            items: [{ label: "Sign out" }],
            onClick: () => setCurrent("settings")
        }} org={{
            name: organizations.find((option) => option.value === org)?.label ?? "Acme Corp",
            options: organizations,
            value: org,
            onChange: setOrg,
            actions: [{ label: "Create organization", icon: "plus" }]
        }} theme={{ value: theme, onChange: setTheme }}/>);
};
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <div className="relative min-w-0 w-full overflow-auto h-[600px] isolate [transform:translateZ(0)]">
          <Shell start="secrets-overview"/>
        </div>
      </div><figcaption className="text-muted-foreground text-xs">{"Expanded, a child page current"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <div className="relative min-w-0 w-full overflow-auto h-[600px] isolate [transform:translateZ(0)]">
          <Shell start="secrets-approvals" defaultCollapsed/>
        </div>
      </div><figcaption className="text-muted-foreground text-xs">{"Rail, counts as dots"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#sidebar and exercise the documented interaction.
