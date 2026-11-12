# Context Menu

Expose secondary actions from a context menu.

## Choose this component

Choose ContextMenu for shortcuts on an already discoverable object. Use DropdownMenu when the action entry point must be visible.

## Usage rules

### context-menu-usage

Owner: context-menu.

When an essential action appears in a right-click menu.

Do: Provide the same action through a visible button or menu, and make the context trigger keyboard reachable.

Avoid: Make right-click the only way to inspect, copy or restore an object.

Why: Touch users and people who do not discover context menus still need the action.

Checked by: review only. Look for: Complete the essential object action without right-clicking; the visible alternative and Shift+F10 context route both reach the intended action.

Source evidence:
- src/components/v4/ui/context-menu.tsx
- src/pages/design-system/examples/context-menu/default.tsx

## State guidance

- disabled: Explain why a locked action is unavailable in surrounding object detail.
- copy: Announce copied only after the clipboard write fulfills; show a failure if it rejects.

## Presentation rules

Do: Name menu actions for the object under the pointer.

Avoid: Fill the menu with disabled coming-soon entries.

Why: Unavailable placeholders hide the actions a person can use now.

## Import and exports

- src/components/v4/ui/context-menu.tsx

Exports: ContextMenu, ContextMenuCheckboxItem, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuLabel, ContextMenuPortal, ContextMenuRadioGroup, ContextMenuRadioItem, ContextMenuSeparator, ContextMenuShortcut, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger. Source TypeScript defines the API.

## Behavior

- Highlighted, open and active rows use a translucent ink overlay at the shared hover token, so the menu surface behind shows through; they never take an opaque fill.
- Open menus retain Radix typeahead and directional keys. Shortcut text requires a matching host handler.
- ContextMenu opens from its trigger's context action. Action items call onSelect and close; checkbox/radio items stay open unless closeOnSelect is true.
- The DropdownMenu item parts (item, checkbox and radio items, label, separator, group and sub-menu) render in a ContextMenu too: ContextMenuContent sets the menu kind, and each part picks the matching Radix primitive, so one menu node renders identically, descriptions, disabled reasons and destructive styling included, as a More menu or a right-click menu. RowContextMenu uses this to open a row's actions on right-click.
- ContextMenuSubContent portals into the V4Scope container like the root menu, never inside its parent panel, so the parent's overflow and entry motion cannot clip or hide it. It opens beside its SubTrigger row: sideOffset 4 (space-4) and alignOffset -3 (the menu inset) line its first row up with the trigger, and when the trailing side has no room within the collision padding (8, space-8) it flips to the leading side, still beside the parent and never over it.

## Accessibility

- The menu takes focus, arrow keys move between items and each item is announced as a menu item. Keep essential actions available through a visible control as well.

## Use cases

- Provide a visible action path for essential operations and keep destructive consequences explicit in item labels and variant.

## Avoid

- Make right-click the only path to edit or remove a resource, or pretend root content is anchored by a side prop.

## Limits

- Provide another visible way to perform essential actions.
- ContextMenu supports open/onOpenChange after interaction establishes the pointer anchor. There is no defaultOpen prop. Root content is positioned at the pointer.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### ContextMenuItem.variant


- default: omitted. Both variants sit in the one menu: Connection details is the default row and Archive environment is destructive.
- destructive: omitted. Both variants sit in the one menu: Connection details is the default row and Archive environment is destructive.

### Inset

- false: example `default`, visible label "Show archived".
- true: omitted. Inset reserves the icon column for a plain row beside rows that carry icons. The example menu has no icons.

### Close on select

- false: example `default`, visible label "Show archived".
- true: example `default`, visible label "Show metadata and close".

### Checked

- false: example `default`, visible label "Show archived".
- true: example `default`, visible label "Show metadata and close".
- indeterminate: omitted. A mixed state belongs to a tri-state parent choice the host owns; the example has none.

### Root placement

- pointer: example `default`, visible label "Right-click this area".

## Executable examples

### Right-click region

Save this example at `src/pages/design-system/examples/context-menu/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @cipher/context-menu. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import * as UI from "../../../../components/v4/ui/context-menu";

export default function Example() {
  const [archived, setArchived] = useState(false);
  const [metadata, setMetadata] = useState(true);
  const [details, setDetails] = useState(false);
  const [done, setDone] = useState(false);
  const status = [done && "Environment archived", details && "Staging connection"]
    .filter(Boolean)
    .join(". ");
  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-6">
      <UI.ContextMenu>
        <UI.ContextMenuTrigger asChild>
          <button
            type="button"
            className="text-muted-foreground flex min-h-32 w-full items-center justify-center rounded-sm border border-dashed border-border p-4"
          >
            Right-click this area
          </button>
        </UI.ContextMenuTrigger>
        <UI.ContextMenuContent>
          <UI.ContextMenuLabel>Staging</UI.ContextMenuLabel>
          <UI.ContextMenuItem onSelect={() => setDetails(!details)}>
            Connection details
          </UI.ContextMenuItem>
          <UI.ContextMenuCheckboxItem checked={archived} onCheckedChange={setArchived}>
            Show archived
          </UI.ContextMenuCheckboxItem>
          <UI.ContextMenuCheckboxItem
            checked={metadata}
            onCheckedChange={setMetadata}
            closeOnSelect
          >
            Show metadata and close
          </UI.ContextMenuCheckboxItem>
          <UI.ContextMenuSeparator />
          <UI.ContextMenuItem variant="destructive" onSelect={() => setDone(true)}>
            Archive environment
          </UI.ContextMenuItem>
        </UI.ContextMenuContent>
      </UI.ContextMenu>
      <p role="status" className="sr-only text-sm">
        {status}
      </p>
    </div>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run dev; open /design-system#context-menu and verify the documented interaction.
