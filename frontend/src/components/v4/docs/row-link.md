# Row link

A typed route link whose target stretches over its table row or Card, with a disabled fallback.

## Choose this component

Choose RowLink when the row is a link to a URL: people can open it in a new tab, copy it and see it in the status bar. Choose DataTable's onRowActivate when activating the row runs an in-page action such as opening a details Sheet. Use one or the other per table.

## Usage rules

### row-link-vs-row-activate

Owner: row-link.

When a whole DataTable row should respond to a click.

Do: Use RowLink in the primary cell when the row navigates, and onRowActivate when it opens something in place.

Avoid: Navigate from onRowActivate with router.navigate, or set both on one table.

Why: Navigation from a click handler has no href, so new-tab, copy link and middle-click stop working; setting both gives each row two targets and two tab stops.

Checked by: review only. Look for: Search for router.navigate or navigate( inside onRowActivate handlers, and for tables that pass onRowActivate while rendering RowLink.

Source evidence:
- src/components/v4/ui/row-link.tsx
- src/pages/design-system/examples/row-link/default.tsx

## State guidance

- hover: Table rows keep their own hover tint; a Card gets a translucent ink overlay.
- disabled: Muted text, no overlay and no href; give the reason elsewhere in the row.

## Presentation rules

Do: Keep row actions as ordinary buttons beside the link.

Avoid: Wrap the whole row in an anchor.

Why: An anchor around buttons is invalid nesting and swallows their clicks.

## Import and exports

- src/components/v4/ui/row-link.tsx
- src/components/v4/ui/row-link.module.css

Exports: RowLink. Source TypeScript defines the API.

## Behavior

- RowLink is TanStack Router's createLink over an anchor, so to, params, search and hash are typed against the route tree and the href is real.
- Its ::after covers the nearest table row or Card. The row or Card becomes the positioning context through :has(), so hosts need no linked prop.
- Buttons, inputs, checkboxes, comboboxes, switches, other links, tooltip triggers and anything marked data-row-interactive inside that host sit above the overlay and keep their own click.
- The link text truncates with an ellipsis; pass title to show the full value on hover.
- disabled renders a span with no href and no overlay, in muted text, so the row stays visible but does not navigate.

## Accessibility

- The row's accessible target is a real link, so it supports middle-click, open in new tab, copy link and the browser's status bar.
- Keyboard focus lands on the link and draws the ink focus outline around the whole row or Card.
- The disabled span has role link and aria-disabled true, so it is announced as an unavailable link.

## Use cases

- Use RowLink in the primary cell of a table row, or the title of a Card, when activating it navigates to another route.

## Avoid

- Do not use RowLink when activation opens a sheet or dialog or changes state on the page; that is DataTable's onRowActivate.

## Limits

- Use one RowLink per row or Card; a second stretched target would cover the first.
- Do not combine RowLink with DataTable's onRowActivate on the same table. Both would claim the row, and the row would take two tab stops.
- Controls that position themselves absolutely keep their own stacking; if one sits under the overlay, mark it data-row-interactive and give it a position.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### host

- DataTable row: example `default`, visible label "DataTable rows open their page; the last row is disabled".
- Card: example `default`, visible label "Card opens the Detail page; the copy button keeps its own click".

### state

- enabled: example `default`, visible label "DataTable rows open their page; the last row is disabled".
- disabled: example `default`, visible label "DataTable rows open their page; the last row is disabled".

## Executable examples

### DataTable rows and a Card

Save this example at `src/pages/design-system/examples/row-link/default.tsx`; its relative imports are generated for that exact path. States: default, disabled, keyboard.

Registry items used: @infisical/badge, @infisical/button, @infisical/card, @infisical/data-table, @infisical/provider-icon, @infisical/row-link, @infisical/text. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Badge } from "../../../../components/v4/ui/badge";
import { Button } from "../../../../components/v4/ui/button";
import { Card } from "../../../../components/v4/ui/card";
import { DataTable, type DataTableColumn } from "../../../../components/v4/ui/data-table";
import { ProviderIcon } from "../../../../components/v4/ui/provider-icon";
import { RowLink } from "../../../../components/v4/ui/row-link";
import { SmallText } from "../../../../components/v4/ui/text";
type Page = {
    id: string;
    title: string;
    icon: string;
    status: string;
    ready: boolean;
};
const pages: Page[] = [
    { id: "detail", title: "Detail", icon: "Infisical.png", status: "Data display", ready: true },
    {
        id: "documentation-link-badge",
        title: "Documentation link badge",
        icon: "GitHub.png",
        status: "Navigation",
        ready: true
    },
    {
        id: "provider-icon",
        title: "Provider icon",
        icon: "Amazon Web Services.png",
        status: "Data display",
        ready: true
    },
    {
        id: "unreleased",
        title: "Unreleased page, not linked yet",
        icon: "Kafka.png",
        status: "Draft",
        ready: false
    }
];
export default function Example() {
    const columns: DataTableColumn<Page>[] = [
        {
            id: "title",
            header: "Page",
            grow: true,
            text: (row) => row.title,
            render: (row) => (<div className="flex min-w-0 items-center gap-2">
          <ProviderIcon icon={row.icon} alt=""/>
          <RowLink to="/design-system" hash={row.id} disabled={!row.ready} title={row.title}>
            {row.title}
          </RowLink>
        </div>)
        },
        {
            id: "status",
            header: "Group",
            width: 140,
            render: (row) => <Badge tone={row.ready ? "soft" : "warn"}>{row.status}</Badge>
        },
        {
            id: "actions",
            header: "Actions",
            actions: true,
            width: 52,
            render: (row) => (<Button variant="ghost" size="icon-row" icon="copy" iconOnly onClick={() => navigator.clipboard.writeText(row.id)}>
          {`Copy the id of ${row.title}`}
        </Button>)
        }
    ];
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <DataTable label="Workbench pages" rows={pages} columns={columns} getRowId={(row) => row.id} rowLabel={(row) => row.title}/>
      </div><figcaption className="text-muted-foreground text-xs">{"DataTable rows open their page; the last row is disabled"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Card>
          <div className="flex items-center gap-3">
            <ProviderIcon icon="Infisical.png" alt="" size="xl"/>
            <div className="min-w-0 flex-1">
              <RowLink to="/design-system" hash="detail">
                Detail
              </RowLink>
              <SmallText muted>
                Stacked label and value pairs for the details of one resource.
              </SmallText>
            </div>
            <Button variant="ghost" size="icon-row" icon="copy" iconOnly onClick={() => navigator.clipboard.writeText("detail")}>
              Copy the id of Detail
            </Button>
          </div>
        </Card>
      </div><figcaption className="text-muted-foreground text-xs">{"Card opens the Detail page; the copy button keeps its own click"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- runtime: npm test -- src/components/v4/ui/row-link.test.tsx
- static: npm run type:check
- browser: Click a row and a row's action in both themes; middle-click and keyboard focus the link.
