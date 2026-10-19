# Field

Connect a control to its label, description and validation error.

## Choose this component

Choose Field to connect a control with its label, help and error. Use FieldSet and FieldLegend for a group rather than assigning one label to several controls.

## Usage rules

### field-usage

Owner: field.

When a control fails validation after submission.

Do: Keep the entered value, associate the field-specific error with the focusable control and explain the repair without repeating the label.

Avoid: Put an error beside an unlabeled wrapper or show unrelated help and error as competing instructions.

Why: The person needs one clear repair instruction attached to the value they can change, not repeated helper copy competing with the error.

Checked by: review only. Look for: Activate each visible label and inspect the focused control's accessible description. Its own help/error is associated, and entered values survive invalid submission.

Source evidence:
- src/components/v4/ui/field.tsx
- src/pages/design-system/examples/field/default.tsx

### field-association-and-validation

Owner: field.

When a form control has a label, help and validation error.

Do: Use Field for supported automatic association, or connect explicit ids and ARIA descriptions for custom and compound controls; keep the label visible.

Avoid: Assume every child consumes Field context, use placeholder text as the label or show an invalid color with no associated explanation.

Why: Visual proximity does not create an accessible label or tell the person how to correct the value.

Checked by: review only. Look for: Focus each control with an error and inspect its name and description associations. The visible error is reachable, and custom controls retain explicit wiring.

Source evidence:
- src/components/v4/ui/field.tsx
- src/pages/design-system/examples/field/default.tsx

## State guidance

- optional: Mark optionality in the label area without replacing the control name.
- invalid: Retain the entered value and use an actionable field-specific error.

## Presentation rules

Do: Write help only when it changes how a person fills the field.

Avoid: Repeat the label as placeholder, description and tooltip.

Why: Repeated copy creates noise without adding a constraint or example.

Do: Associate each error with the editable control and preserve exact values while repairing it.

Avoid: Replace task-specific errors with a generic invalid badge or normalize a machine identifier in help text.

Why: The person must be able to locate the value and understand what can repair it.

## Import and exports

- src/components/v4/ui/field.tsx

Exports: Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet, FieldTitle. Source TypeScript defines the API.

## Behavior

- Use label/description/error shorthand around one control for automatic ID, label, described-by and invalid-state association. Compound FieldLabel/FieldDescription/FieldError parts remain available for custom layouts. An error renders one way everywhere: a red alert icon and the message, several messages stacked under one icon. The label stays ink; the control's red border and the message carry the error. The label sits 6px above the control (the field-label space token).

## Accessibility

- The short form connects the label, help and error to a single control. In a compound layout, match htmlFor to the control's id and point aria-describedby at the help and error. Grouped controls take a group with a legend.

## Use cases

- Use vertical, horizontal or responsive Field composition to keep a value's visible name, help and correction together.

## Limits

- Automatic association is limited to controls consuming Field context. Custom controls and compound parts need explicit IDs and ARIA wiring; validation is host-owned.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### orientation

- vertical: example `layouts`, visible label "vertical".
- horizontal: example `layouts`, visible label "horizontal".
- responsive: omitted. Vertical below the field group's md container width and horizontal above it. At this page width it is identical to horizontal.

### FieldLegend.variant

- legend: example `grouping`, visible label "legend".
- label: omitted. A legend set in the field-label type instead of the section title, for a short group inside a form. Same element and association as legend.

### composition

- automatic association: example `default`, visible label "Connection name".
- explicit association: example `default`, visible label "Project name".
- optional: example `grouping`, visible label "Description (optional)".
- group: example `grouping`, visible label "Notifications".
- separator: example `grouping`, visible label "Ownership".
- multiple errors: example `grouping`, visible label "Enter a change reason.".
- legend: example `grouping`, visible label "Service ownership".
- label legend: omitted. FieldLegend variant="label"; see the FieldLegend.variant axis.

## Executable examples

### Labels and errors

Save this example at `src/pages/design-system/examples/field/default.tsx`; its relative imports are generated for that exact path. States: default, invalid.

Registry items used: @infisical/field, @infisical/input. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as UI from "../../../../components/v4/ui/field";
import { Input } from "../../../../components/v4/ui/input";
export default function Example() {
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <UI.FieldGroup>
        <UI.Field label="Connection name" description="Shown in activity logs.">
          <Input defaultValue="Production vault"/>
        </UI.Field>
        <UI.Field label="Service account" error="Choose an account with read access.">
          <Input defaultValue=""/>
        </UI.Field>
        <UI.Field>
          <UI.FieldLabel htmlFor="field-project">Project name</UI.FieldLabel>
          <Input id="field-project" defaultValue="payments"/>
          <UI.FieldDescription>Use a name your team recognizes.</UI.FieldDescription>
        </UI.Field>
      </UI.FieldGroup>
    </div>);
}
```

### Layouts

Save this example at `src/pages/design-system/examples/field/layouts.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/field, @infisical/input. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Field, FieldGroup } from "../../../../components/v4/ui/field";
import { Input } from "../../../../components/v4/ui/input";
export default function Example() {
    return (<FieldGroup>
      {(["vertical", "horizontal"] as const).map((orientation) => (<figure key={orientation} className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
          <Field orientation={orientation} label="Name">
            <Input aria-label={`${orientation} name`} defaultValue="staging"/>
          </Field>
        </div><figcaption className="text-muted-foreground text-xs">{orientation}</figcaption></figure>))}
    </FieldGroup>);
}
```

### Grouped fields

Save this example at `src/pages/design-system/examples/field/grouping.tsx`; its relative imports are generated for that exact path. States: default, invalid.

Registry items used: @infisical/checkbox, @infisical/field, @infisical/input. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Checkbox } from "../../../../components/v4/ui/checkbox";
import { Field, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet } from "../../../../components/v4/ui/field";
import { Input } from "../../../../components/v4/ui/input";
export default function Example() {
    return (<FieldGroup>
      <Field label="Description" optional>
        <Input placeholder="Purpose of this connection"/>
      </Field>
      <Field label="Notifications" group description="Choose where to send local audit events.">
        <div className="space-y-3">
          <Checkbox label="Deployments" defaultChecked/>
          <Checkbox label="Access changes"/>
        </div>
      </Field>
      <FieldSeparator>Ownership</FieldSeparator>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <FieldSet>
          <FieldLegend>Service ownership</FieldLegend>
          <Field label="Owner">
            <Input defaultValue="platform"/>
          </Field>
        </FieldSet>
      </div><figcaption className="text-muted-foreground text-xs">{"legend"}</figcaption></figure>
      <Field>
        <FieldLabel htmlFor="field-multiple">Change request</FieldLabel>
        <Input id="field-multiple" required minLength={12} aria-invalid="true" aria-describedby="field-multiple-error"/>
        <FieldError id="field-multiple-error" errors={[
            { message: "Use at least 12 characters." },
            { message: "Enter a change reason." },
            { message: "Use at least 12 characters." }
        ]}/>
      </Field>
    </FieldGroup>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#field and verify the documented interaction.
