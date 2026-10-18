# Loader

Fill a region with a labeled Spinner while its first data loads, then show the content.

## Choose this component

Choose Loader for a region whose wait you cannot measure. Use Spinner with a label for inline status, Progress for a known count and Skeleton for a known layout.

## Usage rules

### loader-label

Owner: loader.

When a region shows a Loader.

Do: Pass a present participle that names the object, such as Loading secrets.

Avoid: Use a bare Loading label or no label at all.

Why: People need to know what is loading and where it will appear.

Checked by: review only. Look for: Read each Loader label and check that it names what loads.

Source evidence:
- src/components/v4/ui/loader.tsx
- src/pages/design-system/examples/loader/default.tsx

### loader-reconcile

Owner: loader.

When text near the region already says what is happening.

Do: Use a bare Spinner or Spinner with a label instead of a Loader.

Avoid: Add a second Loader inside a region that already shows one.

Why: One loader per region keeps a single status announcement.

Checked by: review only. Look for: Search the region for nested Loader or Spinner status elements.

Source evidence:
- src/components/v4/ui/loader.tsx

## State guidance

- loading: The Spinner centers in the region after the delay, with its label under it.
- loaded: The children replace the Loader in place.

## Presentation rules

Do: Keep the page loader's assembly as the one entrance flourish.

Avoid: Restart the page loader every time data refreshes.

Why: Replaying the assembly reads as a new load.

## Import and exports

- src/components/v4/ui/loader.tsx
- src/components/v4/ui/loader.module.css

Exports: Loader. Source TypeScript defines the API.

## Behavior

- Loader composes Spinner with its label, description and delay; it adds the area that centers it and marks the region busy.
- With loading false it renders its children and nothing else.
- The default delay of 300ms keeps fast loads from flashing.

## Accessibility

- Spinner's label carries one polite status announcement; the region sets aria-busy while loading.

## Use cases

- Use Loader around a card, panel, sheet or page body while its first data loads, with a label that names the object.

## Avoid

- Nest a Loader inside a page Loader, or put one inside a button.

## Limits

- For an inline status beside text, use Spinner with a label directly; Loader only fills areas.
- Use Progress for a known count and Skeleton for a known layout.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### size

- base: example `default`, visible label "base".
- page: example `default`, visible label "page".

## Executable examples

### Base, page and loaded

Save this example at `src/pages/design-system/examples/loader/default.tsx`; its relative imports are generated for that exact path. States: loading, default.

Registry items used: @infisical/button, @infisical/list, @infisical/loader. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Button } from "../../../../components/v4/ui/button";
import { List, ListRow } from "../../../../components/v4/ui/list";
import { Loader } from "../../../../components/v4/ui/loader";
export default function Example() {
    const [loading, setLoading] = useState(false);
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Loader size="base" label="Loading secrets" delay={0}/>
      </div><figcaption className="text-muted-foreground text-xs">{"base"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Loader size="page" label="Connecting to Vercel" description="Large projects can take up to a minute." delay={0}/>
      </div><figcaption className="text-muted-foreground text-xs">{"page"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Button variant="outline" size="sm" onClick={() => {
            setLoading(true);
            window.setTimeout(() => setLoading(false), 2000);
        }}>
          Reload connections
        </Button>
        <Loader loading={loading} label="Loading connections" delay={0}>
          <List label="Connections">
            <ListRow value="vercel" label="Vercel" title="Vercel" meta="Synced"/>
            <ListRow value="github" label="GitHub" title="GitHub" meta="Synced"/>
          </List>
        </Loader>
      </div><figcaption className="text-muted-foreground text-xs">{"Loaded content replaces the loader"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#loader and exercise the documented interaction.
