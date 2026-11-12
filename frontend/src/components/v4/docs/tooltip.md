# Tooltip

Explain a control on hover and keyboard focus.

## Choose this component

Choose Tooltip for a short supplemental control explanation. Use FieldDescription for required input guidance and Popover for interactive content.

## Usage rules

### tooltip-text

Owner: tooltip.

When plain text, a timestamp or a status needs a longer explanation, and the text itself is what carries it.

Do: Wrap the text in TooltipText with the explanation as content, or pass asChild to make StatusText or MiddleTruncate the focusable text.

Avoid: Hand-roll a span with tabIndex 0 under Tooltip, use TooltipText to make text look or act like a button or link, or put a reason for a blocked action on nearby text instead of the action's own disabledReason.

Why: Keyboard users reach the explanation the same way pointer users do, with one focus treatment, while the text keeps its non-interactive meaning.

Checked by: review only. Look for: Tab to each TooltipText in the text example: the focus outline shows on the text and the tooltip opens without a pointer, and the text has no button or link role or styling.

Source evidence:
- src/components/v4/ui/tooltip.tsx
- src/pages/design-system/examples/tooltip/text.tsx

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
- src/components/v4/ui/controls.module.css
- src/components/v4/ui/tooltip-scope.test.tsx

Exports: Tooltip, TooltipContent, TooltipProvider, TooltipScope, TooltipText, TooltipTrigger. Source TypeScript defines the API.

## Behavior

- The shortcut specimen owns a Mod+K binding scoped to its focused region. Its button and binding open the same local search, which filters fictional connections and exposes the selected record. Editing and composition keys remain with their controls.
- Tooltip opens after a hover delay and immediately from keyboard focus (Tab, arrow keys, Home and End); side, alignment and a displayed shortcut are explicit.
- Tooltips are pass-through: the content has pointer-events none and user-select none, and hoverable content is disabled, so it closes as soon as the pointer leaves the trigger and whatever sits under it stays clickable. Content meant to be read, selected or copied belongs in HoverCard, and content with actions in Popover.
- A tooltip never reopens on its own. When a closing menu, dialog or sheet returns focus to the trigger, the tooltip stays closed; only keyboard navigation focus opens it. After a click on the trigger, it stays closed until the pointer leaves the trigger and comes back.
- TooltipText makes non-interactive text the tooltip trigger: it renders a span with tabIndex 0 (or, with asChild, puts that on its one child, such as StatusText or MiddleTruncate), draws the shared focus outline on keyboard focus and opens its content on hover and on focus. It adds no other styling, so the text keeps its own type and color. Inside a row with onRowActivate or a TableRow onClick, a click on it never activates the row.
- TooltipScope shares one tooltip among every Tooltip inside it. Each trigger renders only its own element, marked with data-v4-tooltip, and registers its content, shortcut, side and align with the scope; there is no Radix root per trigger. The scope mounts a single Radix tooltip on the first hover or keyboard focus and moves it to whichever trigger is hovered or focused, so the hover delay, the skip delay between neighboring triggers, side, align, the collision boundary, the V4Scope portal and theme, Escape, close on scroll and reduced motion are Radix's own. While it shows, the trigger gets aria-describedby pointing at the shared content unless it already has one. Content can be any node. Table renders a TooltipScope around its rows, so Tooltip, TooltipText, Button disabledReason and RowActions inside any Table or DataTable take the shared path with no change at the call site. A Tooltip that sets open, defaultOpen, onOpenChange, delayDuration or hoverable content keeps its own root, inside a scope or not.
- Content renders as one inline text run beside the shortcut, so inline code stays inside the sentence. It grows to size-tooltip-max (320px) and then wraps, breaking long inline code so it never runs past the surface. Content resets white-space, so a trigger inside a nowrap table cell or menu row never forces one long line; wrap is deprecated and has no effect. Menus, popovers, hover cards, dialogs and sheets reset white-space the same way.

## Accessibility

- The trigger retains its own accessible name. Tooltip shortcut text describes a host binding; it does not register a hotkey.
- Inside a TooltipScope, the shared content has role tooltip and the active trigger references it through aria-describedby only while it shows, as a standalone Tooltip does. Button disabledReason keeps aria-description on the button, so the reason is read even before the tooltip opens.

## Use cases

- Name the control independently, keep Tooltip text supplementary and show only shortcuts the host actually binds.

## Avoid

- Put buttons, essential errors or the only action name inside Tooltip content.

## Limits

- Tooltip content is supplementary text, not a place for focusable actions. A displayed shortcut does not register its binding.
- A natively disabled Button takes no pointer or focus events, so a Tooltip around it never opens, and a span anchor around it opens on hover but never on keyboard focus. Explain a blocked Button with its disabledReason, which renders this Tooltip itself; ui:lint fails a natively disabled Button written inside Tooltip or TooltipTrigger (rule/disabled-reason-tooltip).

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

Registry items used: @cipher/button, @cipher/tooltip. Additional packages: none. Install every listed item before compiling this example.

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

Registry items used: @cipher/button, @cipher/tooltip. Additional packages: none. Install every listed item before compiling this example.

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
  return (
    <TooltipProvider>
      <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] items-start justify-items-center gap-x-6 gap-y-8">
        {placements.map(({ side, align }) => (
          <figure
            key={side}
            className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center"
          >
            <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
              <Tooltip side={side} align={align} content="Connection status">
                <Button variant="outline">align {align}</Button>
              </Tooltip>
            </div>
            <figcaption className="text-muted-foreground text-xs">{side}</figcaption>
          </figure>
        ))}
      </div>
    </TooltipProvider>
  );
}
```

### Shortcut and controlled parts

Save this example at `src/pages/design-system/examples/tooltip/parts.tsx`; its relative imports are generated for that exact path. States: controlled, keyboard.

Registry items used: @cipher/button, @cipher/command-menu, @cipher/tooltip. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { type KeyboardEvent, useRef, useState } from "react";

import { Button } from "../../../../components/v4/ui/button";
import { CommandMenu } from "../../../../components/v4/ui/command-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from "../../../../components/v4/ui/tooltip";

export default function Example() {
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState(false);
  const shortcut = (event: KeyboardEvent<HTMLElement>) => {
    if (
      event.defaultPrevented ||
      event.repeat ||
      event.nativeEvent.isComposing ||
      event.key.toLowerCase() !== "k" ||
      !(event.metaKey || event.ctrlKey) ||
      (event.metaKey && event.ctrlKey) ||
      event.altKey ||
      event.shiftKey
    )
      return;
    if (
      event.target instanceof HTMLElement &&
      event.target.closest(
        'input, textarea, select, [role="textbox"], [role="combobox"], [contenteditable]:not([contenteditable="false"])'
      )
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    setSearch(true);
  };
  return (
    <section onKeyDownCapture={shortcut} aria-label="Tooltip actions">
      <TooltipProvider>
        <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] items-start justify-items-center gap-x-6 gap-y-8">
          <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
            <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
              <Tooltip content="Open search" shortcut="mod+K">
                <Button ref={trigger} variant="outline" onClick={() => setSearch(true)}>
                  Search components
                </Button>
              </Tooltip>
            </div>
            <figcaption className="text-muted-foreground text-xs">{"Shortcut hint"}</figcaption>
          </figure>
          <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
            <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
              <Tooltip open={open} onOpenChange={setOpen}>
                <TooltipTrigger asChild>
                  <Button variant="outline" asChild>
                    <a href="#field">Retention settings</a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Versions remain available for 30 days.</TooltipContent>
              </Tooltip>
            </div>
            <figcaption className="text-muted-foreground text-xs">
              {"Controlled content"}
            </figcaption>
          </figure>
        </div>
        <CommandMenu
          hotkey={false}
          open={search}
          onOpenChange={setSearch}
          label="Find a component"
          groups={[
            {
              label: "Components",
              items: [
                { id: "input", label: "Input", href: "#input" },
                { id: "table", label: "Table", href: "#table" }
              ]
            }
          ]}
        />
      </TooltipProvider>
    </section>
  );
}
```

### Focusable text

Save this example at `src/pages/design-system/examples/tooltip/text.tsx`; its relative imports are generated for that exact path. States: default, keyboard.

Registry items used: @cipher/text, @cipher/tooltip. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { StatusText } from "../../../../components/v4/ui/text";
import { TooltipProvider, TooltipText } from "../../../../components/v4/ui/tooltip";

export default function Example() {
  return (
    <TooltipProvider>
      <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] items-start gap-x-6 gap-y-8">
        <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
          <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
            <p className="text-sm">
              Last rotated <TooltipText content="2026-10-29 14:02 UTC">7 days ago</TooltipText>
            </p>
          </div>
          <figcaption className="text-muted-foreground text-xs">{"Plain text"}</figcaption>
        </figure>
        <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
          <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
            <TooltipText
              asChild
              content="Auto-scan is disabled. Pushes to this repository do not trigger a scan."
            >
              <StatusText icon="clock">Paused</StatusText>
            </TooltipText>
          </div>
          <figcaption className="text-muted-foreground text-xs">
            {"StatusText through asChild"}
          </figcaption>
        </figure>
      </div>
    </TooltipProvider>
  );
}
```

### Blocked actions

Save this example at `src/pages/design-system/examples/tooltip/disabled.tsx`; its relative imports are generated for that exact path. States: disabled, keyboard, loading.

Registry items used: @cipher/button, @cipher/tooltip. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import { Tooltip, TooltipProvider } from "../../../../components/v4/ui/tooltip";

const reason = "Only project admins can export secrets.";

export default function Example() {
  return (
    <TooltipProvider>
      <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] items-start justify-items-center gap-x-6 gap-y-8">
        <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
          <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
            <Button variant="outline" icon="download" disabledReason={reason}>
              Export
            </Button>
          </div>
          <figcaption className="text-muted-foreground text-xs">
            {"Blocked: hover or Tab shows why"}
          </figcaption>
        </figure>
        <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
          <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
            <Tooltip content="Export secrets">
              <Button variant="outline" icon="download">
                Export
              </Button>
            </Tooltip>
          </div>
          <figcaption className="text-muted-foreground text-xs">
            {"Enabled: the label tooltip"}
          </figcaption>
        </figure>
        <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
          <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
            <Button variant="outline" icon="download" loading>
              Export
            </Button>
          </div>
          <figcaption className="text-muted-foreground text-xs">
            {"Pending: loading, no tooltip"}
          </figcaption>
        </figure>
      </div>
    </TooltipProvider>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run dev; open /design-system#tooltip and verify the documented interaction.
