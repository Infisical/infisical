# Scroll Area

Scroll constrained content with a styled scrollbar.

## Choose this component

Choose ScrollArea for one bounded long region whose surroundings must stay visible. Use ordinary page flow for main reading content.

## Usage rules

### scroll-area-usage

Owner: scroll-area.

When a version list must stay within a fixed-height panel.

Do: Set a real height on the region and use the wrapper's built-in vertical scrollbar.

Avoid: Insert a second vertical ScrollBar inside ScrollArea or nest several scrolling shells around the same list.

Why: Duplicate and nested scrollbars obscure which region will move.

Checked by: review only. Look for: With scrollbars always visible, reach the final row by wheel, keyboard and touch. One intended region scrolls without duplicate bars or whole-page horizontal overflow.

Source evidence:
- src/components/v4/ui/scroll-area.tsx
- src/pages/design-system/examples/scroll-area/default.tsx

## State guidance

- overflow: Ensure the last row remains reachable by wheel, touch and keyboard.
- short-content: Let a short list remain quiet without implying hidden rows.

## Presentation rules

Do: Constrain only the region that needs independent scrolling.

Avoid: Put a scrollbar on every card and paragraph to force equal heights.

Why: The page becomes harder to navigate without preserving useful context.

## Import and exports

- src/components/v4/ui/scroll-area.tsx

Exports: ScrollArea, ScrollBar. Source TypeScript defines the API.

## Behavior

- Radix ScrollArea wraps a native scrolling viewport and a vertical scrollbar; additional ScrollBar parts can request a horizontal orientation.

## Accessibility

- Keep all content and controls in the viewport reachable. A named, focusable scroll region is appropriate when users must scroll it with the keyboard.

## Use cases

- Bound the viewport through layout, choose the required scroll axis and keep keyboard access to content beyond the initial view.

## Avoid

- Add ScrollArea to an unbounded region expecting it to fetch, virtualize or prevent page overflow automatically.

## Limits

- The viewport must be bounded by its layout to scroll; this component neither virtualizes rows nor fetches more content.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### type

- auto: example `variants`, visible label "auto".
- always: example `variants`, visible label "always".
- scroll: example `variants`, visible label "scroll".
- hover: example `variants`, visible label "hover".

### axis

- vertical: example `variants`, visible label "auto".
- horizontal: example `variants`, visible label "Both axes".
- both: example `variants`, visible label "Both axes".

### size support


- no authored named size: omitted. This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API.

## Executable examples

### Scroll a bounded version history

Save this example at `src/pages/design-system/examples/scroll-area/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/scroll-area. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as UI from "../../../../components/v4/ui/scroll-area";
export default function Example() {
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <UI.ScrollArea className="h-48 w-full">
        <ul className="space-y-3 p-4">
          {Array.from({ length: 20 }, (_, index) => (<li key={index}>Version {20 - index}</li>))}
        </ul>
      </UI.ScrollArea>
    </div>);
}
```

### Visibility and axes

Save this example at `src/pages/design-system/examples/scroll-area/variants.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/scroll-area. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { ScrollArea, ScrollBar } from "../../../../components/v4/ui/scroll-area";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      {(["auto", "always", "scroll", "hover"] as const).map((type) => (<figure key={type} className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
          <div className="h-28 w-full">
            <ScrollArea type={type} aria-label={`${type} version history`} className="h-full w-full">
              <ul className="space-y-2 p-3">
                {Array.from({ length: 10 }, (_, index) => (<li key={index}>Version {10 - index}</li>))}
              </ul>
            </ScrollArea>
          </div>
        </div><figcaption className="text-muted-foreground text-xs">{type}</figcaption></figure>))}
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <div className="h-36 w-full">
          <ScrollArea type="always" className="h-full w-full" aria-label="Wide version records">
            <div className="w-max space-y-2 p-3">
              {Array.from({ length: 8 }, (_, index) => (<p key={index}>
                  Version {8 - index},
                  applications/staging/services/payment-processing/configuration
                </p>))}
            </div>
            <ScrollBar orientation="horizontal"/>
          </ScrollArea>
        </div>
      </div><figcaption className="text-muted-foreground text-xs">{"Both axes"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#scroll-area and verify the documented interaction.
