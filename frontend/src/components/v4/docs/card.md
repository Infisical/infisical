# Card

Group one resource or task with its own header, content and actions.

## Choose this component

Choose Card when one resource or task has its own heading, content and actions. Use plain sections for a continuous form and List for comparable rows.

## Usage rules

### card-usage

Owner: card.

When a resource card contains an Edit action and other independent controls.

Do: Keep navigation on the title link and actions on their own buttons.

Avoid: Make the whole card a button that contains nested links, switches or buttons.

Why: Nested interactive targets create conflicting click and keyboard behavior.

Checked by: review only. Look for: Tab through a card containing a title link and secondary controls; each target works separately and the card shell does not create a competing nested action.

Source evidence:
- src/components/v4/ui/card.tsx
- src/pages/design-system/examples/card/default.tsx

### card-surface-and-heading

Owner: card.

When the same task can use plain or framed Card treatment.

Do: Keep the title's semantic rank and content meaning unchanged across variants, and use the named header, body, action and footer slots for aligned content.

Avoid: Make a framed title tiny uppercase metadata, add another padded wrapper inside every body or turn the entire card into a click target containing buttons.

Why: Framing groups a task; it must not change hierarchy, double content insets or create nested interactions.

Checked by: review only. Look for: Compare convenience props and explicit parts with identical content in plain and framed treatments. Title rank, content edges and action access stay consistent at narrow width.

Source evidence:
- src/components/v4/ui/card.tsx
- src/pages/design-system/examples/card/default.tsx

## State guidance

- empty: Use a concise explanation inside the content area rather than an empty shell.
- overflow: Let text and actions wrap without hiding the resource name.

## Presentation rules

Do: Group one coherent task per card.

Avoid: Wrap every label and metric in separate bordered cards.

Why: Excess shells hide the page hierarchy and waste space in dense work.

## Import and exports

- src/components/v4/ui/card.tsx

Exports: Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle. Source TypeScript defines the API.

## Behavior

- Card offers framed and plain shells, a flush body and named title/description/media/action/footer slots. Framed sits on the pop ground and plain on the page, both inside one line border. Title, description, body and footer share one text column; media hangs to its left and the action centres on the title line.

## Accessibility

- Choose the heading level through the composed title; actions remain native controls with their own names.

## Use cases

- Use plain or framed treatment for a distinct resource or task, with explicit content and action slots. Keep continuous sections open.

## Limits

- Card adds no navigation role and does not choose a semantic heading level for title content.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### variant

- framed: example `default`, visible label "framed".
- plain: example `default`, visible label "plain".

### size


- default: omitted. Both cards use the default size; their captions name the variant.
- sm: omitted. sm only narrows every inset from 16px to 12px; it adds no part or behavior.

### composition

- parts: example `default`, visible label "plain".
- flush: omitted. flush only removes the body inset so a full-bleed table or list can bring its own; without that content it looks like framed.

## Executable examples

### Framed and plain

Save this example at `src/pages/design-system/examples/card/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/card, @infisical/item. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../../../components/v4/ui/card";
import { Media } from "../../../../components/v4/ui/item";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Card title="Staging service" description="Read access to staging." media={<Media icon="key"/>} action={<Button variant="ghost" size="sm" asChild>
              <a href="#field">Settings</a>
            </Button>} footer="Expires in 7 days.">
          Scoped to the payments project.
        </Card>
      </div><figcaption className="text-muted-foreground text-xs">{"framed"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Card variant="plain">
          <CardHeader>
            <CardTitle>Environment defaults</CardTitle>
            <CardDescription>Inherited by new connections.</CardDescription>
          </CardHeader>
          <CardContent>The default environment is staging.</CardContent>
          <CardFooter>Updated today</CardFooter>
        </Card>
      </div><figcaption className="text-muted-foreground text-xs">{"plain"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#card and verify the documented interaction.
