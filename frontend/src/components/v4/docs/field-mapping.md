# Field mapping

Map each source field to the value or name it becomes, one aligned row per field.

## Choose this component

Choose FieldMapping for two or more fixed source fields that each need a value. Use a single Field for one input, and DataList to show a mapping that cannot be edited.

## Usage rules

### field-mapping-control-height

Owner: field-mapping.

When a source label sits in the same row as the Input it maps to.

Do: Let FieldMappingRow render the source as a control-height Badge that matches the Input size.

Avoid: A compact 20px Badge or a hand-sized span beside a 32px Input.

Why: A badge that shares a row with regular-height controls takes the control height, so the row reads as one band and the arrow centers on both.

Checked by: review only. Look for: Measure a mapping row: the source Badge, the arrow cell and the Input share one height.

Source evidence:
- src/components/v4/patterns/field-mapping.tsx
- src/pages/design-system/examples/field-mapping/default.tsx

### field-mapping-sentence-case

Owner: field-mapping.

When writing the header row.

Do: Name both columns in sentence case for what they hold, such as Source field and Secret name.

Avoid: Title Case headers like Rotated Credentials, or an empty header over the inputs.

Why: The headers are the only visible labels for the inputs.

Checked by: review only. Look for: Read the header row for sentence case and a noun per column.

Source evidence:
- src/pages/design-system/examples/field-mapping/default.tsx

## State guidance

- invalid: The FieldError sits under its own Input; the source Badge and arrow stay put.

## Presentation rules

Do: Use a soft Badge with the field's own glyph for the source.

Avoid: Color each source by status or add a left accent bar to the row.

Why: The source is a name, not a state.

## Import and exports

- src/components/v4/patterns/field-mapping.tsx
- src/components/v4/patterns/field-mapping.module.css

Exports: FieldMapping, FieldMappingRow. Source TypeScript defines the API.

## Behavior

- FieldMapping is a fieldset with a visually hidden legend and a three-column grid: a sentence case header row (sourceHeader, then targetHeader with an optional targetHint such as an InfoTip), then one FieldMappingRow per field. The grid keeps every source, arrow and input in one column track, so the columns align however long a source name is.
- Each FieldMappingRow is a soft source Badge at the row's control height (size control-sm, control-md or control-lg, from FieldMapping size), a muted arrow glyph centered on the same height, and an Input of the matching size. The Badge stretches to the source column with its label at the start, so every arrow lines up.
- FieldMappingRow takes every Input prop except size and invalid, so trailing, mono, placeholder, value, onChange and ref pass straight through. A trailing slot keeps the Input's nested slot: put the compact Badge (default md) there, not a control-height one. error renders a FieldError under the Input and marks it invalid.
- The Input's accessible name defaults to targetHeader for source (Secret name for Access key ID); pass aria-label to replace it.

## Accessibility

- The legend names the whole group. Each Input is named by its source and the target header, so a screen reader hears which field it maps without seeing the grid. The arrow is decorative and hidden.

## Use cases

- Use FieldMapping wherever a form maps named source fields to secret names or values: rotation credentials, honey token keys, sync and import mappings.

## Avoid

- Build a page-local grid of a span chip, an arrow and an Input. FieldMapping replaces those layouts.

## Limits

- The target column is always an Input. A mapping whose target is a Select, or whose direction runs from a picked column to a fixed field, is not covered yet.
- The host owns values, validation and defaults; FieldMapping only lays the rows out.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### size

- sm: example `default`, visible label "sm".
- md: omitted. Same layout at the 36px control height; Badge sizes shows control-md beside a md Input.
- lg: omitted. Same layout at the 40px control height; Badge sizes shows control-lg beside a lg Input.

## Executable examples

### Mapping rows with a trailing badge

Save this example at `src/pages/design-system/examples/field-mapping/default.tsx`; its relative imports are generated for that exact path. States: default, invalid.

Registry items used: @cipher/badge, @cipher/field-mapping. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { FieldMapping, FieldMappingRow } from "../../../../components/v4/patterns/field-mapping";
import { Badge } from "../../../../components/v4/ui/badge";

const fields = [
  { key: "accessKeyId", source: "Access key ID", icon: "key", placeholder: "AWS_ACCESS_KEY_ID" },
  {
    key: "secretAccessKey",
    source: "Secret access key",
    icon: "lock",
    placeholder: "AWS_SECRET_ACCESS_KEY"
  }
] as const;

export default function Example() {
  const [values, setValues] = useState<Record<string, string>>({
    accessKeyId: "AWS_ACCESS_KEY_ID",
    secretAccessKey: ""
  });
  return (
    <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
      <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
        <FieldMapping
          legend="Honey token secret names"
          sourceHeader="Source field"
          targetHeader="Value"
          size="sm"
        >
          {fields.map((field) => (
            <FieldMappingRow
              key={field.key}
              source={field.source}
              icon={field.icon}
              mono
              value={values[field.key]}
              placeholder={field.placeholder}
              autoComplete="off"
              spellCheck={false}
              trailing={<Badge tone="warn">Decoy</Badge>}
              error={values[field.key] ? undefined : "Enter a secret name."}
              onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}
            />
          ))}
        </FieldMapping>
      </div>
      <figcaption className="text-muted-foreground text-xs">
        {"sm, with a trailing Decoy badge and one missing value"}
      </figcaption>
    </figure>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run dev; open /design-system/patterns/field-mapping and compare row heights.
