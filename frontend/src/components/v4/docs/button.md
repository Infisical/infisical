# Button

Trigger a named action with a clear emphasis and pending state.

## Choose this component

Choose Button for an action. Use a native link for a destination, Toggle for a persistent pressed choice and Switch for an immediate setting.

## Usage rules

### button-usage

Owner: button.

When a form has one save action and several supporting actions.

Do: Use the shared lime Button for Save changes, use outline or ghost for Review draft and Discard, and keep the button's size and name while saving.

Avoid: Give every action the strongest lime emphasis, repaint the shared material in caller styles or replace Save changes with an unlabeled spinner.

Why: Emphasis identifies the next action, while a stable name preserves task context during pending work.

Checked by: review only. Look for: Toggle an explicitly supplied loading boolean. The action keeps its name and bounds, rejects repeat activation and retains visible keyboard focus in both themes.

Source evidence:
- src/components/v4/ui/button.tsx
- src/pages/design-system/examples/button/default.tsx

### button-size-and-state-comparison

Owner: button.

When primary and supporting actions appear beside one another.

Do: Use the supported size recipes for peer actions and keep the shared lime paint. Passing loading never changes padding, so pass it whenever the operation can become pending.

Avoid: Compensate for a borderless appearance with caller padding, add a new gradient or remove the action label while loading.

Why: A shared size owns border-inclusive geometry; state and emphasis should not move the neighboring actions.

Checked by: review only. Look for: Compare filled and outline peers at every supported text size, then enter pending and keyboard focus. Their outer heights and alignment remain stable without caller geometry patches.

Source evidence:
- src/components/v4/ui/button.tsx
- src/pages/design-system/examples/button/default.tsx

## State guidance

- pending: Pass loading={pending}. The spinner overlays the button, so its width and padding stay the same whether loading is absent, false or true. With a leading icon the spinner replaces the icon and the label stays readable. Report success only after the actual operation completes.
- disabled: Explain policy or prerequisites outside a disabled control because it cannot receive focus.

## Presentation rules

Do: Write action labels that name the outcome.

Avoid: Show default, primary, outline and ghost as the human-facing action labels.

Why: Variant names belong in comparison captions. Product action labels identify the outcome.

## Import and exports

- src/components/v4/ui/button.tsx
- src/components/v4/ui/button-material.module.css
- src/components/v4/tokens.json

Exports: Button, buttonVariants. Source TypeScript defines the API.

## Behavior

- Primary (and default, its alias) is the ink fill with an on-ink label at 600 for the one main action in a view or dialog; hover moves to text2. Accent keeps the bright lime face with owned inset illumination, for approval and grant moments only, never as a second primary. Ghost hover is ink at opacity-hover (6% light, 12% dark), so it shows on raised surfaces. Other variants retain their semantic roles. link is link-coloured text that underlines on hover. Native button and slot composition preserve interaction semantics.
- The text sizes are 32px (default, with sm as its alias), 36px (md) and 40px (lg), with 10, 14 and 16px insets and the shared 14px label. icon matches default at 32px and icon-lg matches lg at 40px; iconOnly makes any text size square. xs, icon-xs (24px) and icon-sm (28px) are nested and chrome sizes. Nested control actions consume the host slot instead of inheriting a standalone action's geometry. Size names do not guarantee a touch target.

## Accessibility

- Use a real button for an action and asChild with an anchor for navigation. Name icon-only buttons. Native disabled removes activation, while loading remains focusable and exposes busy/disabled semantics.

## Use cases

- Choose emphasis with variant and geometry with size. default, primary and accent share one lime treatment; default and sm are size aliases. Give a pending action a leading icon when its label must stay visible while it works.

## Limits

- The owner runs the operation and updates loading. Button does not start requests, show result notifications or impose a destructive confirmation.
- Button has no read-only prop. Use disabled for unavailable actions, or show read-only content without an action.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### variant

- default: example `default`, visible label "default".
- accent: example `default`, visible label "accent".
- outline: example `default`, visible label "outline".
- ghost: example `default`, visible label "ghost".
- destructive: example `default`, visible label "destructive".
- link: example `default`, visible label "link".
- primary: omitted. Default is the alias of primary: the same ink fill.
- secondary: omitted. A tint-filled peer of outline for dense toolbars. It adds no new decision to the comparison.
- danger-ghost: omitted. The quiet form of destructive for a row action next to other ghost actions. Same red text as destructive without the fill.

### size

- default: example `sizes`, visible label "default, sm".
- sm: example `sizes`, visible label "default, sm"; alias of default.
- md: example `sizes`, visible label "md".
- lg: example `sizes`, visible label "lg".
- icon: example `sizes`, visible label "icon".
- icon-lg: example `sizes`, visible label "icon-lg".
- xs: omitted. 24px, below the 32/36/40 control scale. Reserved for actions nested inside another control, such as a chip or a field slot.
- icon-xs: omitted. 24px nested icon action, the icon partner of xs. Same reason as xs.
- icon-sm: omitted. 28px icon action for overlay chrome such as a dialog or sheet close. It sits inside a header, never beside text Buttons.

### icon placement

- none: example `default`, visible label "outline".
- leading: example `composition`, visible label "Leading icon".
- trailing: example `composition`, visible label "Trailing icon".
- icon-only: example `composition`, visible label "Icon only".

### state and behavior

- idle: example `states`, visible label "Idle".
- disabled: example `states`, visible label "Disabled".
- pending: example `states`, visible label "Loading".
- pending with icon: example `states`, visible label "Loading with icon".
- controlled loading=false: example `states`, visible label "Idle".
- slotted anchor: example `composition`, visible label "Trailing icon".
- invalid: omitted. aria-invalid draws the red control border. A Button is rarely the invalid control; the field it opens carries the error.
- selected: omitted. selected sets aria-pressed and paints the shared selected recipe. Toggle shows that recipe; use Toggle for a persistent pressed choice.
- read-only: omitted. Button has no read-only prop. Read-only content does not imply an available action; unavailable actions use disabled.
- local result: omitted. Button exposes loading and activation. Requests, draft persistence, results and retry are owned by its caller.
- local failure and retry: omitted. Button exposes loading and activation. Requests, draft persistence, results and retry are owned by its caller.

## Executable examples

### Variants

Save this example at `src/pages/design-system/examples/button/default.tsx`; its relative imports are generated for that exact path. States: default, loading.

Registry items used: @infisical/button. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useEffect, useRef, useState } from "react";
import { Button } from "../../../../components/v4/ui/button";
export default function Example() {
    const [pending, setPending] = useState(false);
    const timer = useRef<ReturnType<typeof setTimeout>>();
    useEffect(() => () => clearTimeout(timer.current), []);
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Button loading={pending} onClick={() => {
            setPending(true);
            timer.current = setTimeout(() => setPending(false), 900);
        }}>
          Save changes
        </Button>
      </div><figcaption className="text-muted-foreground text-xs">{"default"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Button variant="accent">Grant for 1 hour</Button>
      </div><figcaption className="text-muted-foreground text-xs">{"accent"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Button variant="outline">Edit settings</Button>
      </div><figcaption className="text-muted-foreground text-xs">{"outline"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Button variant="ghost">Cancel</Button>
      </div><figcaption className="text-muted-foreground text-xs">{"ghost"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Button variant="destructive">Delete project</Button>
      </div><figcaption className="text-muted-foreground text-xs">{"destructive"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Button variant="link" asChild>
          <a href="#input">Input guide</a>
        </Button>
      </div><figcaption className="text-muted-foreground text-xs">{"link"}</figcaption></figure>
    </div>);
}
```

### Sizes

Save this example at `src/pages/design-system/examples/button/sizes.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Button variant="outline">Save changes</Button>
      </div><figcaption className="text-muted-foreground text-xs">{"default, sm"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Button size="md" variant="outline">
          Save changes
        </Button>
      </div><figcaption className="text-muted-foreground text-xs">{"md"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Button size="lg" variant="outline">
          Save changes
        </Button>
      </div><figcaption className="text-muted-foreground text-xs">{"lg"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Button size="icon" variant="outline" icon="settings" iconOnly aria-label="Settings"/>
      </div><figcaption className="text-muted-foreground text-xs">{"icon"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Button size="icon-lg" variant="outline" icon="settings" iconOnly aria-label="Settings"/>
      </div><figcaption className="text-muted-foreground text-xs">{"icon-lg"}</figcaption></figure>
    </div>);
}
```

### Loading and disabled

Save this example at `src/pages/design-system/examples/button/states.tsx`; its relative imports are generated for that exact path. States: default, loading, disabled.

Registry items used: @infisical/button. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Button loading={false}>Save changes</Button>
      </div><figcaption className="text-muted-foreground text-xs">{"Idle"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Button loading>Save changes</Button>
      </div><figcaption className="text-muted-foreground text-xs">{"Loading"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Button variant="outline" icon="plus" loading>
          Add connection
        </Button>
      </div><figcaption className="text-muted-foreground text-xs">{"Loading with icon"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Button disabled>Save changes</Button>
      </div><figcaption className="text-muted-foreground text-xs">{"Disabled"}</figcaption></figure>
    </div>);
}
```

### Icons and links

Save this example at `src/pages/design-system/examples/button/composition.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Button icon="plus">Add connection</Button>
      </div><figcaption className="text-muted-foreground text-xs">{"Leading icon"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Button variant="outline" iconRight="chev-right" asChild>
          <a href="#pagination">Continue</a>
        </Button>
      </div><figcaption className="text-muted-foreground text-xs">{"Trailing icon"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Button variant="ghost" size="icon" icon="eye" iconOnly aria-label="Show preview"/>
      </div><figcaption className="text-muted-foreground text-xs">{"Icon only"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#button and verify the documented interaction.
