# Skeleton

Reserve content space while a resource is loading.

## Choose this component

Choose Skeleton when content geometry is known but its data is pending. Use EmptyState for a finished empty result and Alert for failure.

## Usage rules

### skeleton-usage

Owner: skeleton.

When a list is loading before its first rows arrive.

Do: Match the expected row height and approximate content areas; replace skeletons when the request settles.

Avoid: Keep animated placeholders after failure or draw unrelated generic cards in a table region.

Why: The placeholder should reduce layout movement and explain pending content.

Checked by: review only. Look for: Compare the pending shapes with the final content at the same width. Replacing them does not shift unrelated controls, and failure ends the placeholder state.

Source evidence:
- src/components/v4/ui/skeleton.tsx
- src/pages/design-system/examples/skeleton/default.tsx

## State guidance

- initial-loading: Reserve only the region that will receive the result.
- refresh: Keep useful existing rows visible when a background request is pending.

## Presentation rules

Do: Match the real content's rhythm with few shapes.

Avoid: Build elaborate fake dashboards from many pulsing bars.

Why: Excess animation draws attention to invented content and adds no useful status.

## Import and exports

- src/components/v4/ui/skeleton.tsx

Exports: Skeleton. Source TypeScript defines the API.

## Behavior

- Skeleton reserves measured lines or a shape while the owner loads data. It does not start or finish a request.

## Accessibility

- Keep decorative loading structure out of the accessibility tree and provide a meaningful loading status where needed.

## Use cases

- Match a few expected content shapes, keep them aria-hidden and let the host announce loading and replace them with the actual result or error.

## Avoid

- Leave skeletons after failure, animate fake content indefinitely or draw a detailed fake dashboard as decoration.

## Limits

- Skeleton is visual and aria-hidden; the owner announces loading and replaces the shape with the actual result or error.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### shape

- block: example `default`, visible label "Avatar and text".
- lines: example `default`, visible label "Text lines".

### line count

- 1: example `behavior`, visible label "One line".
- 3: example `behavior`, visible label "Three lines".
- 5: example `behavior`, visible label "Longer block".

### size support


- no authored named size: omitted. This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API.

## Executable examples

### Pending text and a resource row

Save this example at `src/pages/design-system/examples/skeleton/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/skeleton. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Skeleton } from "../../../../components/v4/ui/skeleton";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Skeleton lines={3}/>
      </div><figcaption className="text-muted-foreground text-xs">{"Text lines"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <div className="flex w-full items-start gap-3">
          <Skeleton width={32} height={32}/>
          <div className="min-w-0 flex-1 space-y-3">
            <Skeleton width="45%" height={14}/>
            <Skeleton lines={2} height={12}/>
          </div>
        </div>
      </div><figcaption className="text-muted-foreground text-xs">{"Avatar and text"}</figcaption></figure>
    </div>);
}
```

### Line counts

Save this example at `src/pages/design-system/examples/skeleton/behavior.tsx`; its relative imports are generated for that exact path. States: loading.

Registry items used: @infisical/skeleton. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Skeleton } from "../../../../components/v4/ui/skeleton";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Skeleton lines={1}/>
      </div><figcaption className="text-muted-foreground text-xs">{"One line"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Skeleton lines={3}/>
      </div><figcaption className="text-muted-foreground text-xs">{"Three lines"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Skeleton lines={5}/>
      </div><figcaption className="text-muted-foreground text-xs">{"Longer block"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#skeleton and verify the documented interaction.
