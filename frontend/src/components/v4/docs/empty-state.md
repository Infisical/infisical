# Empty

Explain why a collection has no items and how to create one.

## Choose this component

Choose EmptyState to explain why a collection has no rows. Use an error notice for a failed request and a loading state while the result is unknown.

## Usage rules

### empty-state-usage

Owner: empty-state.

When a filtered collection contains no matching rows.

Do: Say that no results match and offer Clear filters when it can help.

Avoid: Show a first-use Create resource prompt for a failed request or a filtered result.

Why: First use, a filtered result and a failed request require different next actions. A polished empty shell cannot establish which cause occurred.

Checked by: review only. Look for: Compare initial-empty, filtered-empty, loading and failure content. Each states the established cause and offers only an applicable next action.

Source evidence:
- src/components/v4/ui/empty.tsx
- src/pages/design-system/examples/empty-state/default.tsx

## State guidance

- first-use: Explain what the collection holds and offer the permitted creation action.
- no-results: Keep filter context visible and offer a reset rather than implying all data is absent.

## Presentation rules

Do: Use the smallest useful explanation and one relevant next action.

Avoid: Add a large celebratory illustration and several unrelated calls to action.

Why: The empty region should help the person resume work rather than compete with the page.

## Import and exports

- src/components/v4/ui/empty.tsx

Exports: Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle, EmptyState. Source TypeScript defines the API.

## Behavior

- EmptyState composes an icon, a title, an optional description and an actions slot. Media is a tile by default, a tinted 48px square with a line border and a 24px icon, or bare, a muted 24px icon with no tile. sm shrinks the tile to 36px with a 20px icon (a bare icon to 20px) and tightens padding and gaps for list, table and menu bodies. The Empty parts compose the same result: EmptyMedia defaults to the tile at the size its Empty sets.

## Accessibility

- Use a meaningful heading and a named native action. The empty container does not automatically announce asynchronous changes.

## Use cases

- Distinguish first use, no matches, missing permission and request failure; choose an action that resolves that specific condition.

## Avoid

- Show Create your first item after a failed request or repeat a large illustration and paragraph in every small empty region.

## Limits

- The caller distinguishes an empty result from loading, failure and missing permission; EmptyState does not fetch data.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### EmptyMedia.variant

- tile: example `parts`, visible label "tile".
- bare: example `bare`, visible label "bare".

### size

- default: example `default`, visible label "default".
- sm: example `small`, visible label "sm".

### EmptyState.size

- default: example `default`, visible label "default".
- sm: example `small`, visible label "sm".

### data state

- first use: example `default`, visible label "default".
- no matches: example `small`, visible label "sm".
- result after clear: example `small`, visible label "sm".

## Executable examples

### Default: a tile, a title, a description and the primary action

Save this example at `src/pages/design-system/examples/empty-state/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/empty. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import { EmptyState } from "../../../../components/v4/ui/empty";
export default function Example() {
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
      <EmptyState icon="key" title="No secrets in staging yet" description="Add one, or copy them from development in one step. Syncs pick them up on the next push." actions={<Button icon="plus">Add secret</Button>}/>
    </div><figcaption className="text-muted-foreground text-xs">{"default"}</figcaption></figure>);
}
```

### With a secondary action: the faster alternative follows the primary action

Save this example at `src/pages/design-system/examples/empty-state/secondary-action.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/empty. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import { EmptyState } from "../../../../components/v4/ui/empty";
export default function Example() {
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
      <EmptyState icon="key" title="No secrets in staging yet" description="Add one, or copy them from development in one step. Syncs pick them up on the next push." actions={<>
            <Button icon="plus">Add secret</Button>
            <Button variant="outline" icon="upload">
              Import from .env
            </Button>
          </>}/>
    </div><figcaption className="text-muted-foreground text-xs">{"Primary and secondary action"}</figcaption></figure>);
}
```

### Bare media: a muted icon without a tile for inline and compact regions

Save this example at `src/pages/design-system/examples/empty-state/bare.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/empty. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { EmptyState } from "../../../../components/v4/ui/empty";
export default function Example() {
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
      <EmptyState media="bare" icon="history" title="No versions yet" description="Each change to this secret saves a version here."/>
    </div><figcaption className="text-muted-foreground text-xs">{"bare"}</figcaption></figure>);
}
```

### Small: the empty body of a list, table or menu

Save this example at `src/pages/design-system/examples/empty-state/small.tsx`; its relative imports are generated for that exact path. States: empty, controlled.

Registry items used: @infisical/button, @infisical/empty, @infisical/list. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Button } from "../../../../components/v4/ui/button";
import { EmptyState } from "../../../../components/v4/ui/empty";
import { List, ListRow } from "../../../../components/v4/ui/list";
const secrets = ["DATABASE_URL", "REDIS_URL", "SESSION_KEY"];
export default function Example() {
    const [query, setQuery] = useState("stripe_web");
    const rows = secrets.filter((name) => name.toLowerCase().includes(query));
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
      <List label="Staging secrets" title="Staging secrets" empty={<EmptyState size="sm" icon="search" title={`No secrets match “${query}”`} actions={<Button variant="link" onClick={() => setQuery("")}>
                Clear filter
              </Button>}/>}>
        {rows.map((name) => (<ListRow key={name} value={name} label={name} title={name}/>))}
      </List>
    </div><figcaption className="text-muted-foreground text-xs">{"sm"}</figcaption></figure>);
}
```

### Composed from parts: the same result as Default

Save this example at `src/pages/design-system/examples/empty-state/parts.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/empty, @infisical/icon. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import * as UI from "../../../../components/v4/ui/empty";
import { Icon } from "../../../../components/v4/ui/icon";
export default function Example() {
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
      <UI.Empty>
        <UI.EmptyMedia variant="tile">
          <Icon name="key"/>
        </UI.EmptyMedia>
        <UI.EmptyHeader>
          <UI.EmptyTitle>No secrets in staging yet</UI.EmptyTitle>
          <UI.EmptyDescription>
            Add one, or copy them from development in one step. Syncs pick them up on the next push.
          </UI.EmptyDescription>
        </UI.EmptyHeader>
        <UI.EmptyContent>
          <Button icon="plus">Add secret</Button>
        </UI.EmptyContent>
      </UI.Empty>
    </div><figcaption className="text-muted-foreground text-xs">{"tile"}</figcaption></figure>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run dev; open /design-system#empty-state and verify the documented interaction.
