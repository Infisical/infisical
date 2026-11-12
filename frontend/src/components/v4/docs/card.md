# Card

Group one resource or task with its own header, content and actions.

## Choose this component

Choose Card when one resource or task has its own heading, content and actions. Use plain sections for a continuous form and List for comparable rows.

## Usage rules

### card-usage

Owner: card.

When a resource card contains an Edit action and other independent controls.

Do: Keep navigation on the title link, as a CardLink when the whole card should open it, and actions on their own buttons.

Avoid: Make the whole card a button or wrap it in an anchor that contains nested links, switches or buttons.

Why: Nested interactive targets create conflicting click and keyboard behavior.

Checked by: review only. Look for: Tab through a card containing a title link and secondary controls; each target works separately and the card shell does not create a competing nested action.

Source evidence:
- src/components/v4/ui/card.tsx
- src/pages/design-system/examples/card/default.tsx
- src/pages/design-system/examples/card/link.tsx

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
- src/components/v4/ui/row-link.module.css

Exports: Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardLink, CardTitle. Source TypeScript defines the API.

## Behavior

- Card offers plain and framed shells, a flush body and named title/description/action/footer slots. Plain (the default) is a single surface with one line-soft border and no frame: use it, or no card at all, for a standalone card. Framed is for emphasis, such as the org overview product cards and project cards with a footer band, and for section cards that head a part of a page, such as a detail page's Details sidecar, a roles or authentication section and settings sections; set variant framed on those. Framed is a borderless tint frame around a bordered inset surface: frame, then the line border, then the inset ground, then content. Only the inset carries a border, so header band, inner surface and footer band read as one card: its header row sits in the frame, with the title as an uppercase eyebrow and the action as a caption link, and the body and footer sit in an inner surface with a line border and shadow-raised. The inner surface is inset from the frame by space-3 on the sides and bottom, and on the top too when there is no header. With footerPlacement frame and the title, description and footer props, the header and body sit together on the inner surface with its own line border, and the footer is a band in the frame below it, padded by the frame pad, never a separate box. description is optional: use a short line where it tells cards in a set apart or scopes the card, never to restate the title. In a grid that stretches its items, the body grows to fill the card, so a row of framed cards keeps level bottoms and footer bands. The header band holds labels only: the title, with optional badges in it and an action. It never holds a framed icon or media tile; put those in the body. A footerPlacement of frame moves the footer out of the inner surface into a matching band of the frame below it, for a stats or status row under the content. Title, description, body and footer share one text column. The framed header band centers its label and action vertically, so the label sits at the same height in every band whether the action is a link, an xs Button, an xs search Input or nothing. A plain Card whose children are raw content rather than CardHeader, CardContent or CardFooter pads them by the body inset, as a framed body does, and flush removes it. A Card never frames inside another frame: inside a framed Card, a List, a DataTable or a CodeBlock, variant framed drops to plain.
- CardLink makes the whole Card a link with RowLink's semantics. It takes link, the app's link target, and renders one real anchor through CipherLink, so a TanStack app gets typed to, params, search and hash and a real href, and an absolute URL in to renders a plain external href. Put it around the card's name; its ::after covers the Card, which becomes the positioning context through :has() and takes a translucent ink hover. Buttons, inputs, other links, tooltip triggers and anything marked data-row-interactive inside the Card sit above the overlay and keep their own click. Unlike RowLink, the text wraps instead of truncating. disabled renders a muted span with no href and no overlay, so the Card stays visible and does not navigate.

## Accessibility

- Choose the heading level through the composed title; actions remain native controls with their own names.
- A Card with a CardLink has one link target: middle-click and Ctrl, Cmd or Shift-click open it in a new tab or window, and copy link and the status bar work. Keyboard focus lands on the link and draws the ink focus ring around the whole Card. A disabled CardLink has role link and aria-disabled true.

## Use cases

- Use plain or framed treatment for a distinct resource or task, with explicit content and action slots. Keep continuous sections open.

## Limits

- Card adds no navigation role and does not choose a semantic heading level for title content.
- Use one CardLink per Card; a second stretched target would cover the first. Do not also put a RowLink in the same Card.

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

Registry items used: @cipher/card, @cipher/item. Additional packages: none. Install every listed item before compiling this example.

```tsx
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "../../../../components/v4/ui/card";
import { Media } from "../../../../components/v4/ui/item";

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Card variant="framed" title="Posture" action={<a href="#card">View report</a>}>
            412 secrets across 3 environments. 3 are missing in production and 5 rotations are due
            this week.
          </Card>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"framed"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Card variant="framed" footer="Expires in 7 days.">
            <div className="flex items-center gap-3">
              <Media icon="key" />
              <span>Read access to staging, scoped to the payments project.</span>
            </div>
          </Card>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"framed, no header, with footer"}
        </figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Card
            variant="framed"
            footer="412 secrets in 3 environments, 5 rotations due"
            footerPlacement="frame"
          >
            Read access to staging, scoped to the payments project.
          </Card>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"framed footer"}</figcaption>
      </figure>
      {(
        [
          ["w-60", "narrow, 240px"],
          ["w-80", "narrow, 320px"],
          ["w-96", "narrow, 384px"]
        ] as const
      ).map(([width, label]) => (
        <figure key={width} className="m-0 flex w-full min-w-0 flex-col gap-3">
          <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
            <div className={`${width} max-w-full min-w-0`} data-narrow-card>
              <Card
                variant="framed"
                title="Posture"
                description="Rotation and drift for the payments project"
                action={<a href="#card">View report</a>}
                footer="Updated today"
              >
                412 secrets across 3 environments.
              </Card>
            </div>
          </div>
          <figcaption className="text-muted-foreground text-xs">{label}</figcaption>
        </figure>
      ))}
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Card variant="plain">
            <CardHeader>
              <CardTitle>Environment defaults</CardTitle>
              <CardDescription>Inherited by new connections.</CardDescription>
            </CardHeader>
            <CardContent>The default environment is staging.</CardContent>
            <CardFooter>Updated today</CardFooter>
          </Card>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"plain"}</figcaption>
      </figure>
    </div>
  );
}
```

### Whole-card link

Save this example at `src/pages/design-system/examples/card/link.tsx`; its relative imports are generated for that exact path. States: default, disabled, keyboard.

Registry items used: @cipher/badge, @cipher/button, @cipher/card, @cipher/provider-icon, @cipher/text. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Badge } from "../../../../components/v4/ui/badge";
import { Button } from "../../../../components/v4/ui/button";
import { Card, CardLink } from "../../../../components/v4/ui/card";
import { ProviderIcon } from "../../../../components/v4/ui/provider-icon";
import { SmallText } from "../../../../components/v4/ui/text";

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Card variant="framed">
            <div className="flex items-start gap-3">
              <ProviderIcon icon="Infisical.png" alt="" size="xl" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <CardLink
                  link={{ href: "/design-system/components/data-display/detail" }}
                >
                  Detail
                </CardLink>
                <SmallText muted>
                  Stacked label and value pairs for the details of one resource.
                </SmallText>
                <div className="flex items-center gap-2">
                  <Badge tone="soft">Data display</Badge>
                  <Button variant="link" size="sm" asChild>
                    <a href="#row-link">Compare with RowLink</a>
                  </Button>
                </div>
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
          {"Whole card opens Detail; the copy button and docs link keep their own click"}
        </figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Card variant="framed">
            <div className="flex items-start gap-3">
              <ProviderIcon icon="Kafka.png" alt="" size="xl" />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <CardLink
                  link={{ href: "/design-system/components/data-display/detail" }}
                  disabled
                >
                  Unreleased page
                </CardLink>
                <SmallText muted>Opens once the page ships.</SmallText>
              </div>
            </div>
          </Card>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Disabled: no href, no overlay"}
        </figcaption>
      </figure>
    </div>
  );
}
```

### Band actions

Save this example at `src/pages/design-system/examples/card/band-actions.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @cipher/button, @cipher/card, @cipher/input. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import { Card } from "../../../../components/v4/ui/card";
import { Input } from "../../../../components/v4/ui/input";

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Card variant="framed" title="Members">
            12 members, 3 pending invites.
          </Card>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"no action"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Card
            variant="framed"
            title="Members"
            action={
              <Button variant="outline" size="xs" icon="plus">
                Invite
              </Button>
            }
          >
            12 members, 3 pending invites.
          </Card>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"xs Button"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Card
            variant="framed"
            title="Members"
            action={
              <Input size="xs" icon="search" placeholder="Search" aria-label="Search members" />
            }
          >
            12 members, 3 pending invites.
          </Card>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"xs search Input"}</figcaption>
      </figure>
    </div>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- runtime: npm test -- src/components/v4/ui/card.test.tsx
- browser: npm run dev; open /design-system#card and verify the documented interaction.
