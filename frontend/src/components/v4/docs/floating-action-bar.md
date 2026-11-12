# Floating action bar

Bulk actions for the current selection, floating over the bottom of the view while anything is selected.

## Choose this component

Choose FloatingActionBar for bulk actions on a selection. Page actions belong in PageHeader and row actions in the table's actions tail, the sticky last column.

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

### floating-action-bar-window

Owner: floating-action-bar.

When a list or table page shows bulk actions for its selection.

Do: Render one FloatingActionBar for the selection, through DataTable's actionBar when a DataTable holds it, and let it sit at the bottom center of the window.

Avoid: Position the bar yourself, pin it inside the table or a card, or pad the page for it by hand.

Why: One place on every page makes the bar easy to find, and the bar pads the page's scroll area itself, so the last rows and the pagination can scroll clear of it.

Checked by: review only. Look for: Select rows on a list page whose table ends near the bottom of the window: the bar sits at the bottom center of the window, and scrolling to the end shows the pagination above it.

Source evidence:
- src/components/v4/ui/floating-action-bar.tsx
- src/components/v4/ui/data-table.tsx

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
- src/components/v4/ui/data-table.tsx

Exports: FloatingActionBar. Source TypeScript defines the API.

## Behavior

- The bar shows while count is above zero and keeps the last count while it leaves. It enters and leaves on the motion springs; reduced motion jumps.
- Select all appears while fewer than total are selected.
- An action with disabledReason is blocked the way Button disabledReason blocks it: it stays visible and focusable with aria-disabled, click and Enter do nothing, and the reason shows in the pass-through tooltip on hover and keyboard focus. In the More menu the item is disabled and the reason is its description, as RowActions does. Use disabled alone only when the reason is already on screen.
- moreActions always sit in the More menu. Under 400px wide, Select all hides and the noun after the count moves to screen readers only.
- The bar is fixed to the window: centered horizontally, space-action-bar-offset (24px) above the bottom edge and size-action-bar (48px) tall. It may cross the sidebar. It portals into the V4Scope overlay container, so it takes the scope's theme, and sits at z-index 40: above page content and sticky table headers, below dialogs, sheets, popovers, menus and toasts on the z-50 overlay layer. Inside a framed V4Scope (portalContainer) it is fixed to that frame instead.
- While it shows, the page's scroll area (AppInset) gains bottom padding of size-action-bar plus space-action-bar-offset, so the last rows and the pagination can scroll clear of the bar. A short page that already fits becomes scrollable by that much.

## Accessibility

- The bar is a named toolbar: Left and Right move between its buttons, Home and End jump, and Escape clears the selection.
- The count is a status. When the bar leaves with focus inside it, focus returns to where it came from.
- A blocked action keeps its tab stop and arrow-key stop in the toolbar and carries its reason as aria-description, so screen readers announce why it is unavailable.

## Use cases

- Use FloatingActionBar only for actions on a multiple selection in a list or table.

## Avoid

- Put a page's own actions in the bar or hide the selection behind it.

## Limits

- Labeled actions do not yet move into More by measured width; keep two or three labeled actions and put the rest in moreActions.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### selection

- partial: example `default`, visible label "Two of five selected".

## Executable examples

### Bulk actions over a list

Save this example at `src/pages/design-system/examples/floating-action-bar/default.tsx`; its relative imports are generated for that exact path. States: default, controlled, keyboard.

Registry items used: @cipher/floating-action-bar, @cipher/list, @cipher/sonner. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { FloatingActionBar } from "../../../../components/v4/ui/floating-action-bar";
import { List, ListRow } from "../../../../components/v4/ui/list";
import { toast } from "../../../../components/v4/ui/sonner";

const secrets = ["stripe_api_key", "database_url", "sentry_dsn", "redis_password", "jwt_secret"];

export default function Example() {
  const [rows, setRows] = useState(secrets);
  const [selected, setSelected] = useState<string[]>(["stripe_api_key", "database_url"]);
  return (
    <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
      <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
        <div className="relative isolate h-[600px] w-full min-w-0 [transform:translateZ(0)] overflow-auto">
          <List
            label="Secrets"
            title="Secrets"
            selection="multiple"
            selectedIds={selected}
            onSelectionChange={setSelected}
          >
            {rows.map((key) => (
              <ListRow key={key} value={key} label={key} title={<code>{key}</code>} />
            ))}
          </List>
          <FloatingActionBar
            count={selected.length}
            total={rows.length}
            onSelectAll={() => setSelected(rows)}
            onClear={() => setSelected([])}
            actions={[
              {
                label: "Move",
                icon: "folder",
                onClick: () => toast(`Ready to move ${selected.length}.`)
              },
              {
                label: "Delete",
                icon: "trash",
                danger: true,
                onClick: () => {
                  setRows(rows.filter((row) => !selected.includes(row)));
                  toast(`Deleted ${selected.length} secrets.`);
                  setSelected([]);
                }
              }
            ]}
            moreActions={[
              {
                label: "Download names",
                onClick: () => {
                  const link = document.createElement("a");
                  link.href = URL.createObjectURL(
                    new Blob([`${selected.join("\n")}\n`], { type: "text/plain" })
                  );
                  link.download = "secret-names.txt";
                  link.click();
                  URL.revokeObjectURL(link.href);
                  toast(`Downloaded ${selected.length} names.`);
                }
              }
            ]}
          />
        </div>
      </div>
      <figcaption className="text-muted-foreground text-xs">{"Two of five selected"}</figcaption>
    </figure>
  );
}
```

### Action blocked with a reason

Save this example at `src/pages/design-system/examples/floating-action-bar/disabled-reason.tsx`; its relative imports are generated for that exact path. States: disabled, keyboard.

Registry items used: @cipher/floating-action-bar, @cipher/list, @cipher/sonner. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { FloatingActionBar } from "../../../../components/v4/ui/floating-action-bar";
import { List, ListRow } from "../../../../components/v4/ui/list";
import { toast } from "../../../../components/v4/ui/sonner";

const secrets = [
  { key: "stripe_api_key", environment: "production" },
  { key: "database_url", environment: "staging" },
  { key: "sentry_dsn", environment: "production" }
];

export default function Example() {
  const [selected, setSelected] = useState<string[]>(["stripe_api_key", "database_url"]);
  const environments = new Set(
    secrets.filter((secret) => selected.includes(secret.key)).map((secret) => secret.environment)
  );
  const reason = environments.size > 1 ? "Select secrets from one environment to copy" : undefined;
  return (
    <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
      <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
        <div className="relative isolate h-[600px] w-full min-w-0 [transform:translateZ(0)] overflow-auto">
          <List
            label="Secrets"
            title="Secrets"
            selection="multiple"
            selectedIds={selected}
            onSelectionChange={setSelected}
          >
            {secrets.map((secret) => (
              <ListRow
                key={secret.key}
                value={secret.key}
                label={secret.key}
                title={<code>{secret.key}</code>}
                meta={secret.environment}
              />
            ))}
          </List>
          <FloatingActionBar
            count={selected.length}
            onClear={() => setSelected([])}
            actions={[
              {
                label: "Copy to new source",
                icon: "copy",
                disabledReason: reason,
                onClick: () => toast(`Ready to copy ${selected.length} secrets.`)
              },
              {
                label: "Delete",
                icon: "trash",
                danger: true,
                onClick: () => toast(`Ready to delete ${selected.length} secrets.`)
              }
            ]}
            moreActions={[
              {
                label: "Export as .env",
                disabledReason: reason && "Select secrets from one environment to export",
                onClick: () => toast(`Ready to export ${selected.length} secrets.`)
              }
            ]}
          />
        </div>
      </div>
      <figcaption className="text-muted-foreground text-xs">
        {"Copy blocked until the selection shares one environment"}
      </figcaption>
    </figure>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run dev; open /design-system#floating-action-bar and exercise the documented interaction.
