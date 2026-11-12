# Loader

Loaders by level: BootLoader while the app or session boots, RouteProgress while a navigation resolves, and Loader for a page or a region of unknown shape.

## Choose this component

Page loader, Skeleton or the table's loading rows: while a whole page or its chunk loads and none of it is on screen, use the page loader. Once the page has rendered, show Skeleton shapes for a card, panel or chart of known shape, and the table's loading rows (DataTable loading with loadingRows) for rows inside a table that is on screen. Use Spinner with a label for inline status and Progress for a known count.

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

### loader-unknown-shape

Owner: loader.

When a region is waiting for data.

Do: Use Loader only when the shape of the result is unknown. When it is known, show Skeleton shapes like the loaded state and announce the wait with a status.

Avoid: Cover known rows, cards or a chart with a blanket Loader.

Why: Matching shapes keep the layout still and show what is coming; a centered spinner hides both.

Checked by: review only. Look for: For each Loader, check whether the loaded content has a known shape. If it does, replace the Loader with Skeleton shapes at the same size.

Source evidence:
- src/components/v4/ui/loader.tsx
- src/pages/design-system/examples/loader/default.tsx

### loader-page-level

Owner: loader.

When a whole page, or the lazy chunk that renders it, is loading and none of it is on screen yet.

Do: Render the page loader, Loader size page, as the Suspense fallback or the page body, labeled with the page it loads.

Avoid: Show a Spinner, bare Loading text or a blank area, or put the page loader over a table or region inside a page that has already rendered.

Why: One page-level treatment tells people the whole page is on its way; inside a rendered page, Skeleton and the table's loading rows keep the layout still.

Checked by: review only. Look for: Check each Suspense fallback and page-level loading branch renders Loader size page; the suspense-fallback lint check of rule/page-loading catches single-line fallbacks.

Source evidence:
- src/components/v4/ui/loader.tsx
- src/pages/design-system/examples/loader/default.tsx

### loader-boot-level

Owner: loader.

When the app or the session is booting and no shell is on screen: the root route's pending state on /v4, the auth layout, or the organization route that authenticates and loads the session.

Do: Render BootLoader with a label that names what boots, such as Loading Infisical, Loading sign in or Loading your organization.

Avoid: Wrap a Loader in a V4Scope of your own for boot, label it Loading, or use BootLoader for a page inside the shell, where the page loader sits in the content area.

Why: BootLoader themes itself before V4Scope exists and matches the pre-JavaScript ground, so boot goes from the HTML to the shell on one ground with one label.

Checked by: review only. Look for: Cold-load a /v4 route with a dark theme and a slow network: the ground is dark from the first paint, the boot label names what loads, and no v3 loader shows.

Source evidence:
- src/components/v4/ui/boot-loader.tsx
- src/pages/design-system/examples/loader/boot.tsx

### loader-route-progress

Owner: loader.

When a navigation inside the v4 app waits on route loaders or a lazy route chunk.

Do: Let the one RouteProgress in the v4 root show the wait, and keep the current page on screen until the next one renders.

Avoid: Mount a second progress bar, drive NProgress on /v4 paths, or replace the shell with a page loader for an ordinary navigation.

Why: A thin bar that appears only for slow navigations says the click registered without moving or hiding the page.

Checked by: review only. Look for: Navigate between v4 pages on a throttled network: one ink bar appears at the top after a moment and fades when the page renders, and the v3 NProgress bar never shows.

Source evidence:
- src/components/v4/ui/route-progress.tsx
- src/pages/design-system/examples/loader/route-progress.tsx

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
- src/components/v4/ui/boot-loader.tsx
- src/components/v4/ui/boot-loader.module.css
- src/components/v4/ui/route-progress.tsx
- src/components/v4/ui/route-progress.module.css
- src/components/v4/lib/boot-theme.ts

Exports: Loader, BootLoader, RouteProgress. Source TypeScript defines the API.

## Behavior

- Loader composes Spinner with its label, description and delay; it adds the area that centers it and marks the region busy.
- With loading false it renders its children and nothing else.
- The default delay of 300ms keeps fast loads from flashing.
- Loader is for content whose shape is unknown. When the loaded shape is known (rows, cards, a chart), show Skeleton shapes that match the loaded state instead, as the reload in the example does.
- Size page is the page loader: it fills a page body while the page or its lazy chunk loads, before any of the page is on screen.
- BootLoader is the page loader for app and session boot, before the shell exists: the router's root pending state and a route that authenticates the session or loads the organization. It fills the viewport, or its container with fill container, and themes itself from storage the way the app theme does (a ?theme= or session preview outside live orgs, else the named theme for the scheme the shared light, dark or system preference resolves to), so it needs no V4Scope. A theme prop pins one theme.
- Before any JavaScript runs, index.html paints the same ground on /v4 paths: a generated inline script resolves the theme with the same rules and sets data-v4-boot on the html element, and a generated style gives each theme its inset ground and color scheme, so a dark theme never flashes white. Other paths are untouched, and the app removes the attribute once the first route resolves. ui:generate writes the block from tokens.json.
- RouteProgress is a size-space-2 ink bar along the top of the viewport while pending is true. It appears only after duration-slow, so instant navigations show nothing, then creeps toward nine tenths of the width; when the navigation resolves it fills and fades out. Reduced motion shows a still full-width bar instead. It reads no router: the app passes pending from its own router state.

## Accessibility

- Spinner's label carries one polite status announcement; the region sets aria-busy while loading.
- BootLoader announces its label through the same Spinner status.
- RouteProgress is aria-hidden: the destination page's title and its own loader announce the change, so the bar adds no second announcement.

## Use cases

- Use the page loader (size page) as the Suspense fallback for a page or a lazy page chunk, and for a page whose first data has not arrived, labeled with the page it loads.
- Use Loader at base size around a card, panel or sheet of unknown shape while its first data loads, with a label that names the object.
- Use BootLoader for the root pending state on /v4 and for routes that boot the session or the organization, before the shell renders.
- Mount one RouteProgress in the v4 root for in-app navigations.

## Avoid

- Nest a Loader inside a page Loader, or put one inside a button.
- Cover a table that is already on screen with a Loader; use its loading rows.

## Limits

- For an inline status beside text, use Spinner with a label directly; Loader only fills areas.
- Use Progress for a known count and Skeleton for a known layout. A blanket Loader over rows, cards or a chart whose shape is known is a misuse.
- The boot ground in index.html cannot evaluate the v4 feature flag, so it applies to /v4 paths only; a flag-on visit to a main path paints main's ground until the redirect to /v4.
- RouteProgress mounts once, inside the v4 root; the app passes its router's pending state, and it does not cover the v3 app, which keeps NProgress.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### size

- base: example `default`, visible label "base".
- page: example `default`, visible label "page".

### level

- boot: example `boot`, visible label "Boot, Lightly Peach".
- route: example `route-progress`, visible label "Route progress while a navigation resolves".
- page: example `default`, visible label "page".
- region: example `default`, visible label "base".

## Executable examples

### Base, page and a skeleton reload

Save this example at `src/pages/design-system/examples/loader/default.tsx`; its relative imports are generated for that exact path. States: loading, default.

Registry items used: @cipher/badge, @cipher/button, @cipher/item, @cipher/list, @cipher/loader, @cipher/skeleton. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { Badge } from "../../../../components/v4/ui/badge";
import { Button } from "../../../../components/v4/ui/button";
import { Media } from "../../../../components/v4/ui/item";
import { List, ListRow } from "../../../../components/v4/ui/list";
import { Loader } from "../../../../components/v4/ui/loader";
import { Skeleton } from "../../../../components/v4/ui/skeleton";

const connections = [
  { value: "vercel", title: "Vercel", description: "Production, 14 secrets", icon: "globe" },
  { value: "github", title: "GitHub", description: "Actions, 9 secrets", icon: "git" }
] as const;

export default function Example() {
  const [loading, setLoading] = useState(false);
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Loader size="base" label="Loading secrets" delay={0} />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"base"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Loader
            size="page"
            label="Connecting to Vercel"
            description="Large projects can take up to a minute."
            delay={0}
          />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"page"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setLoading(true);
              window.setTimeout(() => setLoading(false), 2000);
            }}
          >
            Reload connections
          </Button>
          <div aria-busy={loading}>
            {loading && (
              <span role="status" className="sr-only">
                Loading connections
              </span>
            )}
            <List label="Connections">
              {connections.map((connection) =>
                loading ? (
                  <ListRow
                    key={connection.value}
                    value={connection.value}
                    label={connection.title}
                    media={<Skeleton width={40} height={40} />}
                    title={
                      <span className="flex h-(--v4-type-row-title-line-height) items-center">
                        <Skeleton width={48} height={12} />
                      </span>
                    }
                    meta={<Skeleton width={68} height={20} />}
                  >
                    <span className="flex h-(--v4-type-small-line-height) items-center">
                      <Skeleton width={144} height={10} />
                    </span>
                  </ListRow>
                ) : (
                  <ListRow
                    key={connection.value}
                    value={connection.value}
                    label={connection.title}
                    media={<Media icon={connection.icon} />}
                    title={connection.title}
                    description={connection.description}
                    meta={
                      <Badge tone="ok" dot>
                        Synced
                      </Badge>
                    }
                  />
                )
              )}
            </List>
          </div>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Known rows reload as skeleton rows"}
        </figcaption>
      </figure>
    </div>
  );
}
```

### Boot loader in peach and dark

Save this example at `src/pages/design-system/examples/loader/boot.tsx`; its relative imports are generated for that exact path. States: loading.

Registry items used: @cipher/boot-loader. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { BootLoader } from "../../../../components/v4/ui/boot-loader";

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-start gap-x-6 gap-y-8">
      {["peach", "dark"].map((theme) => (
        <figure key={theme} className="m-0 flex w-full min-w-0 flex-col gap-3">
          <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
            <div className="h-80">
              <BootLoader theme={theme} fill="container" label="Loading Infisical" delay={0} />
            </div>
          </div>
          <figcaption className="text-muted-foreground text-xs">{`Boot, ${theme}`}</figcaption>
        </figure>
      ))}
    </div>
  );
}
```

### Route progress

Save this example at `src/pages/design-system/examples/loader/route-progress.tsx`; its relative imports are generated for that exact path. States: loading, default.

Registry items used: @cipher/button, @cipher/route-progress, @cipher/text. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useEffect, useState } from "react";

import { Button } from "../../../../components/v4/ui/button";
import { RouteProgress } from "../../../../components/v4/ui/route-progress";
import { Meta } from "../../../../components/v4/ui/text";

export default function Example() {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!pending) return undefined;
    const timer = window.setTimeout(() => setPending(false), 2400);
    return () => window.clearTimeout(timer);
  }, [pending]);
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <div className="relative flex h-24 flex-col items-start justify-end gap-2 contain-layout">
            <RouteProgress pending={pending} />
            <Button variant="outline" disabled={pending} onClick={() => setPending(true)}>
              Open audit logs
            </Button>
            <Meta mono={false} role="status">
              {pending ? "Opening audit logs" : "Audit logs open"}
            </Meta>
          </div>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Route progress while a navigation resolves"}
        </figcaption>
      </figure>
    </div>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run dev; open /design-system#loader and exercise the documented interaction.
