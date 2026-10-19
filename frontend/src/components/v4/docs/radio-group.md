# Radio Group

Choose one option from a visible group.

## Choose this component

Choose RadioGroup when exactly one visible alternative is required. Use Checkbox for independent choices and ToggleGroup for optional pressed tools.

## Usage rules

### radio-group-usage

Owner: radio-group.

When the alternatives have different consequences or prices.

Do: Label each option and place its explanation beside it; keep one controlled value.

Avoid: Assume changing the selected radio persisted the setting before the form saves.

Why: Selection and persistence are separate unless the host applies the choice immediately.

Checked by: review only. Look for: Select each permitted alternative and submit or cancel the enclosing form; exactly one value is chosen and selection alone does not falsely claim it was saved.

Source evidence:
- src/components/v4/ui/radio-group.tsx
- src/pages/design-system/examples/radio-group/default.tsx

### radio-group-required-choice

Owner: radio-group.

When a form presents mutually exclusive choices.

Do: Use stable string values and a named group, connect help/error ids explicitly and let the host decide whether an empty value is valid.

Avoid: Use ToggleGroup when a required selection must remain, or assume RadioGroup consumes Field context without wiring.

Why: A radio choice and optional pressed tools have different empty-state and labeling contracts.

Checked by: review only. Look for: Arrow through enabled choices with a disabled option present. Group name, error description and selected value remain correct before and after validation.

Source evidence:
- src/components/v4/ui/radio-group.tsx
- src/pages/design-system/examples/radio-group/default.tsx

## State guidance

- empty: Allow an unset value only if the task permits it and explain the requirement on submit.
- disabled: Keep the unavailable option's explanation visible when it affects the choice.

## Presentation rules

Do: Write parallel option labels that expose the difference.

Avoid: Use a radio list as navigation to unrelated pages.

Why: A radio group communicates one value, not a route menu.

Do: Make empty, invalid and policy-disabled selection visible beside ordinary choices.

Avoid: Preselect an answer only to make the specimen look complete or use radio buttons for independent flags.

Why: Mutual exclusion and a deliberate empty value must remain understandable.

## Import and exports

- src/components/v4/ui/radio-group.tsx

Exports: RadioGroup, RadioGroupItem. Source TypeScript defines the API.

## Behavior

- RadioGroup uses one string value with value/defaultValue and onValueChange. Each RadioGroupItem contributes its own value and disabled state.

## Accessibility

- Name the group and each option with explicit labels. Arrow keys move the choice within the group, and each option announces whether it is checked. Associate any group error explicitly.

## Use cases

- Use a named RadioGroup for mutually exclusive values. State any requirement and connect validation explicitly.

## Limits

- RadioGroup does not consume Field context automatically; label the group and connect its description/error explicitly.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### orientation

- horizontal: example `orientations`, visible label "horizontal".
- vertical: example `orientations`, visible label "vertical".

### state

- empty uncontrolled: example `states`, visible label "Empty choice".
- invalid: example `states`, visible label "Required choice".
- disabled group: example `states`, visible label "Policy choice".
- disabled option: example `default`, visible label "archived".
- controlled: example `default`, visible label "Environment access".

## Executable examples

### Controlled access choice

Save this example at `src/pages/design-system/examples/radio-group/default.tsx`; its relative imports are generated for that exact path. States: controlled, keyboard.

Registry items used: @infisical/label, @infisical/radio-group. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { Label } from "../../../../components/v4/ui/label";
import { RadioGroup, RadioGroupItem } from "../../../../components/v4/ui/radio-group";

export default function Example() {
  const [value, setValue] = useState("staging");
  return (
    <fieldset className="min-w-0">
      <legend className="mb-3 text-sm font-medium">Environment access</legend>
      <RadioGroup value={value} onValueChange={setValue} aria-label="Environment access">
        {["staging", "production", "archived"].map((environment) => (
          <div key={environment} className="flex items-center gap-3">
            <RadioGroupItem
              id={`radio-${environment}`}
              value={environment}
              disabled={environment === "archived"}
            />
            <Label htmlFor={`radio-${environment}`}>{environment}</Label>
          </div>
        ))}
      </RadioGroup>
    </fieldset>
  );
}
```

### States

Save this example at `src/pages/design-system/examples/radio-group/states.tsx`; its relative imports are generated for that exact path. States: empty, invalid, disabled.

Registry items used: @infisical/field, @infisical/label, @infisical/radio-group. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { FieldDescription, FieldError } from "../../../../components/v4/ui/field";
import { Label } from "../../../../components/v4/ui/label";
import { RadioGroup, RadioGroupItem } from "../../../../components/v4/ui/radio-group";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      {[
            { id: "empty", name: "Empty choice", disabled: false, invalid: false },
            { id: "invalid", name: "Required choice", disabled: false, invalid: true },
            { id: "disabled", name: "Policy choice", disabled: true, invalid: false }
        ].map((item) => (<fieldset key={item.id} className="min-w-0 space-y-3">
          <legend className="text-sm">{item.name}</legend>
          <RadioGroup aria-label={item.name} disabled={item.disabled} aria-invalid={item.invalid || undefined} aria-describedby={item.invalid ? "radio-required-error" : undefined}>
            {["west", "east"].map((value) => (<div key={value} className="flex items-center gap-3">
                <RadioGroupItem id={`radio-${item.id}-${value}`} value={value} aria-invalid={item.invalid || undefined}/>
                <Label htmlFor={`radio-${item.id}-${value}`}>{value}</Label>
              </div>))}
          </RadioGroup>
          {item.invalid && <FieldError id="radio-required-error">Choose a region.</FieldError>}
          {item.disabled && <FieldDescription>Region is managed by policy.</FieldDescription>}
        </fieldset>))}
    </div>);
}
```

### Orientation

Save this example at `src/pages/design-system/examples/radio-group/orientations.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/label, @infisical/radio-group. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Label } from "../../../../components/v4/ui/label";
import { RadioGroup, RadioGroupItem } from "../../../../components/v4/ui/radio-group";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      {(["horizontal", "vertical"] as const).map((orientation) => (<figure key={orientation} className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
          <RadioGroup orientation={orientation} aria-label={`${orientation} region`} defaultValue="west">
            <div className={orientation === "horizontal" ? "flex flex-wrap gap-4" : "space-y-3"}>
              {["west", "east"].map((value) => (<div key={value} className="flex items-center gap-3">
                  <RadioGroupItem id={`radio-${orientation}-${value}`} value={value}/>
                  <Label htmlFor={`radio-${orientation}-${value}`}>{value}</Label>
                </div>))}
            </div>
          </RadioGroup>
        </div><figcaption className="text-muted-foreground text-xs">{orientation}</figcaption></figure>))}
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#radio-group and verify the documented interaction.
