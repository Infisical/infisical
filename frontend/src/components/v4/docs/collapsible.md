# Collapsible

Show optional details from a single trigger.

## Choose this component

Choose Collapsible for one optional detail region. Use Accordion for several related sections and Switch for a saved boolean setting.

## Usage rules

### collapsible-usage

Owner: collapsible.

When a concise summary has supporting diagnostic detail.

Do: Keep the main task understandable while closed, use the disclosure for one optional detail and return focus before hiding a focused descendant.

Avoid: Hide prerequisites or the only recovery instructions merely to make the page shorter, or make opening details mutate a saved preference.

Why: Disclosure reduces visible secondary content; it must not make essential work depend on discovering hidden instructions.

Checked by: review only. Look for: Read the page with the region closed. The main task remains understandable, and opening or closing details does not mutate a saved setting or lose a focused draft.

Source evidence:
- src/components/v4/ui/collapsible.tsx
- src/pages/design-system/examples/collapsible/default.tsx

## State guidance

- closed: Keep the trigger visible and the hidden content out of the tab order.
- invalid: Reveal the region if it contains the field a submission requires the person to repair.

## Presentation rules

Do: Hide genuinely secondary detail behind a named trigger.

Avoid: Collapse every paragraph into More controls to make a page appear shorter.

Why: Repeated disclosure raises the cost of reading ordinary content.

## Import and exports

- src/components/v4/ui/collapsible.tsx

Exports: Collapsible, CollapsibleContent, CollapsibleTrigger. Source TypeScript defines the API.

## Behavior

- open/onOpenChange controls one disclosure; defaultOpen provides local initial state. Trigger toggles Content through the shared Radix root.

## Accessibility

- Use a named trigger button. It announces whether the region is open and which region it controls, and the content stays ordinary content rather than a menu.

## Use cases

- Keep Trigger and Content under the same Collapsible root, name the trigger for its content and choose controlled state when the host must coordinate closure.

## Avoid

- Use the open boolean as the value of a saved setting or add decorative plus/minus glyphs with no working trigger.

## Limits

- Collapsible coordinates one region; use Accordion when several sections need a shared single/multiple value contract.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### state

- uncontrolled: example `default`, visible label "View connection details".
- controlled: example `states`, visible label "Controlled, retained draft".
- disabled: example `states`, visible label "Disabled".
- forceMount: example `states`, visible label "Controlled, retained draft".

### size support


- no authored named size: omitted. This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API.

## Executable examples

### Connection details

Save this example at `src/pages/design-system/examples/collapsible/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/collapsible. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import * as UI from "../../../../components/v4/ui/collapsible";
export default function Example() {
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <UI.Collapsible>
        <UI.CollapsibleTrigger asChild>
          <Button variant="outline">View connection details</Button>
        </UI.CollapsibleTrigger>
        <UI.CollapsibleContent>
          <p className="mt-4">Last synchronized 12 versions.</p>
        </UI.CollapsibleContent>
      </UI.Collapsible>
    </div>);
}
```

### Controlled and disabled states

Save this example at `src/pages/design-system/examples/collapsible/states.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/collapsible, @infisical/input. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Button } from "../../../../components/v4/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../../../components/v4/ui/collapsible";
import { Input } from "../../../../components/v4/ui/input";
export default function Example() {
    const [open, setOpen] = useState(true);
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        <Collapsible open={open} onOpenChange={setOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline">Connection note</Button>
          </CollapsibleTrigger>
          <CollapsibleContent forceMount hidden={!open}>
            <div className="pt-3">
              <Input aria-label="Connection note" defaultValue="Keep for 30 days"/>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div><figcaption className="text-muted-foreground text-xs">{"Controlled, retained draft"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        <Collapsible disabled>
          <CollapsibleTrigger asChild>
            <Button variant="outline">Managed by policy</Button>
          </CollapsibleTrigger>
          <CollapsibleContent>Managed by administrators.</CollapsibleContent>
        </Collapsible>
      </div><figcaption className="text-muted-foreground text-xs">{"Disabled"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#collapsible and verify the documented interaction.
