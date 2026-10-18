# Tooltip

Explain a control on hover and keyboard focus.

## Choose this component

Choose Tooltip for a short supplemental control explanation. Use FieldDescription for required input guidance and Popover for interactive content.

## Usage rules

### tooltip-usage

Owner: tooltip.

When an icon-only action needs a discoverable description.

Do: Give the action its own accessible name and show the tooltip on focus as well as hover.

Avoid: Make the tooltip the icon's only programmatic label or put a required instruction only in hover text.

Why: The action must remain understandable before or without the tooltip opening.

Checked by: review only. Look for: Focus the trigger without a pointer. Its accessible name works before the tooltip opens, and required instructions remain visible when tooltip content is absent.

Source evidence:
- src/components/v4/ui/tooltip.tsx
- src/pages/design-system/examples/tooltip/default.tsx

## State guidance

- focus: Keep the same explanation available to keyboard users.
- disabled: Place essential disabled-state reasons in reachable nearby content.

## Presentation rules

Do: Explain an unfamiliar action or constraint in a few words.

Avoid: Repeat every visible button label in an identical tooltip.

Why: Redundant popups interrupt reading without supplying new information.

## Import and exports

- src/components/v4/ui/tooltip.tsx

Exports: Tooltip, TooltipContent, TooltipProvider, TooltipTrigger. Source TypeScript defines the API.

## Behavior

- The shortcut specimen owns a Mod+K binding scoped to its focused region. Its button and binding open the same local search, which filters fictional connections and exposes the selected record. Editing and composition keys remain with their controls.
- Tooltip opens after a hover delay and immediately from focus; side, alignment, wrapping and a displayed shortcut are explicit.

## Accessibility

- The trigger retains its own accessible name. Tooltip shortcut text describes a host binding; it does not register a hotkey.

## Use cases

- Name the control independently, keep Tooltip text supplementary and show only shortcuts the host actually binds.

## Avoid

- Put buttons, essential errors or the only action name inside Tooltip content.

## Limits

- Tooltip content is supplementary text, not a place for focusable actions. A displayed shortcut does not register its binding.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### side

- top: example `placements`, visible label "top".
- right: example `placements`, visible label "right".
- bottom: example `placements`, visible label "bottom".
- left: example `placements`, visible label "left".

### Alignment

- start: example `placements`, visible label "top".
- center: example `placements`, visible label "right".
- end: example `placements`, visible label "bottom".

### Wrap

- false: example `default`, visible label "Refresh".
- true: example `default`, visible label "About read access".

## Executable examples

### Wrapped help and refresh

Save this example at `src/pages/design-system/examples/tooltip/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/tooltip. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { Button } from "../../../../components/v4/ui/button";
import { Tooltip, TooltipProvider } from "../../../../components/v4/ui/tooltip";

export default function Example() {
  const [count, setCount] = useState(0);
  return (
    <TooltipProvider>
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-wrap gap-4">
          <Tooltip content="Check synchronization">
            <Button variant="outline" onClick={() => setCount(count + 1)}>
              Refresh
            </Button>
          </Tooltip>
          <Tooltip
            side="bottom"
            align="start"
            wrap
            content="Read access permits fetching values. It does not permit creating or updating secrets."
          >
            <Button variant="ghost">About read access</Button>
          </Tooltip>
        </div>
        <p role="status" className="sr-only">
          Refresh requested {count} times in this preview.
        </p>
      </div>
    </TooltipProvider>
  );
}
```

### Placements

Save this example at `src/pages/design-system/examples/tooltip/placements.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/tooltip. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import { Tooltip, TooltipProvider } from "../../../../components/v4/ui/tooltip";
const placements = [
    { side: "top", align: "start" },
    { side: "right", align: "center" },
    { side: "bottom", align: "end" },
    { side: "left", align: "center" }
] as const;
export default function Example() {
    return (<TooltipProvider>
      <div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
        {placements.map(({ side, align }) => (<figure key={side} className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
            <Tooltip side={side} align={align} wrap content="Connection status">
              <Button variant="outline">align {align}</Button>
            </Tooltip>
          </div><figcaption className="text-muted-foreground text-xs">{side}</figcaption></figure>))}
      </div>
    </TooltipProvider>);
}
```

### Shortcut and controlled parts

Save this example at `src/pages/design-system/examples/tooltip/parts.tsx`; its relative imports are generated for that exact path. States: controlled, keyboard.

Registry items used: @infisical/button, @infisical/command-menu, @infisical/tooltip. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { type KeyboardEvent, useRef, useState } from "react";
import { Button } from "../../../../components/v4/ui/button";
import { CommandMenu } from "../../../../components/v4/ui/command-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../../../../components/v4/ui/tooltip";
export default function Example() {
    const trigger = useRef<HTMLButtonElement>(null);
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState(false);
    const shortcut = (event: KeyboardEvent<HTMLElement>) => {
        if (event.defaultPrevented ||
            event.repeat ||
            event.nativeEvent.isComposing ||
            event.key.toLowerCase() !== "k" ||
            !(event.metaKey || event.ctrlKey) ||
            (event.metaKey && event.ctrlKey) ||
            event.altKey ||
            event.shiftKey)
            return;
        if (event.target instanceof HTMLElement &&
            event.target.closest('input, textarea, select, [role="textbox"], [role="combobox"], [contenteditable]:not([contenteditable="false"])'))
            return;
        event.preventDefault();
        event.stopPropagation();
        setSearch(true);
    };
    return (<section onKeyDownCapture={shortcut} aria-label="Tooltip actions">
      <TooltipProvider>
        <div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
          <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
            <Tooltip content="Open search" shortcut="mod+K">
              <Button ref={trigger} variant="outline" onClick={() => setSearch(true)}>
                Search components
              </Button>
            </Tooltip>
          </div><figcaption className="text-muted-foreground text-xs">{"Shortcut hint"}</figcaption></figure>
          <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
            <Tooltip open={open} onOpenChange={setOpen}>
              <TooltipTrigger asChild>
                <Button variant="outline" asChild>
                  <a href="#field">Retention settings</a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Versions remain available for 30 days.</TooltipContent>
            </Tooltip>
          </div><figcaption className="text-muted-foreground text-xs">{"Controlled content"}</figcaption></figure>
        </div>
        <CommandMenu hotkey={false} open={search} onOpenChange={setSearch} label="Find a component" groups={[
            {
                label: "Components",
                items: [
                    { id: "input", label: "Input", href: "#input" },
                    { id: "table", label: "Table", href: "#table" }
                ]
            }
        ]}/>
      </TooltipProvider>
    </section>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#tooltip and verify the documented interaction.
