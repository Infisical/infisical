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

- Open menus retain Radix typeahead and directional keys. Shortcut text requires a matching host handler.
- Radix Root owns open/onOpenChange. Action items close after onSelect; checkbox/radio changes stay open by default and can opt into closeOnSelect.

## Accessibility

- A named trigger opens the menu. Typing a letter jumps to a matching item, arrow keys skip disabled items and focus returns to the trigger on close. Use checkbox or radio items for persistent selection.

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

Registry items used: @infisical/button, @infisical/dropdown-menu. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Button } from "../../../../components/v4/ui/button";
import * as UI from "../../../../components/v4/ui/dropdown-menu";
export default function Example() {
    const [checked, setChecked] = useState(false);
    const [metadata, setMetadata] = useState(false);
    const [details, setDetails] = useState(false);
    const [archived, setArchived] = useState(false);
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
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
            <UI.DropdownMenuCheckboxItem checked={metadata} onCheckedChange={setMetadata} closeOnSelect>
              Show metadata and close
            </UI.DropdownMenuCheckboxItem>
            <UI.DropdownMenuSeparator />
            <UI.DropdownMenuItem disabled>Delete protected environment</UI.DropdownMenuItem>
          </UI.DropdownMenuContent>
        </UI.DropdownMenu>
        {details && <p className="text-sm">Staging connection</p>}
      </div><figcaption className="text-muted-foreground text-xs">{"default"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
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
        {archived && (<p role="status" className="sr-only text-sm">
            Environment archived
          </p>)}
      </div><figcaption className="text-muted-foreground text-xs">{"destructive"}</figcaption></figure>
    </div>);
}
```

### Checked states

Save this example at `src/pages/design-system/examples/dropdown-menu/states.tsx`; its relative imports are generated for that exact path. States: default, disabled.

Registry items used: @infisical/button, @infisical/dropdown-menu. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Button } from "../../../../components/v4/ui/button";
import * as UI from "../../../../components/v4/ui/dropdown-menu";
const stateLabel = (checked: boolean | "indeterminate") => {
    if (checked === "indeterminate")
        return "Mixed";
    return checked ? "Checked" : "Unchecked";
};
export default function Example() {
    const [selected, setSelected] = useState(false);
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      {([false, true, "indeterminate"] as const).map((checked) => (<figure key={String(checked)} className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
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
              <UI.DropdownMenuItem onSelect={() => setSelected(true)}>
                Connection details
              </UI.DropdownMenuItem>
            </UI.DropdownMenuContent>
          </UI.DropdownMenu>
        </div><figcaption className="text-muted-foreground text-xs">{stateLabel(checked)}</figcaption></figure>))}
      {selected && (<p role="status" className="sr-only">
          Staging connection: vault.example.test
        </p>)}
    </div>);
}
```

### Placements

Save this example at `src/pages/design-system/examples/dropdown-menu/placements.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/dropdown-menu. Additional packages: none. Install every listed item before compiling this example.

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
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      {placements.map(({ side, align }) => (<figure key={side} className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
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
        </div><figcaption className="text-muted-foreground text-xs">{`${side} / ${align}`}</figcaption></figure>))}
      {selected && (<p role="status" className="sr-only">
          Staging connection: vault.example.test
        </p>)}
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#dropdown-menu and verify the documented interaction.
