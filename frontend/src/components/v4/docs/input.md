# Input

Enter a single-line value with native input behavior.

## Choose this component

Choose Input for a single-line value with native editing. Use Textarea for multiple lines and SensitiveEditor when stored secret retrieval must be deferred.

## Usage rules

### input-usage

Owner: input.

When a value is readable and copyable but cannot be edited.

Do: Use readOnly and retain a visible label and selectable value.

Avoid: Disable the field solely to prevent editing when the task still requires copying.

Why: Disabled controls cannot receive focus and can block ordinary selection.

Checked by: review only. Look for: Edit, copy a read-only value and submit an invalid draft. The field keeps its persistent name and exact value; readonly does not accidentally become disabled.

Source evidence:
- src/components/v4/ui/input.tsx
- src/pages/design-system/examples/input/default.tsx
- src/pages/design-system/examples/input/editing.tsx

### input-value-and-affordances

Owner: input.

When a one-line value includes an icon, suffix or trailing control.

Do: Use Input's supported size, mono, icon and trailing options, preserve a visible label and keep read-only distinct from disabled.

Avoid: Pad the input locally to fit a suffix, register a shortcut only by setting kbd or format an exact identifier on every keystroke.

Why: The owned slots prevent collisions; displayed affordances do not implement shortcuts or value transformations.

Checked by: review only. Look for: Type a long value beside a long suffix, then test read-only, invalid and disabled states. Text and trailing controls stay separate and the original value is preserved.

Source evidence:
- src/components/v4/ui/input.tsx
- src/pages/design-system/examples/input/default.tsx
- src/pages/design-system/examples/input/editing.tsx

## State guidance

- invalid: Retain the draft and associate the error with the input.
- empty: Use an example placeholder only after supplying a persistent visible label.

## Presentation rules

Do: Choose a width that reflects the expected value.

Avoid: Stretch a two-digit field across the page or squeeze a resource path into a tiny box.

Why: Field measure communicates the expected input and affects review accuracy.

Do: Compare density with the same value, and include empty, long exact-value and read-only cases.

Avoid: Treat the native numeric size hint as another density or only test friendly short names.

Why: Geometry and editing behavior are different contracts, and long identifiers expose hidden padding mistakes.

## Import and exports

- src/components/v4/ui/input.tsx

Exports: Input. Source TypeScript defines the API.

## Behavior

- Input forwards its native ref and supports sm/md/lg at 32/36/40px, defaulting to sm32, with icon, mono, a read-only lock and trailing content while retaining native editing. A native numeric size is a width hint and retains the default 32px density.

## Accessibility

- Associate a label using Field or explicit htmlFor/id; use readOnly when the value must remain selectable.

## Use cases

- Choose sm, md or lg for one-line editing. Use supported icon and trailing slots, and mono only for a technical value.

## Limits

- Input keeps native input types and callbacks; formatting, validation and persistence belong to the host. Use Textarea for multiple lines.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### size

- sm: example `sizes`, visible label "sm".
- md: example `sizes`, visible label "md".
- lg: example `sizes`, visible label "lg".

### composition

- leading and trailing: example `editing`, visible label "Draft path".
- keyboard suffix: example `editing`, visible label "Draft path".
- native numeric hint: example `editing`, visible label "Native width hint".

### state

- empty: example `default`, visible label "Empty name".
- read-only: example `default`, visible label "Managed account".
- disabled: example `default`, visible label "Unavailable setting".
- invalid: example `default`, visible label "Environment slug".
- controlled: example `editing`, visible label "Draft path".

## Executable examples

### States

Save this example at `src/pages/design-system/examples/input/default.tsx`; its relative imports are generated for that exact path. States: default, disabled, invalid, read-only, empty.

Registry items used: @infisical/field, @infisical/input. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Field } from "../../../../components/v4/ui/field";
import { Input } from "../../../../components/v4/ui/input";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Field label="Environment name">
          <Input />
        </Field>
      </div><figcaption className="text-muted-foreground text-xs">{"Empty"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Field label="Managed account" description="Set by the connected provider.">
          <Input readOnly value="deploy-production"/>
        </Field>
      </div><figcaption className="text-muted-foreground text-xs">{"Read-only"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Field label="Environment name">
          <Input disabled defaultValue="Inherited from policy"/>
        </Field>
      </div><figcaption className="text-muted-foreground text-xs">{"Disabled"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Field label="Environment slug" error="Use letters, numbers and hyphens.">
          <Input invalid defaultValue="production /"/>
        </Field>
      </div><figcaption className="text-muted-foreground text-xs">{"Invalid"}</figcaption></figure>
    </div>);
}
```

### Sizes

Save this example at `src/pages/design-system/examples/input/sizes.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/field, @infisical/input. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Field } from "../../../../components/v4/ui/field";
import { Input } from "../../../../components/v4/ui/input";
export default function Example() {
    return (<div aria-label="Input sizes" className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      {(["sm", "md", "lg"] as const).map((size) => (<figure key={size} className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
          <Field label={`${size} name`}>
            <Input size={size} defaultValue="staging"/>
          </Field>
        </div><figcaption className="text-muted-foreground text-xs">{size}</figcaption></figure>))}
    </div>);
}
```

### Controlled editing

Save this example at `src/pages/design-system/examples/input/editing.tsx`; its relative imports are generated for that exact path. States: controlled, keyboard.

Registry items used: @infisical/field, @infisical/input. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Field } from "../../../../components/v4/ui/field";
import { Input } from "../../../../components/v4/ui/input";
export default function Example() {
    const [value, setValue] = useState("/services/payments");
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Field label="Draft path">
          <Input aria-label="Draft path" icon="search" mono kbd="⌘ K" trailing="path" value={value} onChange={(event) => setValue(event.target.value)}/>
        </Field>
      </div><figcaption className="text-muted-foreground text-xs">{"Filled"}</figcaption></figure>
      <p role="status" className="sr-only text-sm break-all whitespace-pre-wrap" data-draft-value>
        {value}
      </p>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Field label="Native width hint" description="Short internal identifier.">
          <Input size={12} defaultValue="staging"/>
        </Field>
      </div><figcaption className="text-muted-foreground text-xs">{"Filled"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#input and verify the documented interaction.
