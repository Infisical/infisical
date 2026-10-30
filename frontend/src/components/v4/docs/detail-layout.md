# Detail layout

Lay out a detail page as stacked content cards with a details sidecar on the right that stacks above them in narrow containers.

## Choose this component

Choose DetailLayout when a page pairs one summary card with stacked content cards. Choose Grid for peer cards of equal weight and Stack for a single column.

## Usage rules

### detail-layout-sidecar-right

Owner: detail-layout.

When a detail page shows a details card next to stacked content cards.

Do: Pass the details card as aside with an asideLabel and the content cards as children, so the sidecar sits on the right and stacks above them when narrow.

Avoid: Hand-build a two-column grid with a fractional details column on the left, or reorder columns with CSS order.

Why: One primitive keeps the sidecar width, gap, breakpoint and reading order the same on every detail page.

Checked by: src/components/v4/ui/detail-layout.test.tsx. Render a DetailLayout and check that the named aside comes before the main column in the DOM and that the stylesheet's container breakpoint equals size-sidecar-collapse.

Source evidence:
- src/components/v4/ui/layout.tsx
- src/pages/design-system/examples/detail-layout/default.tsx

### detail-layout-sticky-reachable

Owner: detail-layout.

When the sidecar may be taller than the visible scroll area.

Do: Let DetailLayout decide: it sticks only when the whole sidecar fits below the TopBar.

Avoid: Force position sticky on the sidecar or cap its height with an inner scroller.

Why: A sticky panel taller than the viewport hides its lower rows until the page ends, and a nested scroller traps wheel and keyboard scrolling.

Checked by: src/components/v4/ui/detail-layout.test.tsx. Give the sidecar a height under and over its scroll container's height and check data-sticky follows.

Source evidence:
- src/components/v4/ui/layout.tsx
- src/components/v4/ui/detail-layout.module.css

## State guidance

- narrow: Below size-sidecar-collapse the sidecar stacks above the main cards at full width.
- long: A tall sidecar scrolls with the page instead of sticking; keep its card to the record's summary fields.

## Presentation rules

Do: Keep the sidecar to one or two summary cards.

Avoid: Move content lists or tables into the sidecar to balance column heights.

Why: The sidecar is the record summary; lists need the main column's width.

## Import and exports

- src/components/v4/ui/layout.tsx
- src/components/v4/ui/detail-layout.module.css

Exports: DetailLayout. Source TypeScript defines the API.

## Behavior

- DetailLayout renders two columns: children stack as the main column and aside holds the sidecar, usually one details Card with a props DataList. Both columns stack their cards at space-24, and the columns sit space-24 apart.
- At size-sidecar-collapse (896px) of its own width and wider, the main column fills the space left of a size-sidecar (384px) sidecar on the right. The layout is its own container, so it answers to the width it gets inside the page gutter, not to the viewport.
- Narrower than size-sidecar-collapse, the columns stack and the sidecar comes first, above the main cards, because it is the summary of the record.
- In two columns the sidecar sticks below the TopBar (size-shell-bar plus space-24 inside an AppInset with a TopBar, space-24 elsewhere) while the main column scrolls, but only when the whole sidecar fits in the scroll area's visible height with space-24 to spare at the bottom. It measures itself and its scroll container whenever either resizes; a sidecar taller than that scrolls with the page, so no part of it is ever out of reach.

## Accessibility

- The sidecar renders an aside named by asideLabel (for example Details or Certificate details), so screen reader users can jump to it as a complementary region inside the main landmark.
- The sidecar comes first in the DOM, in reading and Tab order, at every width. Stacked, the visual order matches the DOM exactly. In two columns, focus moves from the page header actions at the top right into the sidecar on the right, then to the main column, and the two columns start on the same top edge, so the only reordering is the sidecar's placement to the right; no CSS order property moves content (WCAG 1.3.2 and 2.4.3).
- Sticking never hides focus: the sidecar sticks only when it fits entirely in view, so a focused control inside it is never under the TopBar or below the fold.

## Use cases

- Use DetailLayout for a record's detail page: one details card that summarizes the record, beside stacked cards for its related content (auth methods, projects, subject alternative names, installations).

## Avoid

- Do not use it for settings pages or dashboards whose cards are peers; use Stack or Grid there.

## Limits

- One sidecar on the right only; there is no left placement and no width prop. Use size-sidecar as given.
- The container breakpoint is written as 896px in the stylesheet because container conditions cannot read custom properties. A test fails if it drifts from size-sidecar-collapse.
- Sticking needs every ancestor between the layout and its scroll container to leave overflow visible; an overflow hidden or auto wrapper in between turns it into a plain column.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### container width

- wide: example `default`, visible label "Wide container, sidecar on the right".
- narrow: example `default`, visible label "Narrow container, sidecar stacks above the main cards".

### sticky sidecar


- fits: omitted. Sticking needs a scroll container taller than a docs specimen; the Machine identity and Certificate comparison pages show it, and detail-layout.test.tsx checks the measurement.
- taller than the scroll area: omitted. detail-layout.test.tsx checks that a sidecar taller than its scroll area does not stick.

## Executable examples

### Wide and narrow containers

Save this example at `src/pages/design-system/examples/detail-layout/default.tsx`; its relative imports are generated for that exact path. States: default, overflow.

Registry items used: @infisical/badge, @infisical/button, @infisical/card, @infisical/layout, @infisical/list. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Badge } from "../../../../components/v4/ui/badge";
import { Button } from "../../../../components/v4/ui/button";
import { Card } from "../../../../components/v4/ui/card";
import { DetailLayout } from "../../../../components/v4/ui/layout";
import { DataList, List, ListRow } from "../../../../components/v4/ui/list";
const Specimen = () => (<DetailLayout asideLabel="Details" aside={<Card title="Details">
        <DataList variant="props" items={[
            ["ID", <code key="id">4b1e8c2a-93f0-4d55-a1c6-0e7d2f9b3a11</code>],
            ["Managed by", "Organization"],
            ["Organization role", "Member"],
            [
                "Metadata",
                <Badge key="meta" tone="outline" mono>
                runner=github-actions-self-hosted
              </Badge>
            ],
            ["Last login", "Never"]
        ]}/>
      </Card>}>
    <List label="Auth methods" title="Authentication" action={<Button variant="outline" size="sm" icon="plus">
          Add auth method
        </Button>}>
      <ListRow value="universal" label="Universal Auth" title="Universal Auth" description="Last used 4 minutes ago"/>
      <ListRow value="oidc" label="OIDC Auth" title="OIDC Auth" description="Not used in the last 30 days"/>
    </List>
    <List label="Projects" title="Projects">
      <ListRow value="payments" label="payments-api" title={<code>payments-api</code>} meta="Developer"/>
      <ListRow value="platform" label="platform-core-shared-infrastructure-eu-west-1" title={<code>platform-core-shared-infrastructure-eu-west-1</code>} meta="Viewer"/>
    </List>
  </DetailLayout>);
export default function Example() {
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Specimen />
      </div><figcaption className="text-muted-foreground text-xs">{"Wide container, sidecar on the right"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <div style={{ maxWidth: "var(--v4-size-measure-form)" }}>
          <Specimen />
        </div>
      </div><figcaption className="text-muted-foreground text-xs">{"Narrow container, sidecar stacks above the main cards"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- runtime: npx vitest run src/components/v4/ui/detail-layout.test.tsx
- browser: npm run dev; open /design-system#detail-layout and /design-system#compare-identities, resize below 896px of layout width.
