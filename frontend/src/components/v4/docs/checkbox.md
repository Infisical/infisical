# Checkbox

Stage an independent choice, including a mixed selection state.

## Choose this component

Choose Checkbox for a staged independent choice or parent selection. Use RadioGroup for exactly one value and Switch for an immediately applied setting.

## Usage rules

### checkbox-usage

Owner: checkbox.

When a parent represents a subset of selected eligible rows.

Do: Show mixed when some children are selected and let the host compute checked state from the actual children.

Avoid: Treat mixed as checked or submit the checkbox's display string as permission truth.

Why: The parent summarizes selection; it cannot establish authorization or prove every child is included.

Checked by: review only. Look for: Select one child, then all eligible children, then clear them; the parent changes mixed/checked/unchecked and locked children retain their actual state.

Source evidence:
- src/components/v4/ui/checkbox.tsx
- src/pages/design-system/examples/checkbox/default.tsx

## State guidance

- mixed: Keep the parent label stable and expose indeterminate state.
- disabled: Retain the reason an option cannot be selected beside the choice.

## Presentation rules

Do: Describe the choice in a visible sentence or noun phrase.

Avoid: Use a standalone tiny checkbox as an unexplained decorative selection marker.

Why: People need to know what checking it will include.

Do: Keep checked, unchecked, mixed and policy-controlled choices inspectable with their visible labels.

Avoid: Count a disabled policy selection as an editable choice or put the only reason inside an unreachable control.

Why: People need to distinguish their draft changes from selections the host requires.

## Import and exports

- src/components/v4/ui/checkbox.tsx

Exports: Checkbox. Source TypeScript defines the API.

## Behavior

- Checkbox supports checked, unchecked and mixed values, labeled content and disabled policy states. The owner applies or stages its checked change.

## Accessibility

- Name the control. Screen readers announce the mixed state.

## Use cases

- Compute checked and indeterminate from the actual eligible children, preserve policy-disabled selections and stage the boolean when a later Save applies it.

## Avoid

- Treat indeterminate as true, count locked rows as selectable or use a Switch for a staged draft.

## Limits

- onCheckedChange can report indeterminate; the convenience onChange maps only true to true. The owner computes aggregate mixed state.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### state

- unchecked: example `states`, visible label "Off".
- checked: example `states`, visible label "On".
- indeterminate: example `states`, visible label "Mixed".
- disabled: example `states`, visible label "Disabled".
- label and description: example `default`, visible label "Audit environment".
- controlled mixed parent: example `default`, visible label "Select available environments".
- policy selection: example `default`, visible label "Audit environment".
- invalid: omitted. aria-invalid draws the red control border; Field shows the error rendering.
- long label: omitted. A stress case: a long label wraps beside the box, which stays top-aligned with the first line.

## Executable examples

### Controlled environment selection

Save this example at `src/pages/design-system/examples/checkbox/default.tsx`; its relative imports are generated for that exact path. States: controlled, keyboard.

Registry items used: @infisical/checkbox. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Checkbox } from "../../../../components/v4/ui/checkbox";
const environments = ["Staging", "Production"];
export default function Example() {
    const [selected, setSelected] = useState(["Staging"]);
    const all = selected.length === environments.length;
    const parentChecked = all || (selected.length > 0 ? "indeterminate" : false);
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <div className="flex items-center gap-3">
        <Checkbox id="checkbox-all" label="Select available environments" checked={parentChecked} onCheckedChange={(value) => setSelected(value === true ? environments : [])}/>
      </div>
      <div className="space-y-3 pl-6">
        {environments.map((environment) => (<div key={environment} className="flex items-center gap-3">
            <Checkbox id={`checkbox-${environment}`} label={environment} checked={selected.includes(environment)} onCheckedChange={(value) => setSelected((current) => value === true
                ? [...current, environment]
                : current.filter((item) => item !== environment))}/>
          </div>))}
        <div className="flex items-center gap-3">
          <Checkbox id="checkbox-policy" label="Audit environment" description="Required by policy." defaultChecked disabled/>
        </div>
      </div>
      <p role="status" className="sr-only">
        {selected.length} of {environments.length} available environments selected. This draft does
        not grant access.
      </p>
    </div>);
}
```

### States

Save this example at `src/pages/design-system/examples/checkbox/states.tsx`; its relative imports are generated for that exact path. States: default, disabled, invalid.

Registry items used: @infisical/checkbox. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Checkbox } from "../../../../components/v4/ui/checkbox";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Checkbox label="Deployments"/>
      </div><figcaption className="text-muted-foreground text-xs">{"Off"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Checkbox label="Deployments" defaultChecked/>
      </div><figcaption className="text-muted-foreground text-xs">{"On"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Checkbox label="All environments" indeterminate/>
      </div><figcaption className="text-muted-foreground text-xs">{"Mixed"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Checkbox label="Audit events" disabled defaultChecked/>
      </div><figcaption className="text-muted-foreground text-xs">{"Disabled"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#checkbox and verify the documented interaction.
