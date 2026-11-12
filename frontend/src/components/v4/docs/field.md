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
- src/components/v4/ui/helpers.module.css

Exports: Field, FieldContent, FieldDescription, FieldError, FieldGroup, FieldHelp, FieldLabel, FieldLegend, FieldSeparator, FieldSet, FieldTitle. Source TypeScript defines the API.

## Behavior

- Use label/description/error shorthand around one control for automatic ID, label, described-by and invalid-state association. Compound FieldLabel/FieldDescription/FieldError parts remain available for custom layouts. An error renders one way everywhere: a red alert icon and the message, several messages stacked under one icon. The label stays ink; the control's red border and the message carry the error. The label sits 6px above the control (the field-label space token). A stacked Field caps at the field measure (size-measure-field, 400px); wide lets it fill its column (size-measure-field-wide).
- label accepts a node, so a label can carry an info tooltip beside its text. Everything inside the label becomes part of the control's accessible name, so give an info trigger a short name and keep long help in description.
- description accepts a node, such as a search Highlight over the help text. It renders inside a paragraph, so pass phrasing content only. An error replaces it while one is set.
- help puts an info button beside the label, outside the label element, so it never joins the control's accessible name. A string becomes FieldHelp, an icon-xs ghost Button named More information whose Tooltip holds the text; a node renders as given, such as FieldHelp with its own label or GlobPatternHelp from the secret path input for fields that take glob patterns. The button keeps the label row at the label's line height, so a field with help lines up with its neighbours. In a compound layout, put FieldHelp after FieldLabel in an Inline with gap 4. Keep help short: it is a pass-through tooltip, and anything a person must read to fill the field belongs in description.
- A text link inside FieldDescription (an anchor that is not a Button or another slotted part) is a quiet link: the link color with no underline at rest, underlined on hover and keyboard focus, so help text with a Docs link stays calm.

## Accessibility

- The short form connects the label, help and error to a single control. In a compound layout, match htmlFor to the control's id and point aria-describedby at the help and error. Grouped controls take a group with a legend.

## Use cases

- Use vertical, horizontal or responsive Field composition to keep a value's visible name, help and correction together.
- Use wide on Fields inside a multi-column form row, such as host and port or name and TTLs in dynamic secret, secret rotation and app connection forms, so the row's grid sets each field's width.

## Avoid

- Use wide on a lone stacked field to stretch it across a card, or override size-measure-field locally to widen a row.

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

- label help: example `help`, visible label "Secret path".
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

Registry items used: @cipher/field, @cipher/input. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as UI from "../../../../components/v4/ui/field";
import { Input } from "../../../../components/v4/ui/input";

export default function Example() {
  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-6">
      <UI.FieldGroup>
        <UI.Field label="Connection name" description="Shown in activity logs.">
          <Input defaultValue="Production vault" />
        </UI.Field>
        <UI.Field label="Service account" error="Choose an account with read access.">
          <Input defaultValue="" />
        </UI.Field>
        <UI.Field>
          <UI.FieldLabel htmlFor="field-project">Project name</UI.FieldLabel>
          <Input id="field-project" defaultValue="payments" />
          <UI.FieldDescription>
            Use a name your team recognizes. <a href="https://infisical.com/docs">Naming guide</a>
          </UI.FieldDescription>
        </UI.Field>
      </UI.FieldGroup>
    </div>
  );
}
```

### Layouts

Save this example at `src/pages/design-system/examples/field/layouts.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @cipher/field, @cipher/input. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Field, FieldGroup } from "../../../../components/v4/ui/field";
import { Input } from "../../../../components/v4/ui/input";

export default function Example() {
  return (
    <FieldGroup>
      {(["vertical", "horizontal"] as const).map((orientation) => (
        <figure key={orientation} className="m-0 flex w-full min-w-0 flex-col gap-3">
          <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
            <Field orientation={orientation} label="Name">
              <Input aria-label={`${orientation} name`} defaultValue="staging" />
            </Field>
          </div>
          <figcaption className="text-muted-foreground text-xs">{orientation}</figcaption>
        </figure>
      ))}
    </FieldGroup>
  );
}
```

### Grouped fields

Save this example at `src/pages/design-system/examples/field/grouping.tsx`; its relative imports are generated for that exact path. States: default, invalid.

Registry items used: @cipher/checkbox, @cipher/field, @cipher/input. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Checkbox } from "../../../../components/v4/ui/checkbox";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
  FieldLegend,
  FieldSeparator,
  FieldSet
} from "../../../../components/v4/ui/field";
import { Input } from "../../../../components/v4/ui/input";

export default function Example() {
  return (
    <FieldGroup>
      <Field label="Description" optional>
        <Input placeholder="Purpose of this connection" />
      </Field>
      <Field label="Notifications" group description="Choose where to send local audit events.">
        <div className="space-y-3">
          <Checkbox label="Deployments" defaultChecked />
          <Checkbox label="Access changes" />
        </div>
      </Field>
      <FieldSeparator>Ownership</FieldSeparator>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <FieldSet>
            <FieldLegend>Service ownership</FieldLegend>
            <Field label="Owner">
              <Input defaultValue="platform" />
            </Field>
          </FieldSet>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"legend"}</figcaption>
      </figure>
      <Field>
        <FieldLabel htmlFor="field-multiple">Change request</FieldLabel>
        <Input
          id="field-multiple"
          required
          minLength={12}
          aria-invalid="true"
          aria-describedby="field-multiple-error"
        />
        <FieldError
          id="field-multiple-error"
          errors={[
            { message: "Use at least 12 characters." },
            { message: "Enter a change reason." },
            { message: "Use at least 12 characters." }
          ]}
        />
      </Field>
    </FieldGroup>
  );
}
```

### Search matches in label and description

Save this example at `src/pages/design-system/examples/field/search-matches.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @cipher/code, @cipher/field, @cipher/input, @cipher/text. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as React from "react";

import { Code } from "../../../../components/v4/ui/code";
import * as UI from "../../../../components/v4/ui/field";
import { Input } from "../../../../components/v4/ui/input";
import { Highlight } from "../../../../components/v4/ui/text";

const variables = [
  { key: "SMTP_HOST", description: "Hostname of the SMTP server that sends invites and alerts." },
  { key: "SMTP_PORT", description: "Port the SMTP server listens on, usually 587." }
];

export default function Example() {
  const [query, setQuery] = React.useState("smtp");
  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-6">
      <Input
        aria-label="Search keys and descriptions"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      <UI.FieldGroup>
        {variables.map((variable) => (
          <UI.Field
            key={variable.key}
            label={
              <Code>
                <Highlight text={variable.key} query={query} />
              </Code>
            }
            description={<Highlight text={variable.description} query={query} />}
          >
            <Input defaultValue="" />
          </UI.Field>
        ))}
      </UI.FieldGroup>
    </div>
  );
}
```

### Label help

Save this example at `src/pages/design-system/examples/field/help.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @cipher/field, @cipher/input, @cipher/layout, @cipher/secret-path-input. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as UI from "../../../../components/v4/ui/field";
import { Input } from "../../../../components/v4/ui/input";
import { Inline } from "../../../../components/v4/ui/layout";
import { GlobPatternHelp, SecretPathInput } from "../../../../components/v4/ui/secret-path-input";

export default function Example() {
  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-6">
      <UI.FieldGroup>
        <UI.Field
          label="Lease TTL"
          help="How long a generated credential stays valid before it is revoked."
        >
          <Input mono defaultValue="1h" />
        </UI.Field>
        <UI.Field label="Secret path" help={<GlobPatternHelp />}>
          <SecretPathInput defaultValue="/app/**" />
        </UI.Field>
        <UI.Field>
          <Inline gap={4} wrap={false}>
            <UI.FieldLabel htmlFor="field-help-role">Role slug</UI.FieldLabel>
            <UI.FieldHelp label="About role slugs">
              Lowercase letters, numbers and hyphens.
            </UI.FieldHelp>
          </Inline>
          <Input id="field-help-role" mono defaultValue="read-only" />
        </UI.Field>
      </UI.FieldGroup>
    </div>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run dev; open /design-system#field and verify the documented interaction.
