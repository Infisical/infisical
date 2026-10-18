# Page header

The top of a page: the page-level trail, the title with its badges, a lede, actions and tabs.

## Choose this component

Choose PageHeader for the page's own title and trail. The product-level trail belongs in TopBar.

## Usage rules

### page-header-lede

Owner: page-header.

When a page has a lede under its title.

Do: Say what needs attention with a count, such as 3 secrets are missing in production.

Avoid: Describe what the page is, such as This page lists your secrets.

Why: The title already names the page; the lede earns its line by telling the person what to do.

Checked by: review only. Look for: Read each lede and check that it states a count or a needed action.

Source evidence:
- src/components/v4/ui/page-header.tsx
- src/pages/design-system/examples/page-header/default.tsx

### page-header-actions

Owner: page-header.

When a page offers actions in its header.

Do: Place at most one primary action, last, and keep the rest secondary or in a menu.

Avoid: Line up several primary buttons beside the title.

Why: One primary action tells the person what the page is for.

Checked by: review only. Look for: Count primary buttons in each header.

Source evidence:
- src/pages/design-system/examples/page-header/default.tsx

## State guidance

- overflow: Long titles wrap, and long folder paths collapse their middle crumbs.

## Presentation rules

Do: Use sentence case for titles and keep keys, paths and hosts in mono.

Avoid: Title case every word or add an eyebrow that repeats the root crumb.

Why: The root crumb already sits in the top bar above the title.

## Import and exports

- src/components/v4/ui/page-header.tsx
- src/components/v4/ui/page-header.module.css

Exports: PageHeader. Source TypeScript defines the API.

## Behavior

- The breadcrumb sits 8px above the title and every crumb is an ancestor, so none is marked current.
- lg sets the title in the 44/44 display role for top-level pages; md uses the 28/32 role for one object's page.
- Actions sit beside the title and drop under it when both cannot share a line. Titles wrap and never truncate.
- Tabs sit 24px below everything else.

## Accessibility

- The title is the page's one h1.
- A long folder path collapses its middle into a named button that expands in place.

## Use cases

- Use one PageHeader per page with a title, a lede that says what needs attention and at most one primary action.

## Avoid

- Repeat the organization, project or environment trail here, or repeat the title as the last crumb.

## Limits

- The host provides the tab panels and routes; the header only places them.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### size

- lg: example `default`, visible label "lg".
- md: example `default`, visible label "md".

## Executable examples

### Top-level page and object page

Save this example at `src/pages/design-system/examples/page-header/default.tsx`; its relative imports are generated for that exact path. States: default, overflow.

Registry items used: @infisical/badge, @infisical/button, @infisical/item, @infisical/page-header, @infisical/tabs. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Badge } from "../../../../components/v4/ui/badge";
import { Button } from "../../../../components/v4/ui/button";
import { Media } from "../../../../components/v4/ui/item";
import { PageHeader } from "../../../../components/v4/ui/page-header";
import { Tabs } from "../../../../components/v4/ui/tabs";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <PageHeader title="Organization overview" description="2 approvals and 1 failed sync need you." actions={<>
              <Button variant="outline">Invite members</Button>
              <Button variant="primary">New project</Button>
            </>}/>
      </div><figcaption className="text-muted-foreground text-xs">{"lg"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <PageHeader size="md" mono title="stripe_api_key" media={<Media icon="key" size="md"/>} breadcrumb={[
            { label: "payments-api", href: "#page-header", mono: true },
            { label: "backend", href: "#page-header", mono: true },
            { label: "billing", href: "#page-header", mono: true },
            { label: "providers", href: "#page-header", mono: true },
            { label: "stripe", href: "#page-header", mono: true }
        ]} maxItems={3} badges={<>
              <Badge tone="warn">Production</Badge>
              <Badge>v14</Badge>
            </>} description="Rotated 12 days ago by Sarah Lin." actions={<Button variant="outline">Rotate</Button>} tabs={<Tabs label="Secret sections" tabs={[
                { value: "overview", label: "Overview", content: null },
                { value: "versions", label: "Versions", count: 14, content: null },
                { value: "syncs", label: "Syncs", count: 3, content: null }
            ]}/>}/>
      </div><figcaption className="text-muted-foreground text-xs">{"md"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#page-header and exercise the documented interaction.
