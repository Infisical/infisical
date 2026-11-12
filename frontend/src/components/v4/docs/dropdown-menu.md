# Dropdown Menu

Choose an action or setting from a trigger menu.

## Choose this component

Choose DropdownMenu for a short set of actions or checked preferences behind a visible trigger. Use Popover for editable controls and Select for a form value.

## Usage rules

### dropdown-menu-usage

Owner: dropdown-menu.

When a menu includes a dangerous operation among ordinary actions.

Do: Separate the destructive item, name its consequence, and let the host confirm when necessary.

Avoid: Put a multi-field form or an unguarded irreversible action in a generic More menu.

Why: Menu selection closes quickly and is unsuitable for a draft that needs validation.

Checked by: review only. Look for: Use the menu with keyboard only. Action items do what their labels name, checked items reflect owner state and editable tasks use a suitable form surface.

Source evidence:
- src/components/v4/ui/dropdown-menu.tsx
- src/pages/design-system/examples/dropdown-menu/default.tsx

### dropdown-menu-nested-layers

Owner: dropdown-menu.

When an overlay opens from inside another one: a submenu, a popover, select or dialog launched from a menu, or a tooltip inside a popover.

Do: Let every overlay portal into the V4Scope container at the one overlay layer (z-50). The child opens after its parent, so it mounts later in that container and paints above it.

Avoid: Render overlay content inline inside another overlay, or give one overlay a higher z-index or an isolating className to win a stacking fight.

Why: Inline content is clipped by its parent's overflow and placed in its parent's transformed frame, so a submenu that flips can land behind the panel it came from.

Checked by: src/components/v4/ui/overlay-regressions.test.tsx. Opens a submenu from an open DropdownMenu and checks the submenu sits outside the parent panel, in the same scope container, after it in DOM order.

Source evidence:
- src/components/v4/ui/dropdown-menu.tsx

## State guidance

- checked: Control checkbox and radio items from actual preference state.
- pending: Keep continuing operation feedback outside the menu after it closes.

## Presentation rules

Do: Keep the trigger label tied to the object or action set.

Avoid: Use several adjacent unlabeled ellipsis buttons for different action sets.

Why: Identical hidden menus make the correct action hard to locate.

## Import and exports

- src/components/v4/ui/dropdown-menu.tsx
- src/components/v4/ui/menu-content.tsx

Exports: DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuPortal, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger. Source TypeScript defines the API.

## Behavior

- Highlighted, open and active rows use a translucent ink overlay at the shared hover token, so the menu surface behind shows through; they never take an opaque fill.
- Open menus retain Radix typeahead and directional keys. Shortcut text requires a matching host handler.
- Radix Root owns open/onOpenChange. Action items close after onSelect; checkbox/radio changes stay open by default and can opt into closeOnSelect.
- DropdownMenuItem, DropdownMenuCheckboxItem and DropdownMenuRadioItem take an optional description, a muted second line under the label. A disabled item uses it for the reason it is unavailable, so the action or setting stays visible and explains itself.
- DropdownMenuItem takes disabledReason for an action blocked by a permission or state: the item stays in the keyboard order, dims like a disabled row, shows the reason in place of its description (under an element label and inside an asChild child too), exposes it as the accessible description, and choosing it with Enter or Space does nothing and keeps the menu open, so onSelect never runs. Prefer it to disabled with a description whenever the person should be able to reach the reason by keyboard.
- DropdownMenuSubContent portals into the V4Scope container like the root menu, never inside its parent panel, so the parent's overflow and entry motion cannot clip or hide it. It opens beside its SubTrigger row: sideOffset 4 (space-4) and alignOffset -3 (the menu inset) line its first row up with the trigger, and when the trailing side has no room within the collision padding (8, space-8) it flips to the leading side, still beside the parent and never over it.

## Accessibility

- A named trigger opens the menu. Typing a letter jumps to a matching item, arrow keys skip disabled items (but stop on an item with disabledReason, which is announced as unavailable with its reason) and focus returns to the trigger on close. Use checkbox or radio items for persistent selection.
- DropdownMenuTrigger defers to Button. Without asChild it renders an outline Button; with asChild it adds nothing, so rest, hover, open, focus and disabled all come from the Button. No tint is ever drawn inside a bordered control.
- The panel follows the shared menu recipe: pop ground, pop-line edge and shadow-pop, a 3px inset on all four sides, and 32px rows that are inset square blocks. Separators run edge to edge; rows and their tints never do.
- Two translucent thumbs mark rows: a hover thumb that follows the pointer and keyboard and stays on the last row while the pointer is anywhere in the panel, and a selection thumb on the checked or current item that shows only while the hover thumb is hidden. Both appear in place on open and glide between rows after that; the current item keeps its weight and check while the hover thumb is elsewhere. A row whose submenu, flyout or popover is open (aria-haspopup with aria-expanded true) keeps the hover thumb while the pointer is in that popover and the selection thumb stays hidden; on close the hover thumb goes back to the pointer, or hands off to the selection thumb if the pointer has left.

## Use cases

- Use Item, CheckboxItem and RadioItem for their actual action or value contract, and prevent default dismissal only when continued interaction is needed.

## Avoid

- Style ordinary items to look checked, add buttons inside menu items or announce success merely because the menu closed.

## Limits

- Menu checked state and action effects are caller-owned; menu dismissal does not mean an operation succeeded.

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

### DropdownMenuItem.variant

- default: example `default`, visible label "default".
- destructive: example `default`, visible label "destructive".

### Inset

- false: example `default`, visible label "Show archived".
- true: omitted. Inset reserves the icon column for a plain row beside rows that carry icons. The example menu has no icons.

### Close on select

- false: example `default`, visible label "Show archived".
- true: example `default`, visible label "Show metadata and close".

### Checked

- false: example `states`, visible label "false selection".
- true: example `states`, visible label "true selection".
- indeterminate: example `states`, visible label "Mixed selection".

## Executable examples

### Environment actions

Save this example at `src/pages/design-system/examples/dropdown-menu/default.tsx`; its relative imports are generated for that exact path. States: default, disabled.

Registry items used: @cipher/button, @cipher/dropdown-menu. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { Button } from "../../../../components/v4/ui/button";
import * as UI from "../../../../components/v4/ui/dropdown-menu";

export default function Example() {
  const [checked, setChecked] = useState(false);
  const [metadata, setMetadata] = useState(false);
  const [details, setDetails] = useState(false);
  const [archived, setArchived] = useState(false);
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] items-start justify-items-center gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <UI.DropdownMenu>
            <UI.DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Environment actions
              </Button>
            </UI.DropdownMenuTrigger>
            <UI.DropdownMenuContent>
              <UI.DropdownMenuLabel>Staging</UI.DropdownMenuLabel>
              <UI.DropdownMenuItem onSelect={() => setDetails(!details)}>
                Connection details
              </UI.DropdownMenuItem>
              <UI.DropdownMenuCheckboxItem checked={checked} onCheckedChange={setChecked}>
                Show archived
              </UI.DropdownMenuCheckboxItem>
              <UI.DropdownMenuCheckboxItem
                checked={metadata}
                onCheckedChange={setMetadata}
                closeOnSelect
              >
                Show metadata and close
              </UI.DropdownMenuCheckboxItem>
              <UI.DropdownMenuSeparator />
              <UI.DropdownMenuItem disabled description="Turn off protection first">
                Delete protected environment
              </UI.DropdownMenuItem>
            </UI.DropdownMenuContent>
          </UI.DropdownMenu>
          {details && <p className="text-sm">Staging connection</p>}
        </div>
        <figcaption className="text-muted-foreground text-xs">{"default"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <UI.DropdownMenu>
            <UI.DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Archive actions
              </Button>
            </UI.DropdownMenuTrigger>
            <UI.DropdownMenuContent>
              <UI.DropdownMenuLabel>Staging</UI.DropdownMenuLabel>
              <UI.DropdownMenuItem variant="destructive" onSelect={() => setArchived(true)}>
                Archive environment
              </UI.DropdownMenuItem>
            </UI.DropdownMenuContent>
          </UI.DropdownMenu>
          {archived && (
            <p role="status" className="sr-only text-sm">
              Environment archived
            </p>
          )}
        </div>
        <figcaption className="text-muted-foreground text-xs">{"destructive"}</figcaption>
      </figure>
    </div>
  );
}
```

### Checked states

Save this example at `src/pages/design-system/examples/dropdown-menu/states.tsx`; its relative imports are generated for that exact path. States: default, disabled.

Registry items used: @cipher/button, @cipher/dropdown-menu. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { Button } from "../../../../components/v4/ui/button";
import * as UI from "../../../../components/v4/ui/dropdown-menu";

const stateLabel = (checked: boolean | "indeterminate") => {
  if (checked === "indeterminate") return "Mixed";
  return checked ? "Checked" : "Unchecked";
};
export default function Example() {
  const [selected, setSelected] = useState(false);
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] items-start justify-items-center gap-x-6 gap-y-8">
      {([false, true, "indeterminate"] as const).map((checked) => (
        <figure
          key={String(checked)}
          className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center"
        >
          <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
            <UI.DropdownMenu>
              <UI.DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Open menu
                </Button>
              </UI.DropdownMenuTrigger>
              <UI.DropdownMenuContent>
                <UI.DropdownMenuCheckboxItem checked={checked} disabled>
                  Include deployment-client metadata and inherited environment permissions
                </UI.DropdownMenuCheckboxItem>
                <UI.DropdownMenuCheckboxItem checked={checked} disabled description="Access denied">
                  Multi-line encoding
                </UI.DropdownMenuCheckboxItem>
                <UI.DropdownMenuItem onSelect={() => setSelected(true)}>
                  Connection details
                </UI.DropdownMenuItem>
              </UI.DropdownMenuContent>
            </UI.DropdownMenu>
          </div>
          <figcaption className="text-muted-foreground text-xs">{stateLabel(checked)}</figcaption>
        </figure>
      ))}
      {selected && (
        <p role="status" className="sr-only">
          Staging connection: vault.example.test
        </p>
      )}
    </div>
  );
}
```

### Placements

Save this example at `src/pages/design-system/examples/dropdown-menu/placements.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @cipher/button, @cipher/dropdown-menu. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { Button } from "../../../../components/v4/ui/button";
import * as UI from "../../../../components/v4/ui/dropdown-menu";

const placements = [
  { side: "top", align: "start" },
  { side: "right", align: "center" },
  { side: "bottom", align: "end" },
  { side: "left", align: "center" }
] as const;
export default function Example() {
  const [selected, setSelected] = useState(false);
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] items-start justify-items-center gap-x-6 gap-y-8">
      {placements.map(({ side, align }) => (
        <figure
          key={side}
          className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center"
        >
          <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
            <UI.DropdownMenu>
              <UI.DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm">
                  Open menu
                </Button>
              </UI.DropdownMenuTrigger>
              <UI.DropdownMenuContent side={side} align={align}>
                <UI.DropdownMenuItem onSelect={() => setSelected(true)}>
                  Connection details
                </UI.DropdownMenuItem>
                <UI.DropdownMenuItem disabled>Delete locked environment</UI.DropdownMenuItem>
              </UI.DropdownMenuContent>
            </UI.DropdownMenu>
          </div>
          <figcaption className="text-muted-foreground text-xs">{`${side} / ${align}`}</figcaption>
        </figure>
      ))}
      {selected && (
        <p role="status" className="sr-only">
          Staging connection: vault.example.test
        </p>
      )}
    </div>
  );
}
```

### Disabled with a reason

Save this example at `src/pages/design-system/examples/dropdown-menu/disabled-reason.tsx`; its relative imports are generated for that exact path. States: disabled, keyboard.

Registry items used: @cipher/button, @cipher/dropdown-menu, @cipher/icon. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import * as UI from "../../../../components/v4/ui/dropdown-menu";
import { Icon } from "../../../../components/v4/ui/icon";

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] items-start justify-items-center gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <UI.DropdownMenu>
            <UI.DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                Secret actions
              </Button>
            </UI.DropdownMenuTrigger>
            <UI.DropdownMenuContent>
              <UI.DropdownMenuItem>
                <Icon name="copy" />
                Copy value
              </UI.DropdownMenuItem>
              <UI.DropdownMenuItem disabledReason="Versioning is off for this project">
                <Icon name="history" />
                Version history
              </UI.DropdownMenuItem>
              <UI.DropdownMenuItem asChild disabledReason="Exports are off on this plan">
                <a href="https://infisical.com/docs">
                  <Icon name="download" />
                  Export
                </a>
              </UI.DropdownMenuItem>
              <UI.DropdownMenuSeparator />
              <UI.DropdownMenuItem
                variant="destructive"
                disabledReason="You need permission to delete secrets"
              >
                <Icon name="trash" />
                Delete
              </UI.DropdownMenuItem>
            </UI.DropdownMenuContent>
          </UI.DropdownMenu>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Blocked by permission"}</figcaption>
      </figure>
    </div>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run dev; open /design-system#dropdown-menu and verify the documented interaction.
