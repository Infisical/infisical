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

- EmptyState composes title, description, icon and action slots in default or compact form; the retained Empty parts support a custom arrangement.

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

### EmptyState.variant

- default: example `variants`, visible label "default".
- compact: example `variants`, visible label "compact".

### EmptyMedia.variant

- default: example `parts`, visible label "default".
- icon: example `parts`, visible label "icon".

### data state

- first use: example `variants`, visible label "No connections yet".
- no matches: example `variants`, visible label "No matching connections".
- request failure: example `variants`, visible label "Connections could not load".
- result after clear: example `variants`, visible label "1 connection".

### size support


- no authored named size: omitted. This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API.

## Executable examples

### No connections and a creation entry point

Save this example at `src/pages/design-system/examples/empty-state/default.tsx`; its relative imports are generated for that exact path. States: default, controlled.

Registry items used: @infisical/button, @infisical/empty. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import { EmptyState } from "../../../../components/v4/ui/empty";
export default function Example() {
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
      <EmptyState title="No connections yet" description="Connections synchronize this environment." icon="sync" actions={<Button asChild>
            <a href="#combobox">Add connection</a>
          </Button>}/>
    </div><figcaption className="text-muted-foreground text-xs">{"First use with action"}</figcaption></figure>);
}
```

### Variants and data states

Save this example at `src/pages/design-system/examples/empty-state/variants.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/empty. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Button } from "../../../../components/v4/ui/button";
import { EmptyState } from "../../../../components/v4/ui/empty";
export default function Example() {
    const [filtered, setFiltered] = useState(true);
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        <EmptyState title="No connections yet" description="Connections share versions with your services." actions={<Button asChild>
              <a href="#select">Choose a provider</a>
            </Button>}/>
      </div><figcaption className="text-muted-foreground text-xs">{"default"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        {filtered ? (<EmptyState variant="compact" title="No matching connections" actions={<Button variant="link" onClick={() => setFiltered(false)}>
                Clear filters
              </Button>}/>) : (<p role="status" className="text-sm">
            1 connection, Staging service
          </p>)}
      </div><figcaption className="text-muted-foreground text-xs">{filtered ? "compact" : "Filtered result"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        <EmptyState variant="compact" title="Connections could not load"/>
      </div><figcaption className="text-muted-foreground text-xs">{"Request failed"}</figcaption></figure>
    </div>);
}
```

### Compose an empty connection collection

Save this example at `src/pages/design-system/examples/empty-state/parts.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/empty, @infisical/icon. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import * as UI from "../../../../components/v4/ui/empty";
import { Icon } from "../../../../components/v4/ui/icon";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
      {(["default", "icon"] as const).map((variant) => (<figure key={variant} className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
          <UI.Empty className="flex-none">
            <UI.EmptyHeader>
              <UI.EmptyMedia variant={variant}>
                <Icon name="inbox"/>
              </UI.EmptyMedia>
              <UI.EmptyTitle>No connections yet</UI.EmptyTitle>
              <UI.EmptyDescription>
                Add a connection to synchronize this environment.
              </UI.EmptyDescription>
            </UI.EmptyHeader>
            <UI.EmptyContent>
              <Button asChild>
                <a href="#select">Choose a provider</a>
              </Button>
            </UI.EmptyContent>
          </UI.Empty>
        </div><figcaption className="text-muted-foreground text-xs">{variant}</figcaption></figure>))}
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#empty-state and verify the documented interaction.
