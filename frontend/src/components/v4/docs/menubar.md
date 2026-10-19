# Menubar

Group application menus with keyboard navigation.

## Choose this component

Choose Menubar for a persistent desktop-style command surface. Use NavigationMenu for website destinations and DropdownMenu for a single object's actions.

## Usage rules

### menubar-usage

Owner: menubar.

When the top row opens command menus rather than navigating to pages.

Do: Group related commands under specific menu names and keep checked preferences controlled.

Avoid: Use menuitem behavior for an ordinary collection of destination links.

Why: Command menus have a keyboard model that differs from page navigation.

Checked by: review only. Look for: Open categories with keyboard, activate a command and change a checked preference; the row behaves as command menus rather than pretending to be ordinary page navigation.

Source evidence:
- src/components/v4/ui/menubar.tsx
- src/pages/design-system/examples/menubar/default.tsx

## State guidance

- checked: Reflect the actual view preference in the checkbox or radio item.
- disabled: Keep unavailable commands meaningful and explain their prerequisite nearby.

## Presentation rules

Do: Keep a small stable set of command categories.

Avoid: Build a second application navigation bar from menus labeled after every page.

Why: Competing navigation models make the current location harder to understand.

## Import and exports

- src/components/v4/ui/menubar.tsx

Exports: Menubar, MenubarCheckboxItem, MenubarContent, MenubarGroup, MenubarItem, MenubarLabel, MenubarMenu, MenubarPortal, MenubarRadioGroup, MenubarRadioItem, MenubarSeparator, MenubarShortcut, MenubarSub, MenubarSubContent, MenubarSubTrigger, MenubarTrigger. Source TypeScript defines the API.

## Behavior

- Open menus retain Radix typeahead and directional keys. Shortcut text requires a matching host handler.
- Each MenubarMenu owns a trigger and menu content. Action items close normally; checkbox/radio items remain open unless closeOnSelect requests dismissal.

## Accessibility

- Arrow keys move across the menu triggers and within each menu, skipping disabled items. Name icon-only triggers and distinguish an action from a checked selection.

## Use cases

- Group commands by task, keep checked items under their proper radio or checkbox model and keep arrow-key movement between menus working.

## Avoid

- Use Menubar for website destinations or add a shortcut caption without implementing its action binding.

## Limits

- Menubar models application action menus, not primary website navigation; checked values and operations belong to the host.

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

### MenubarItem.variant

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

### File and view commands

Save this example at `src/pages/design-system/examples/menubar/default.tsx`; its relative imports are generated for that exact path. States: default, disabled.

Registry items used: @infisical/menubar. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import * as UI from "../../../../components/v4/ui/menubar";
export default function Example() {
    const [checked, setChecked] = useState(false);
    const [metadata, setMetadata] = useState(false);
    const [details, setDetails] = useState(false);
    const [archived, setArchived] = useState(false);
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <UI.Menubar>
          <UI.MenubarMenu>
            <UI.MenubarTrigger>Environment</UI.MenubarTrigger>
            <UI.MenubarContent>
              <UI.MenubarLabel>Staging</UI.MenubarLabel>
              <UI.MenubarItem onSelect={() => setDetails(!details)}>
                Connection details
              </UI.MenubarItem>
              <UI.MenubarCheckboxItem checked={checked} onCheckedChange={setChecked}>
                Show archived
              </UI.MenubarCheckboxItem>
              <UI.MenubarCheckboxItem checked={metadata} onCheckedChange={setMetadata} closeOnSelect>
                Show metadata and close
              </UI.MenubarCheckboxItem>
              <UI.MenubarSeparator />
              <UI.MenubarItem disabled>Delete protected environment</UI.MenubarItem>
            </UI.MenubarContent>
          </UI.MenubarMenu>
        </UI.Menubar>
        {details && <p className="text-sm">Staging connection</p>}
      </div><figcaption className="text-muted-foreground text-xs">{"default"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <UI.Menubar>
          <UI.MenubarMenu>
            <UI.MenubarTrigger>Archive</UI.MenubarTrigger>
            <UI.MenubarContent>
              <UI.MenubarLabel>Staging</UI.MenubarLabel>
              <UI.MenubarItem variant="destructive" onSelect={() => setArchived(true)}>
                Archive environment
              </UI.MenubarItem>
            </UI.MenubarContent>
          </UI.MenubarMenu>
        </UI.Menubar>
        {archived && (<p role="status" className="sr-only text-sm">
            Environment archived
          </p>)}
      </div><figcaption className="text-muted-foreground text-xs">{"destructive"}</figcaption></figure>
    </div>);
}
```

### Checked states

Save this example at `src/pages/design-system/examples/menubar/states.tsx`; its relative imports are generated for that exact path. States: default, disabled.

Registry items used: @infisical/menubar. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import * as UI from "../../../../components/v4/ui/menubar";
const stateLabel = (checked: boolean | "indeterminate") => {
    if (checked === "indeterminate")
        return "Mixed";
    return checked ? "Checked" : "Unchecked";
};
export default function Example() {
    const [selected, setSelected] = useState(false);
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      {([false, true, "indeterminate"] as const).map((checked) => (<figure key={String(checked)} className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
          <UI.Menubar>
            <UI.MenubarMenu>
              <UI.MenubarTrigger>Open menu</UI.MenubarTrigger>
              <UI.MenubarContent>
                <UI.MenubarCheckboxItem checked={checked} disabled>
                  Include deployment-client metadata and inherited environment permissions
                </UI.MenubarCheckboxItem>
                <UI.MenubarItem onSelect={() => setSelected(true)}>
                  Connection details
                </UI.MenubarItem>
              </UI.MenubarContent>
            </UI.MenubarMenu>
          </UI.Menubar>
        </div><figcaption className="text-muted-foreground text-xs">{stateLabel(checked)}</figcaption></figure>))}
      {selected && (<p role="status" className="sr-only">
          Staging connection: vault.example.test
        </p>)}
    </div>);
}
```

### Placements

Save this example at `src/pages/design-system/examples/menubar/placements.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/menubar. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import * as UI from "../../../../components/v4/ui/menubar";
const placements = [
    { side: "top", align: "start" },
    { side: "right", align: "center" },
    { side: "bottom", align: "end" },
    { side: "left", align: "center" }
] as const;
export default function Example() {
    const [selected, setSelected] = useState(false);
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      {placements.map(({ side, align }) => (<UI.Menubar key={side}>
          <UI.MenubarMenu>
            <UI.MenubarTrigger>
              {side} / {align}
            </UI.MenubarTrigger>
            <UI.MenubarContent side={side} align={align} style={{ minWidth: 0, maxWidth: "var(--radix-menubar-content-available-width)" }}>
              <UI.MenubarItem onSelect={() => setSelected(true)}>Connection details</UI.MenubarItem>
              <UI.MenubarItem disabled>Delete locked environment</UI.MenubarItem>
            </UI.MenubarContent>
          </UI.MenubarMenu>
        </UI.Menubar>))}
      {selected && (<p role="status" className="sr-only">
          Staging connection: vault.example.test
        </p>)}
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#menubar and verify the documented interaction.
