# Animated collapse

Reveal a region without leaving hidden descendants in the tab order.

## Choose this component

Choose AnimatedCollapse when an optional region needs a height transition. Use Collapsible for a labeled disclosure contract and Accordion for several sections.

## Usage rules

### animated-collapse-usage

Owner: animated-collapse.

When the region contains the currently focused control when it closes.

Do: Move focus to the disclosure trigger before closing and keep hidden descendants out of the tab order.

Avoid: Animate a region away while leaving keyboard focus in invisible content.

Why: A visual transition does not resolve focus ownership.

Checked by: review only. Look for: Close a region while a descendant has focus; focus reaches its disclosure trigger and Tab cannot enter hidden content, including with reduced motion.

Source evidence:
- src/components/v4/ui/animated-collapse.tsx
- src/pages/design-system/examples/animated-collapse/default.tsx

## State guidance

- closing: Choose a focus return target before hiding focused content.
- reduced-motion: Keep the same open and closed meaning without relying on the animation.

## Presentation rules

Do: Animate the actual disclosure height only when it helps continuity.

Avoid: Add a delayed animated reveal to ordinary static instructions.

Why: Motion should explain a state change rather than make reading wait.

## Import and exports

- src/components/v4/ui/animated-collapse.tsx
- src/components/v4/ui/text.module.css

Exports: AnimatedCollapse. Source TypeScript defines the API.

## Behavior

- Open state controls a grid-height transition; lazy mode mounts on first open and retains child state through later closes.
- Initial open content appears without an entry animation; reduced motion opens and closes immediately.

## Accessibility

- As soon as it starts closing, the content leaves the tab order and screen readers stop reading it.
- Caller connects its trigger with aria-expanded and aria-controls.

## Use cases

- Provide a separate labeled disclosure trigger, choose lazy deliberately and move focus to that trigger before the host closes a focused region.

## Avoid

- Treat AnimatedCollapse as a complete disclosure control or remount its children on every close to animate them.

## Limits

- Caller owns focus return if closing a region that contains focus.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### mount policy

- lazy: example `default`, visible label "Advanced settings".
- eager: omitted. Cut to keep the page to the essentials; the animated-collapse fixture test renders it as "Eager connection details".

### size support


- no authored named size: omitted. This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API.

## Executable examples

### Optional retention details

Save this example at `src/pages/design-system/examples/animated-collapse/default.tsx`; its relative imports are generated for that exact path. States: default, keyboard.

Registry items used: @infisical/animated-collapse, @infisical/button, @infisical/field, @infisical/input. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { AnimatedCollapse } from "../../../../components/v4/ui/animated-collapse";
import { Button } from "../../../../components/v4/ui/button";
import { Field } from "../../../../components/v4/ui/field";
import { Input } from "../../../../components/v4/ui/input";
export default function Example() {
    const [open, setOpen] = useState(false);
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <Button aria-expanded={open} aria-controls="advanced-settings" onClick={() => setOpen(!open)}>
        Advanced settings
      </Button>
      <AnimatedCollapse className="w-full" id="advanced-settings" open={open} lazy>
        <Field label="Retention note" description="This draft survives closing and reopening the region.">
          <Input defaultValue="Keep for 30 days"/>
        </Field>
      </AnimatedCollapse>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- runtime: npm test -- src/components/v4/ui/selection-disclosure.test.tsx
- browser: npm run ui:dev; open /design-system#animated-collapse and exercise the documented interaction.
