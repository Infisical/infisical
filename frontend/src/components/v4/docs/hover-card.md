# Hover Card

Show supplementary information on hover or keyboard focus.

## Choose this component

Choose HoverCard for optional supporting information about a visible link. Use Popover for an intentional interactive panel and Tooltip for a short control explanation.

## Usage rules

### hover-card-usage

Owner: hover-card.

When a linked identity has an email and role preview.

Do: Keep the visible link sufficient to identify the destination and show optional details in the preview.

Avoid: Hide required instructions, permission explanations or task controls only in the hover preview, or make its only destination a dead link.

Why: Hover previews are supplemental and cannot be the only route to complete the task.

Checked by: review only. Look for: Use the linked object without opening its preview. Required identity, destination and task instructions remain available, and keyboard focus can reveal supplemental information.

Source evidence:
- src/components/v4/ui/hover-card.tsx
- src/pages/design-system/examples/hover-card/default.tsx

## State guidance

- focus: Ensure the trigger remains a meaningful keyboard-accessible link.
- missing-data: Omit unknown metadata rather than presenting invented identity details.

## Presentation rules

Do: Keep the preview concise and tied to the linked object.

Avoid: Turn every noun on the page into a rich hover card.

Why: Excess previews distract from reading and do not replace page hierarchy.

## Import and exports

- src/components/v4/ui/hover-card.tsx

Exports: HoverCard, HoverCardContent, HoverCardTrigger. Source TypeScript defines the API.

## Behavior

- Radix HoverCard owns open/onOpenChange and hover delays; Content is scoped to V4Scope and accepts alignment and side offset.

## Accessibility

- HoverCard is supplementary preview content, not a keyboard task surface. Keep the trigger's destination and essential information available without opening it.

## Use cases

- Keep the link destination and necessary information in persistent content, then use HoverCard for optional supporting details.

## Avoid

- Put the only permission explanation or an essential edit action inside hover-only content.

## Limits

- Keep essential instructions and actions in persistent content rather than only in the hover card.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### Side

- top: example `placements`, visible label "top / start".
- right: example `placements`, visible label "right / center".
- bottom: example `placements`, visible label "bottom / end".
- left: example `placements`, visible label "left / center".

### Alignment

- start: example `placements`, visible label "top / start".
- center: example `placements`, visible label "right / center".
- end: example `placements`, visible label "bottom / end".

## Executable examples

### Linked connection

Save this example at `src/pages/design-system/examples/hover-card/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/hover-card. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import * as UI from "../../../../components/v4/ui/hover-card";
export default function Example() {
    const [inspected, setInspected] = useState(false);
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <UI.HoverCard>
        <UI.HoverCardTrigger asChild>
          <a href="#hover-card" onClick={(event) => {
            event.preventDefault();
            setInspected(true);
        }}>
            Staging connection
          </a>
        </UI.HoverCardTrigger>
        <UI.HoverCardContent>
          <p>Last synchronized 12 versions.</p>
          <p>All clients are up to date.</p>
        </UI.HoverCardContent>
      </UI.HoverCard>
      {inspected && (<p role="status" className="sr-only mt-4">
          Staging connection selected in this local example.
        </p>)}
    </div>);
}
```

### Placements

Save this example at `src/pages/design-system/examples/hover-card/placements.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/hover-card. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import * as UI from "../../../../components/v4/ui/hover-card";
const placements = [
    { side: "top", align: "start" },
    { side: "right", align: "center" },
    { side: "bottom", align: "end" },
    { side: "left", align: "center" }
] as const;
export default function Example() {
    const [selected, setSelected] = useState("");
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      {placements.map(({ side, align }) => (<figure key={side} className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
          <UI.HoverCard>
            <UI.HoverCardTrigger asChild>
              <a href="#hover-card" aria-label={`Staging connection / ${side} / ${align}`} onClick={(event) => {
                event.preventDefault();
                setSelected(`${side} / ${align}`);
            }}>
                Staging connection
              </a>
            </UI.HoverCardTrigger>
            <UI.HoverCardContent side={side} align={align} style={{ minWidth: 0, maxWidth: "var(--radix-hover-card-content-available-width)" }}>
              <p>Staging connection</p>
              <p>12 versions synchronized. Read access belongs to the Platform team.</p>
            </UI.HoverCardContent>
          </UI.HoverCard>
        </div><figcaption className="text-muted-foreground text-xs">{<>
              {side} / {align}
            </>}</figcaption></figure>))}
      {selected && (<p role="status" className="sr-only">
          Staging connection selected locally, {selected}.
        </p>)}
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#hover-card and verify the documented interaction.
