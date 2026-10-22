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

- Card offers framed and plain shells, a flush body and named title/description/action/footer slots. Framed (the default) is a borderless tint frame around a bordered inset surface: frame, then the line border, then the inset ground, then content. Only the inset carries a border, so header band, inner surface and footer band read as one card: its header row sits in the frame, with the title as an uppercase eyebrow and the action as a caption link, and the body and footer sit in an inner surface with a line border and shadow-raised. The inner surface is inset from the frame by space-3 on the sides and bottom, and on the top too when there is no header. Its radius is radius-panel minus that pad, so the corners stay concentric in soft mode and are square in square mode. With footerPlacement frame and the title, description and footer props, the header and body sit together on the inner surface with its own line border, and the footer is a band in the frame below it, padded by the frame pad, never a separate box. Plain is a single surface with one line border and no frame. The header band holds labels only: the title, with optional badges in it and an action. It never holds a framed icon or media tile; put those in the body. A footerPlacement of frame moves the footer out of the inner surface into a matching band of the frame below it, for a stats or status row under the content. Title, description, body and footer share one text column, and the action centres on the title line.

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

Registry items used: @infisical/card, @infisical/item. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "../../../../components/v4/ui/card";
import { Media } from "../../../../components/v4/ui/item";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Card title="Posture" action={<a href="#card">View report</a>}>
          412 secrets across 3 environments. 3 are missing in production and 5 rotations are due
          this week.
        </Card>
      </div><figcaption className="text-muted-foreground text-xs">{"framed"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Card footer="Expires in 7 days.">
          <div className="flex items-center gap-3">
            <Media icon="key"/>
            <span>Read access to staging, scoped to the payments project.</span>
          </div>
        </Card>
      </div><figcaption className="text-muted-foreground text-xs">{"framed, no header, with footer"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Card footer="412 secrets in 3 environments, 5 rotations due" footerPlacement="frame">
          Read access to staging, scoped to the payments project.
        </Card>
      </div><figcaption className="text-muted-foreground text-xs">{"framed footer"}</figcaption></figure>
      {([
            ["w-60", "narrow, 240px"],
            ["w-80", "narrow, 320px"],
            ["w-96", "narrow, 384px"]
        ] as const).map(([width, label]) => (<figure key={width} className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
          <div className={`${width} max-w-full min-w-0`} data-narrow-card>
            <Card title="Posture" description="Rotation and drift for the payments project" action={<a href="#card">View report</a>} footer="Updated today">
              412 secrets across 3 environments.
            </Card>
          </div>
        </div><figcaption className="text-muted-foreground text-xs">{label}</figcaption></figure>))}
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
- browser: npm run dev; open /design-system#card and verify the documented interaction.
