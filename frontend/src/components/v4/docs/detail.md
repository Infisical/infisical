# Detail

Stacked label and value pairs for a resource's details, optionally grouped under headers.

## Choose this component

Choose Detail when labels sit above values and values hold arbitrary nodes, which is how main's details cards and sheets read. Choose DataList for compact right-aligned term and value rows built from data.

## Usage rules

### detail-header-action

Owner: detail.

When a section of details has an action such as Edit that applies to the whole section.

Do: Pass the button through DetailGroupHeader's action prop and keep the title as the header's children.

Avoid: Put the button inside the header children or hand-build a flex row with justify-between around the title.

Why: The action slot keeps the button out of the heading's accessible name and keeps every section's edge and gap the same.

Checked by: review only. Look for: Read each DetailGroupHeader: the children are text only and any button is in action. A screen reader's heading list reads the title alone.

Source evidence:
- src/components/v4/ui/detail.tsx
- src/pages/design-system/examples/detail/default.tsx

## State guidance

- missing value: Write a word such as None or Not set in the value; never leave the dd empty.
- blocked action: Keep a header action visible and disabled when the person lacks permission.

## Presentation rules

Do: Let the label and value roles carry the hierarchy.

Avoid: Add bold, uppercase or color classes to labels to make them stand out.

Why: The caption and body roles already separate the two; restyling drifts across pages.

## Import and exports

- src/components/v4/ui/detail.tsx
- src/components/v4/ui/detail.module.css

Exports: Detail, DetailLabel, DetailValue, DetailGroup, DetailGroupHeader. Source TypeScript defines the API.

## Behavior

- Detail is one label over one value: the label in the caption role and muted, the value in the body role and ink, space-4 apart.
- Values take any node (text, code, a Badge, a copy button) and wrap long unbroken identifiers instead of overflowing.
- DetailGroup stacks its children space-16 apart. DetailGroupHeader is a label-role heading that sits in that same stack, so headers and Details interleave as siblings, as they do on main.
- DetailGroupHeader takes an optional action slot at its end for a section's Edit button, so the title and the action never share one string.

## Accessibility

- Each Detail renders its own description list: dl with one dt and one dd. It is valid wherever it lands, inside a group, a Card or a Sheet, with no wrapping list.
- DetailGroupHeader renders a real heading, h3 by default; set level so it nests under the page's outline.
- The header action is outside the heading element, so the heading's name is the title alone.

## Use cases

- Use Detail for the properties of one resource in a details card or a sheet, where each value may be rich content and sections need their own headers.

## Avoid

- Do not use Detail for numbers that compare across a grid of cards; DataList stat or props puts terms and values in two aligned columns.

## Limits

- Detail stacks the label over the value. For a two-column term and value table with the value on the right, use DataList.
- A Detail holds one label and one value; repeat Detail for each pair rather than putting several dt and dd in one.
- DetailGroup does not draw dividers or a frame; put it in a Card or a Sheet body for that.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### composition

- grouped with header: example `default`, visible label "Groups with headers and an edit action".
- header action: example `default`, visible label "Groups with headers and an edit action".
- loose: example `default`, visible label "Loose details, no group".

## Executable examples

### Groups, headers and loose details

Save this example at `src/pages/design-system/examples/detail/default.tsx`; its relative imports are generated for that exact path. States: default, overflow, disabled.

Registry items used: @infisical/badge, @infisical/button, @infisical/card, @infisical/detail. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Badge } from "../../../../components/v4/ui/badge";
import { Button } from "../../../../components/v4/ui/button";
import { Card } from "../../../../components/v4/ui/card";
import { Detail, DetailGroup, DetailGroupHeader, DetailLabel, DetailValue } from "../../../../components/v4/ui/detail";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Card title="Gateway details">
          <DetailGroup>
            <DetailGroupHeader action={<Button variant="ghost" size="xs" icon="settings">
                  Edit
                </Button>}>
              General
            </DetailGroupHeader>
            <Detail>
              <DetailLabel>ID</DetailLabel>
              <DetailValue>
                <code>3f8b2c1e-9d4a-4e7b-a6c2-5b1d0f9e8a77</code>
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Name</DetailLabel>
              <DetailValue>
                eu-west-production-gateway-with-a-very-long-unbroken-identifier
              </DetailValue>
            </Detail>
            <Detail>
              <DetailLabel>Status</DetailLabel>
              <DetailValue>
                <Badge tone="ok" dot>
                  Healthy
                </Badge>
              </DetailValue>
            </Detail>
            <DetailGroupHeader action={<Button variant="ghost" size="xs" icon="settings" disabled>
                  Edit
                </Button>}>
              Authentication
            </DetailGroupHeader>
            <Detail>
              <DetailLabel>Machine identity</DetailLabel>
              <DetailValue>None</DetailValue>
            </Detail>
          </DetailGroup>
        </Card>
      </div><figcaption className="text-muted-foreground text-xs">{"Groups with headers and an edit action"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Card>
          <Detail>
            <DetailLabel>Created</DetailLabel>
            <DetailValue>Oct 12, 2026, 09:41</DetailValue>
          </Detail>
        </Card>
      </div><figcaption className="text-muted-foreground text-xs">{"Loose details, no group"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- runtime: npm test -- src/components/v4/ui/detail.test.tsx
- static: npm run type:check
- browser: Verify both themes, a long unbroken value and a narrow card.
