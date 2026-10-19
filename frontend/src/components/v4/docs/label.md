# Label

Give a form control a persistent accessible label.

## Choose this component

Choose Label for the persistent visible name of one labelable control. Use Field when the name also needs help or an error.

## Usage rules

### label-usage

Owner: label.

When a custom control is nested inside a styled wrapper.

Do: Point htmlFor at the actual focusable control id, or use the control's supported labeling relationship.

Avoid: Point htmlFor at a non-labelable div or use only placeholder text.

Why: The label must focus and name the control that receives input.

Checked by: review only. Look for: Click each label and inspect the control's accessible name. The actual input receives focus, and entering a value does not remove the visible name.

Source evidence:
- src/components/v4/ui/label.tsx
- src/pages/design-system/examples/label/default.tsx

## State guidance

- required: Keep the name readable and explain any required marker consistently.
- disabled: Keep the label legible even when the associated control is unavailable.

## Presentation rules

Do: Write a short name for the value being entered.

Avoid: Use Enter your followed by the same noun in every label.

Why: Repeated instructions lengthen forms without identifying a different field.

Do: Write the field purpose in plain words and mark required, optional and unavailable conditions where they matter.

Avoid: Use a placeholder as the only name or attach one label to several unrelated controls.

Why: A persistent label lets people identify and return to the intended control.

## Import and exports

- src/components/v4/ui/label.tsx

Exports: Label. Source TypeScript defines the API.

## Behavior

- Label forwards native htmlFor and ref through Radix Label; clicking it targets the associated labelable control.

## Accessibility

- Match htmlFor to the actual input ID or nest the control. Description and error text need their own aria-describedby association.

## Use cases

- Associate Label with the real control id, keep required or optional wording consistent and use Field when help and errors need coordinated wiring.

## Avoid

- Use a label as an unbound section heading or assume nearby text labels a custom control automatically.

## Limits

- Label does not connect help/error text or validate a value; Field shorthand can provide those associations for supported controls.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### association

- explicit: example `default`, visible label "Environment name".
- required: example `states`, visible label "Name (required)".
- optional: example `states`, visible label "Description (optional)".
- disabled group: example `states`, visible label "Managed name".

## Executable examples

### Label association

Save this example at `src/pages/design-system/examples/label/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/input, @infisical/label. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Input } from "../../../../components/v4/ui/input";
import * as UI from "../../../../components/v4/ui/label";
export default function Example() {
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <div className="flex flex-col gap-1.5">
        <UI.Label htmlFor="label-example">Environment name</UI.Label>
        <Input id="label-example" defaultValue="staging"/>
      </div>
    </div>);
}
```

### Required and unavailable fields

Save this example at `src/pages/design-system/examples/label/states.tsx`; its relative imports are generated for that exact path. States: default, disabled.

Registry items used: @infisical/input, @infisical/label. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Input } from "../../../../components/v4/ui/input";
import { Label } from "../../../../components/v4/ui/label";
export default function Example() {
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="label-required">Name (required)</Label>
        <Input id="label-required" required/>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="label-optional">Description (optional)</Label>
        <Input id="label-optional"/>
      </div>
      <div className="group flex flex-col gap-1.5" data-disabled="true">
        <Label htmlFor="label-disabled">Managed name</Label>
        <Input id="label-disabled" disabled defaultValue="platform"/>
      </div>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#label and verify the documented interaction.
