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

Checked by: review only. Look for: ui:lint row-activate-navigates flags an onRowActivate that navigates, inline or through a function in the same file. Check imported handlers and tables that pass onRowActivate while rendering RowLink by hand.

Source evidence:
- src/components/v4/ui/row-link.tsx
- src/pages/design-system/examples/row-link/default.tsx

### row-link-sheet-row

Owner: row-link.

When activating a row opens its record in a Sheet or Dialog on the same page.

Do: Render the name as a quiet link Button (variant link, underline hover) that runs the table's onRowActivate handler, so the row draws no chevron. When the sheet is addressable by URL and the name is a RowLink to it, pass chevron={false}.

Avoid: Keep RowLink's chevron on a row that never leaves the page, or add a chevron or Open action to the actions tail for the same sheet.

Why: The chevron promises a new page; on a row that opens a sheet it sends the person somewhere they never go.

Checked by: review only. Look for: Open each sheet-opening table and check that no row shows a chevron and the actions tail has no Open action.

Source evidence:
- src/components/v4/ui/row-link.tsx
- src/pages/design-system/examples/row-link/default.tsx

### row-link-chevron

Owner: row-link.

When a table row navigates to another page through RowLink.

Do: Keep the default trailing chevron and place RowLink last in its cell's flex line, so the chevron lands on the cell's trailing edge.

Avoid: Draw a second chevron or arrow in the row, put badges or hints after the RowLink, or turn the chevron off on a row that goes to another page.

Why: The chevron is the row's only visual sign that activating it navigates; content after the link pushes it off the trailing edge.

Checked by: src/components/v4/ui/row-link.test.tsx. Renders an enabled, a disabled and a chevron={false} RowLink and checks the aria-hidden chevron is present on the first two and absent on the third.

Source evidence:
- src/components/v4/ui/row-link.tsx
- src/pages/design-system/examples/row-link/default.tsx

## State guidance

- hover: Table rows keep their own hover tint; a Card gets a translucent ink overlay. The chevron turns from muted to ink.
- disabled: Muted text, no overlay and no href; give the reason elsewhere in the row.

## Presentation rules

Do: Keep row actions as ordinary buttons in the table's actions tail, the sticky last column, outside the link.

Avoid: Wrap the whole row in an anchor.

Why: An anchor around buttons is invalid nesting and swallows their clicks.

## Import and exports

- src/components/v4/ui/row-link.tsx
- src/components/v4/ui/row-link.module.css

Exports: RowLink. Source TypeScript defines the API.

## Behavior

- RowLink takes link, the app's link target, and renders one anchor through CipherLink. The app wires its router once with CipherRouterProvider (V4RouterProvider in pages/v4/cipher-router.tsx), so in the app to, params, search and hash are typed against the route tree and the href is real.
- Its ::after covers the nearest table row or Card. The row or Card becomes the positioning context through :has(), so hosts need no linked prop.
- Buttons, inputs, checkboxes, comboboxes, switches, other links, tooltip triggers and anything marked data-row-interactive inside that host sit above the overlay and keep their own click.
- The link text truncates with an ellipsis; pass title to show the full value on hover.
- A trailing chevron-right marks the row as navigation. It follows the link text 8px after it, never pushed to the cell's far edge, so in a multi-column row it stays with the name it belongs to (rule/chevron-tile-frame). It is size-glyph in muted and turns ink while the row or Card is hovered or holds focus. It takes no width a column did not already have and does not change the row height. Pass chevron={false} for the rare host that should not show it, such as a Card whose whole surface already reads as a link.
- disabled renders a span with no href and no overlay, in muted text, so the row stays visible but does not navigate.

## Accessibility

- The row's accessible target is a real link, so it supports middle-click, open in new tab, copy link and the browser's status bar.
- Keyboard focus lands on the link and draws the ink focus outline around the whole row or Card.
- The disabled span has role link and aria-disabled true, so it is announced as an unavailable link.
- The chevron is decorative and aria-hidden, so the link's accessible name is its text alone.

## Use cases

- Use RowLink in the primary cell of a table row, or the title of a Card, when activating it navigates to another route.

## Avoid

- Do not use RowLink when activation opens a sheet or dialog or changes state on the page; that is DataTable's onRowActivate.

## Limits

- Use one RowLink per row or Card; a second stretched target would cover the first. When the whole Card is the link and its name should wrap, use CardLink, which shares these semantics.
- Do not combine RowLink with DataTable's onRowActivate on the same table. Both would claim the row, and the row would take two tab stops.
- Controls that position themselves absolutely keep their own stacking; if one sits under the overlay, mark it data-row-interactive and give it a position.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### host

- DataTable row: example `default`, visible label "DataTable rows open their page; the last row is disabled".
- Card: example `default`, visible label "Card opens the Detail page without a chevron; the copy button keeps its own click".

### state

- enabled: example `default`, visible label "DataTable rows open their page; the last row is disabled".
- disabled: example `default`, visible label "DataTable rows open their page; the last row is disabled".

## Executable examples

### DataTable rows and a Card

Save this example at `src/pages/design-system/examples/row-link/default.tsx`; its relative imports are generated for that exact path. States: default, disabled, keyboard.

Registry items used: @cipher/badge, @cipher/button, @cipher/card, @cipher/data-table, @cipher/icon, @cipher/row-link, @cipher/text. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Badge } from "../../../../components/v4/ui/badge";
import { Button } from "../../../../components/v4/ui/button";
import { Card } from "../../../../components/v4/ui/card";
import { DataTable, type DataTableColumn } from "../../../../components/v4/ui/data-table";
import { Icon, type IconName } from "../../../../components/v4/ui/icon";
import { RowLink } from "../../../../components/v4/ui/row-link";
import { SmallText } from "../../../../components/v4/ui/text";

type Page = {
  id: string;
  group: string;
  title: string;
  icon: IconName;
  status: string;
  ready: boolean;
};
const pages: Page[] = [
  {
    id: "detail",
    group: "data-display",
    title: "Detail",
    icon: "file",
    status: "Data display",
    ready: true
  },
  {
    id: "documentation-link-badge",
    group: "navigation",
    title: "Documentation link badge",
    icon: "link",
    status: "Navigation",
    ready: true
  },
  {
    id: "provider-icon",
    group: "data-display",
    title: "Provider icon",
    icon: "apps",
    status: "Data display",
    ready: true
  },
  {
    id: "unreleased",
    group: "patterns",
    title: "Unreleased page, not linked yet",
    icon: "folder",
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
      render: (row) => (
        <div className="flex min-w-0 items-center gap-2">
          <Icon name={row.icon} size="var(--v4-size-icon)" className="shrink-0" />
          <RowLink
            link={{ href: `/design-system/components/${row.group}/${row.id}` }}
            disabled={!row.ready}
            title={row.title}
          >
            {row.title}
          </RowLink>
        </div>
      )
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
      render: (row) => (
        <Button
          variant="ghost"
          size="icon-row"
          icon="copy"
          iconOnly
          onClick={() => navigator.clipboard.writeText(row.id)}
        >
          {`Copy the id of ${row.title}`}
        </Button>
      )
    }
  ];
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <DataTable
            label="Workbench pages"
            rows={pages}
            columns={columns}
            getRowId={(row) => row.id}
            rowLabel={(row) => row.title}
          />
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"DataTable rows open their page; the last row is disabled"}
        </figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Card variant="framed">
            <div className="flex items-center gap-3">
              <Icon name="apps" size="var(--v4-size-icon-xl)" className="shrink-0" />
              <div className="min-w-0 flex-1">
                <RowLink
                  link={{ href: "/design-system/components/data-display/detail" }}
                  chevron={false}
                >
                  Detail
                </RowLink>
                <SmallText muted>
                  Stacked label and value pairs for the details of one resource.
                </SmallText>
              </div>
              <Button
                variant="ghost"
                size="icon-row"
                icon="copy"
                iconOnly
                onClick={() => navigator.clipboard.writeText("detail")}
              >
                Copy the id of Detail
              </Button>
            </div>
          </Card>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Card opens the Detail page without a chevron; the copy button keeps its own click"}
        </figcaption>
      </figure>
    </div>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- runtime: npm test -- src/components/v4/ui/row-link.test.tsx
- static: npm run type:check
- browser: Click a row and a row's action in both themes; middle-click and keyboard focus the link.
