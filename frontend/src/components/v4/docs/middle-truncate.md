# Middle truncate

Keep both ends of a long identifier within its available width.

## Choose this component

Choose MiddleTruncate for public identifiers whose beginning and ending both matter. Use normal wrapping for prose and SensitiveEditor for secrets.

## Usage rules

### middle-truncate-usage

Owner: middle-truncate.

When a long public resource identifier must fit beside row actions.

Do: Keep the full public identifier in the data and provide a keyboard-reachable copy or details route when its full text matters to the task.

Avoid: Store or copy the shortened string, rely only on a native title tooltip, or pass secret material to this display.

Why: A native title is mainly a pointer affordance. Truncation must not make the exact identifier unavailable to keyboard users.

Checked by: review only. Look for: Use keyboard and copy to recover the full public identifier; the shortened visual string is never the stored/copied value and native title is not the only inspection route.

Source evidence:
- src/components/v4/ui/middle-truncate.tsx
- src/pages/design-system/examples/middle-truncate/default.tsx

## State guidance

- narrow: Allow a minimal ellipsis when neither end can fit rather than forcing page overflow.
- copy: Copy the full public identifier from the host value, not the shortened display.

## Presentation rules

Do: Use truncation only where preserving both ends aids recognition.

Avoid: Apply middle ellipses to every heading and sentence for visual uniformity.

Why: Prose loses meaning when the middle is removed.

## Import and exports

- src/components/v4/ui/middle-truncate.tsx
- src/components/v4/ui/text.module.css

Exports: MiddleTruncate. Source TypeScript defines the API.

## Behavior

- Measures available width and recalculates on resize and font readiness.
- Copy retains the complete original string.

## Accessibility

- Assistive technology receives the full string.
- The default title exposes the full value on hover.

## Use cases

- Use MiddleTruncate where both ends matter, let the containing layout bound width and preserve the complete original for assistive text and copying.

## Avoid

- Pass secret material, truncate prose instructions or copy the shortened visible ellipsis string.

## Limits

- For public identifiers only; do not pass secret material.
- An identifier wider than its container may show only an ellipsis.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### width state

- fits: example `states`, visible label "Fits fully".
- truncated: example `states`, visible label "Default end, plain text".
- narrow: example `states`, visible label "Narrow, end 16".

### copy

- original full value: example `states`, visible label "Copy full resource path".

### size support


- no authored named size: omitted. This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API.

## Executable examples

### Keep both ends of a public resource path

Save this example at `src/pages/design-system/examples/middle-truncate/default.tsx`; its relative imports are generated for that exact path. States: overflow.

Registry items used: @infisical/middle-truncate, @infisical/sensitive-editor. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { MiddleTruncate } from "../../../../components/v4/ui/middle-truncate";
import { CopyButton } from "../../../../components/v4/ui/sensitive-editor";
const path = "project/production/services/payment-processing-api";
export default function Example() {
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
      <div className="flex w-full items-center gap-2">
        <div className="w-64 max-w-full min-w-0">
          <MiddleTruncate mono keepEnd={12}>
            {path}
          </MiddleTruncate>
        </div>
        <CopyButton iconOnly value={path} label="Copy full path"/>
      </div>
    </div><figcaption className="text-muted-foreground text-xs">{"Resource path"}</figcaption></figure>);
}
```

### Width and copy states

Save this example at `src/pages/design-system/examples/middle-truncate/states.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/middle-truncate, @infisical/sensitive-editor. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { MiddleTruncate } from "../../../../components/v4/ui/middle-truncate";
import { CopyButton } from "../../../../components/v4/ui/sensitive-editor";
const path = "applications/staging/services/payment-processing/configuration/retention-policy";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        <MiddleTruncate text="project_staging"/>
      </div><figcaption className="text-muted-foreground text-xs">{"Fits fully"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        <div className="flex w-full items-center gap-2">
          <div className="w-48 max-w-full min-w-0">
            <MiddleTruncate text={path} mono={false}/>
          </div>
          <CopyButton iconOnly value={path} label="Copy full resource path"/>
        </div>
      </div><figcaption className="text-muted-foreground text-xs">{"Default end, plain text"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        <div className="w-16 max-w-full">
          <MiddleTruncate keepEnd={16} mono>
            {path}
          </MiddleTruncate>
        </div>
      </div><figcaption className="text-muted-foreground text-xs">{"Narrow, end 16"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#middle-truncate and exercise the documented interaction.
