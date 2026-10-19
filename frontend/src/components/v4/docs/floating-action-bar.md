# Floating action bar

Bulk actions for the current selection, floating over the bottom of the view while anything is selected.

## Choose this component

Choose FloatingActionBar for bulk actions on a selection. Page actions belong in PageHeader and row actions in the row.

## Usage rules

### floating-action-bar-undo

Owner: floating-action-bar.

When a bulk action changes or removes items.

Do: Say how many it touched and offer Undo after it, unless the loss is permanent.

Avoid: Ask for confirmation before every bulk action.

Why: Undo keeps the flow fast and still recovers mistakes.

Checked by: review only. Look for: Run Delete in the example and check that the result names the count.

Source evidence:
- src/pages/design-system/examples/floating-action-bar/default.tsx

### floating-action-bar-order

Owner: floating-action-bar.

When the bar has several actions.

Do: Order actions by importance with the danger action last and the rest in moreActions.

Avoid: Lead with Delete or show every action as a labeled button.

Why: The bar has one line and never wraps.

Checked by: review only. Look for: Read the actions left to right.

Source evidence:
- src/components/v4/ui/floating-action-bar.tsx

## State guidance

- busy: A running action shows its button's loading state and the bar stays up until it finishes.
- empty: With no selection the bar is not rendered.

## Presentation rules

Do: Keep labels to a verb, such as Move or Delete.

Avoid: Repeat the count in every action label.

Why: The count already sits at the start of the bar.

## Import and exports

- src/components/v4/ui/floating-action-bar.tsx
- src/components/v4/ui/floating-action-bar.module.css

Exports: FloatingActionBar. Source TypeScript defines the API.

## Behavior

- The bar shows while count is above zero and keeps the last count while it leaves. It enters and leaves on the motion springs; reduced motion jumps.
- Select all appears while fewer than total are selected.
- moreActions always sit in the More menu. Under 400px wide, Select all hides and the noun after the count moves to screen readers only.
- fixed sits 24px above the viewport's bottom; contained sits 16px above the nearest positioned ancestor's bottom.

## Accessibility

- The bar is a named toolbar: Left and Right move between its buttons, Home and End jump, and Escape clears the selection.
- The count is a status. When the bar leaves with focus inside it, focus returns to where it came from.

## Use cases

- Use FloatingActionBar only for actions on a multiple selection in a list or table.

## Avoid

- Put a page's own actions in the bar or hide the selection behind it.

## Limits

- Labeled actions do not yet move into More by measured width; keep two or three labeled actions and put the rest in moreActions.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### placement

- contained: example `default`, visible label "contained, two of five selected".
- fixed: omitted. Fixed placement would float over the whole workbench; contained shows the same bar inside its stage.

## Executable examples

### Bulk actions over a list

Save this example at `src/pages/design-system/examples/floating-action-bar/default.tsx`; its relative imports are generated for that exact path. States: default, controlled, keyboard.

Registry items used: @infisical/floating-action-bar, @infisical/list. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { FloatingActionBar } from "../../../../components/v4/ui/floating-action-bar";
import { List, ListRow } from "../../../../components/v4/ui/list";
const secrets = ["stripe_api_key", "database_url", "sentry_dsn", "redis_password", "jwt_secret"];
export default function Example() {
    const [rows, setRows] = useState(secrets);
    const [selected, setSelected] = useState<string[]>(["stripe_api_key", "database_url"]);
    const [message, setMessage] = useState("");
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
      <div className="relative min-w-0 w-full overflow-auto h-[600px] isolate [transform:translateZ(0)]">
        <List label="Secrets" title="Secrets" selection="multiple" selectedIds={selected} onSelectionChange={setSelected} footer={message || undefined}>
          {rows.map((key) => (<ListRow key={key} value={key} label={key} title={<code>{key}</code>}/>))}
        </List>
        <FloatingActionBar placement="contained" count={selected.length} total={rows.length} onSelectAll={() => setSelected(rows)} onClear={() => setSelected([])} actions={[
            {
                label: "Move",
                icon: "folder",
                onClick: () => setMessage(`Ready to move ${selected.length}.`)
            },
            {
                label: "Delete",
                icon: "trash",
                danger: true,
                onClick: () => {
                    setRows(rows.filter((row) => !selected.includes(row)));
                    setMessage(`Deleted ${selected.length} secrets.`);
                    setSelected([]);
                }
            }
        ]} moreActions={[
            {
                label: "Download names",
                onClick: () => {
                    const link = document.createElement("a");
                    link.href = URL.createObjectURL(new Blob([`${selected.join("\n")}\n`], { type: "text/plain" }));
                    link.download = "secret-names.txt";
                    link.click();
                    URL.revokeObjectURL(link.href);
                    setMessage(`Downloaded ${selected.length} names.`);
                }
            }
        ]}/>
      </div>
    </div><figcaption className="text-muted-foreground text-xs">{"contained, two of five selected"}</figcaption></figure>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#floating-action-bar and exercise the documented interaction.
