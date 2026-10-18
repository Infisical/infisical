# Input Group

Compose a text input with leading and trailing controls.

## Choose this component

Choose InputGroup when one value has a prefix, suffix or adjacent tool. Use FieldGroup for several independent values.

## Usage rules

### input-group-usage

Owner: input-group.

When a URL field has a scheme prefix and a clear action.

Do: Keep one editable input, make the prefix part of the visible context, and name the clear button.

Avoid: Put a second editable value inside an addon or make the prefix look editable when it is not.

Why: The group should still describe one value with one label and error.

Checked by: review only. Look for: Name and operate the group with keyboard only. There is one intended editable value, and prefix/suffix or clear actions do not become a second ambiguous field or submit the form.

Source evidence:
- src/components/v4/ui/input-group.tsx
- src/pages/design-system/examples/input-group/default.tsx

### input-group-host-and-nested-control

Owner: input-group.

When a field includes prefixes, suffixes or an embedded action.

Do: Use InputGroupAddon and InputGroupButton with the host size, keep labels outside the editable value and let nested controls retain their own activation.

Avoid: Place a full standalone Button inside the field with caller height patches, or let clicking Copy focus and alter the input instead.

Why: The host and its action need compatible geometry and separate interaction ownership.

Checked by: review only. Look for: Compare sm, md and lg groups with text and icon actions. Nested activation does its named work, does not trigger addon focus behavior and does not enlarge the host unexpectedly.

Source evidence:
- src/components/v4/ui/input-group.tsx
- src/pages/design-system/examples/input-group/default.tsx

## State guidance

- empty: Keep units or scheme visible when they are necessary to interpret the empty value.
- clear: Clear the intended input without submitting the enclosing form.

## Presentation rules

Do: Use addons for units and tools that act on this value.

Avoid: Add decorative icons and badges to both sides of every field.

Why: Extra chrome reduces space for the value without improving the decision.

Do: Keep addons around one editable value and make every embedded action update that value.

Avoid: Show a decorative Clear action or infer an inner action height from the outer group size.

Why: Addons share context without changing the input identity or the action recipe.

## Import and exports

- src/components/v4/ui/input-group.tsx

Exports: InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput, InputGroupText, InputGroupTextarea. Source TypeScript defines the API.

## Behavior

- The default host is sm32; explicit md36 and lg40 retain 24/28/32px nested action slots. Nested buttons fit the host slot even when a larger standalone size is requested.
- InputGroup supports sm/md/lg, joined addons and actions, plus Field association. Addons do not become a second input.

## Accessibility

- Keep one named editable control in each input group. Action buttons need separate names.

## Use cases

- Build compound fields from the shared control, addon and action parts instead of assembling another independently styled field.

## Limits

- Addon click-to-focus ignores nested interactive controls; it does not register keyboard shortcuts or write to the clipboard.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### size

- sm: example `sizes`, visible label "sm".
- md: example `sizes`, visible label "md".
- lg: example `sizes`, visible label "lg".

### InputGroupAddon.align

- inline-start: example `addons`, visible label "inline-start".
- inline-end: example `addons`, visible label "inline-end".
- block-start: example `addons`, visible label "block-start".
- block-end: example `addons`, visible label "block-end".

### InputGroupButton.size

- xs: example `buttons`, visible label "xs".
- sm: example `buttons`, visible label "sm".
- icon-xs: example `buttons`, visible label "icon-xs".
- icon-sm: example `buttons`, visible label "icon-sm".

### state

- invalid root: example `default`, visible label "Required path".
- read-only: example `default`, visible label "Managed path".
- disabled: example `default`, visible label "Unavailable path".
- controlled clear: example `default`, visible label "Filter secrets".

### composition

- textarea: example `addons`, visible label "block-start".

## Executable examples

### States and clearing

Save this example at `src/pages/design-system/examples/input-group/default.tsx`; its relative imports are generated for that exact path. States: default, controlled, invalid, disabled, read-only.

Registry items used: @infisical/field, @infisical/icon, @infisical/input-group. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Field } from "../../../../components/v4/ui/field";
import { Icon } from "../../../../components/v4/ui/icon";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "../../../../components/v4/ui/input-group";
export default function Example() {
    const [query, setQuery] = useState("payments");
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Field label="Filter secrets">
          <InputGroup>
            <InputGroupAddon>
              <Icon name="search"/>
            </InputGroupAddon>
            <InputGroupInput value={query} onChange={(event) => setQuery(event.target.value)}/>
            <InputGroupAddon align="inline-end">
              <InputGroupButton onClick={() => setQuery("")} disabled={!query}>
                Clear
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </Field>
      </div><figcaption className="text-muted-foreground text-xs">{"Editable with clear action"}</figcaption></figure>
      <p role="status" className="sr-only text-sm">
        Filter: {query || "all secrets"}
      </p>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Field label="Required path" error="Choose an absolute path.">
          <InputGroup invalid>
            <InputGroupInput defaultValue="relative"/>
          </InputGroup>
        </Field>
      </div><figcaption className="text-muted-foreground text-xs">{"Invalid"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Field label="Managed path">
          <InputGroup>
            <InputGroupInput readOnly value="/policy"/>
          </InputGroup>
        </Field>
      </div><figcaption className="text-muted-foreground text-xs">{"Read-only"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Field label="Unavailable path">
          <InputGroup>
            <InputGroupInput disabled defaultValue="/archived"/>
          </InputGroup>
        </Field>
      </div><figcaption className="text-muted-foreground text-xs">{"Disabled"}</figcaption></figure>
    </div>);
}
```

### Sizes

Save this example at `src/pages/design-system/examples/input-group/sizes.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/field, @infisical/icon, @infisical/input-group. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Field } from "../../../../components/v4/ui/field";
import { Icon } from "../../../../components/v4/ui/icon";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "../../../../components/v4/ui/input-group";
const SizedField = ({ size }: {
    size: "sm" | "md" | "lg";
}) => {
    const [value, setValue] = useState("/payments");
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
      <Field label={`${size} path`}>
        <InputGroup size={size}>
          <InputGroupAddon>
            <Icon name="search"/>
          </InputGroupAddon>
          <InputGroupInput value={value} onChange={(event) => setValue(event.target.value)}/>
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="sm" disabled={!value} onClick={() => setValue("")}>
              Clear
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </Field>
    </div><figcaption className="text-muted-foreground text-xs">{size}</figcaption></figure>);
};
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      {(["sm", "md", "lg"] as const).map((size) => (<SizedField key={size} size={size}/>))}
    </div>);
}
```

### Addon placement

Save this example at `src/pages/design-system/examples/input-group/addons.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/field, @infisical/icon, @infisical/input-group. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Field } from "../../../../components/v4/ui/field";
import { Icon } from "../../../../components/v4/ui/icon";
import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText, InputGroupTextarea } from "../../../../components/v4/ui/input-group";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      {(["inline-start", "inline-end", "block-start", "block-end"] as const).map((align) => (<figure key={align} className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
          <Field label={`${align} query`}>
            <InputGroup>
              <InputGroupAddon align={align}>
                {align.startsWith("inline") ? (<Icon name="search"/>) : (<InputGroupText>Query</InputGroupText>)}
              </InputGroupAddon>
              {align.startsWith("inline") ? (<InputGroupInput defaultValue="payments"/>) : (<InputGroupTextarea rows={3} defaultValue="Select name from environments"/>)}
            </InputGroup>
          </Field>
        </div><figcaption className="text-muted-foreground text-xs">{align}</figcaption></figure>))}
    </div>);
}
```

### Action recipes

Save this example at `src/pages/design-system/examples/input-group/buttons.tsx`; its relative imports are generated for that exact path. States: default, controlled.

Registry items used: @infisical/field, @infisical/icon, @infisical/input-group. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Field } from "../../../../components/v4/ui/field";
import { Icon } from "../../../../components/v4/ui/icon";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "../../../../components/v4/ui/input-group";
export default function Example() {
    const [values, setValues] = useState({
        xs: "draft",
        sm: "draft",
        "icon-xs": "draft",
        "icon-sm": "draft"
    });
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      {(["xs", "sm", "icon-xs", "icon-sm"] as const).map((size) => (<figure key={size} className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
          <Field label={`${size} action`}>
            <InputGroup>
              <InputGroupInput value={values[size]} onChange={(event) => setValues({ ...values, [size]: event.target.value })}/>
              <InputGroupAddon align="inline-end">
                <InputGroupButton size={size} aria-label={`Clear ${size} draft`} disabled={!values[size]} onClick={() => setValues({ ...values, [size]: "" })}>
                  {size.startsWith("icon") ? <Icon name="x"/> : "Clear"}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </div><figcaption className="text-muted-foreground text-xs">{size}</figcaption></figure>))}
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#input-group and verify the documented interaction.
