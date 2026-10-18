# Command

Find and execute an action using a searchable command list.

## Choose this component

Choose CommandMenu for searching destinations, objects and actions from one keyboard entry point. Use Combobox for selecting a field value.

## Usage rules

### command-menu-truthful-pending

Owner: command-menu.

When a command returns a promise that can reject.

Do: Keep the action named while pending, retain the command on failure and close only after it fulfills.

Avoid: Replace failure with a success notification or clear the query before the person can retry.

Why: The visible command must report what the local operation actually did.

Checked by: review only. Look for: Reject synchronization, retry the same command and confirm local completion follows fulfillment.

Source evidence:
- src/components/v4/ui/command-menu.tsx

### command-menu-usage

Owner: command-menu.

When the menu displays a keyboard shortcut for an action.

Do: Register that shortcut in the host and route selection to the same named action as the visible item.

Avoid: Display a shortcut cap that does nothing or treat typing as a committed action.

Why: The menu should make real actions discoverable, not advertise nonexistent bindings.

Checked by: review only. Look for: Search by a visible action label and invoke the displayed shortcut. Both activate the same real action; a typed query alone does not execute it.

Source evidence:
- src/components/v4/ui/command.tsx
- src/pages/design-system/examples/command-menu/default.tsx

## State guidance

- empty: Explain that no commands match the query and retain the query.
- pending: Keep asynchronous action feedback outside the closed menu when the action continues.

## Presentation rules

Do: Group results by a meaningful type such as Pages and Resources.

Avoid: Mix unlabeled destructive actions into a list of similarly named destinations.

Why: Search results must make the difference between navigation and mutation clear.

## Import and exports

- src/components/v4/ui/command.tsx
- src/components/v4/ui/command-menu.tsx
- src/components/v4/ui/picker.module.css

Exports: Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, CommandShortcut, CommandMenuItem, CommandMenuGroup, CommandMenuProps, CommandMenu. Source TypeScript defines the API.

## Behavior

- Groups rank label matches while keeping group order; pages drill into a nested command set. onQueryChange receives query and page ID; filter=false delegates filtering to the host.
- Pending async commands reject duplicate activation, including the link shortcut; actual dialog close clears page, query and feedback before the next session.

## Accessibility

- Arrow keys move through commands and skip disabled ones. Escape leaves a nested page before it closes the menu. Mod+Enter opens an enabled link that is not pending in a new tab.

## Use cases

- Give commands stable unique ids, keep page groups meaningful and use filter=false only when the host actually supplies filtered results.

## Avoid

- Use CommandMenu as a form value picker, show a shortcut that has no binding or treat closing as proof an action succeeded.

## Limits

- Async action IDs stay disabled and busy until settlement. Actual dialog close resets query/page and notifies onQueryChange('', undefined); inline panels retain their query. Remote search, shortcut bindings shown on items and persistence remain host-owned.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### Presentation

- dialog: example `default`, visible label "Search commands".
- inline: omitted. Inline embeds the palette in a page region. The examples show only the triggered dialog, and the inline mode shares its panel and rows.

### Hotkey

- mod+k: example `default`, visible label "Search commands".
- false: example `states`, visible label "Loading results".

### Filter

- true: example `default`, visible label "Search commands".
- false: example `states`, visible label "No results".

### Loading

- false: example `default`, visible label "Search commands".
- true: example `states`, visible label "Loading results".

### Item danger

- false: example `default`, visible label "Search commands".
- true: example `default`, visible label "Search commands".

### Item keepOpen

- false: example `default`, visible label "Search commands".
- true: example `default`, visible label "Search commands".

## Executable examples

### Command menu

Save this example at `src/pages/design-system/examples/command-menu/default.tsx`; its relative imports are generated for that exact path. States: default, controlled, disabled, keyboard.

Registry items used: @infisical/button, @infisical/command-menu. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Button } from "../../../../components/v4/ui/button";
import { CommandMenu } from "../../../../components/v4/ui/command-menu";
export default function Example() {
    const [open, setOpen] = useState(false);
    const [pinned, setPinned] = useState(false);
    const [recent, setRecent] = useState(true);
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
      <Button variant="outline" onClick={() => setOpen(true)}>
        Search commands
      </Button>
      <CommandMenu open={open} onOpenChange={setOpen} label="Search commands" recent={recent ? [{ id: "recent", label: "Input", href: "#input" }] : []} groups={[
            {
                label: "Commands",
                items: [
                    {
                        id: "history",
                        label: "View history"
                    },
                    {
                        id: "pin",
                        label: pinned ? "Unpin recent commands" : "Pin recent commands",
                        keepOpen: true,
                        onSelect: () => setPinned(!pinned)
                    },
                    { id: "connections", label: "Connections", page: "connections" },
                    {
                        id: "clear",
                        label: "Clear recent commands",
                        danger: true,
                        onSelect: () => setRecent(false)
                    },
                    { id: "locked", label: "Delete organization", disabled: true }
                ]
            }
        ]} pages={{
            connections: {
                title: "Connections",
                groups: [
                    { label: "Staging", items: [{ id: "connection", label: "Inspect connection" }] }
                ]
            }
        }} footer={pinned ? "Recent commands pinned" : undefined}/>
    </div><figcaption className="text-muted-foreground text-xs">{"Default"}</figcaption></figure>);
}
```

### Loading and no results

Save this example at `src/pages/design-system/examples/command-menu/states.tsx`; its relative imports are generated for that exact path. States: loading, empty, controlled.

Registry items used: @infisical/button, @infisical/command-menu. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Button } from "../../../../components/v4/ui/button";
import { CommandMenu } from "../../../../components/v4/ui/command-menu";
export default function Example() {
    const [open, setOpen] = useState<"loading" | "empty" | null>(null);
    const close = (next: boolean) => {
        if (!next)
            setOpen(null);
    };
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        <Button variant="outline" onClick={() => setOpen("loading")}>
          Open palette
        </Button>
        <CommandMenu hotkey={false} filter={false} loading label="Loading connections" groups={[]} open={open === "loading"} onOpenChange={close}/>
      </div><figcaption className="text-muted-foreground text-xs">{"Loading results"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        <Button variant="outline" onClick={() => setOpen("empty")}>
          Open palette
        </Button>
        <CommandMenu hotkey={false} filter={false} label="Search connections" groups={[]} emptyHint="Enter a connection name." open={open === "empty"} onOpenChange={close}/>
      </div><figcaption className="text-muted-foreground text-xs">{"No results"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#command-menu and verify the documented interaction.
