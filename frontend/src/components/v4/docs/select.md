# Select

Choose one value from a Radix listbox.

## Choose this component

Choose Select for one known value when a custom grouped popup is useful. Use Combobox when the list needs search.

## Usage rules

### select-usage

Owner: select.

When the saved option is temporarily unavailable.

Do: Keep its label visible and explain why a different choice may be needed rather than silently clearing it.

Avoid: Offer hundreds of unsearchable rows or encode an empty placeholder as a real option.

Why: The popup should make one known choice easy to inspect and change.

Checked by: review only. Look for: Choose, reopen and inspect a known option. The saved label remains distinguishable; a large unsearchable option set is redirected to an appropriate searchable picker.

Source evidence:
- src/components/v4/ui/select.tsx
- src/pages/design-system/examples/select/default.tsx

### select-selected-value

Owner: select.

When an option includes a long description.

Do: Keep the label in the selected trigger and the associated description right-aligned on the menu option's row. Let the trigger fill its field, keep descriptions short and widen the menu with menuWidth when long metadata must stay readable.

Avoid: Concatenate the description into the selected label or grow the trigger beyond the preview.

Why: Supplementary context must remain readable without changing the saved identity or pushing neighboring controls away.

Checked by: review only. Look for: Select the long described option at 320px with doubled root text. The trigger fills its field, contains only the selected label, and reopening shows the label and associated description on one row, truncated with an ellipsis when the menu is narrower than the text. Repeat with controlled and default-valued Selects.

Source evidence:
- src/components/v4/ui/select.tsx
- src/pages/design-system/examples/select/metadata.tsx

## State guidance

- empty: Show a placeholder until a valid option is selected.
- disabled: Explain the prerequisite outside a disabled trigger because it cannot receive focus.
- long selected label: Keep only the option label in the trigger. The bounded trigger can truncate a long label; reopening shows the label and associated description in the menu, and menuWidth gives long metadata more room.

## Presentation rules

Do: Group options only when the group names help distinguish choices.

Avoid: Add icons and separators to every row of a short homogeneous list.

Why: Unnecessary grouping slows the simple selection the control is intended to support.

Do: Keep low-level trigger sizes and menu placement as separate supported compositions.

Avoid: Treat every high-level prop as a low-level Content prop or describe an in-memory Select as searchable.

Why: Select supports fewer options than the lower-level parts it wraps, so a prop that works on one may not exist on the other.

## Import and exports

- src/components/v4/ui/select.tsx
- src/components/v4/ui/picker.module.css

Exports: Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectScrollDownButton, SelectScrollUpButton, SelectSeparator, SelectTrigger, SelectValue. Source TypeScript defines the API.

## Behavior

- Default and sm are 32px aliases; md is 36px and lg is 40px.
- Select accepts grouped options, disabled entries, label/placeholder, size and invalid state, or retained Radix parts. value/defaultValue and onChange/onValueChange use the selected string.
- The selected trigger contains the option label only. Option descriptions remain readable in the menu and are associated through aria-describedby; they do not change the stored value.
- The trigger fills its Field like an Input, and the menu opens at the trigger's width. menuWidth overrides the menu width; keep it at least the trigger's width.
- Each option is one 32px row: the label on the left, its description muted and right-aligned on the same row, and the check for the chosen option at the end. A long label or description truncates.

## Accessibility

- Provide a persistent label. Connect invalid feedback with aria-describedby and preserve disabled semantics.

## Use cases

- Use Select for a closed list, choose supported trigger sizing and keep purpose visible through an external Field label.

## Avoid

- Use placeholder text as the only name, pass an object as a value or imply the menu performs remote search.

## Limits

- Options are local and string-valued; remote search, custom object identity and persisted changes belong to the host.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### size

- sm: example `sizes`, visible label "default, sm"; alias of default.
- default: example `sizes`, visible label "default, sm".
- md: example `sizes`, visible label "md".
- lg: example `sizes`, visible label "lg".

### SelectTrigger.size

- sm: example `sizes`, visible label "default, sm"; alias of default.
- default: example `sizes`, visible label "default, sm".
- md: example `sizes`, visible label "md".
- lg: example `sizes`, visible label "lg".

### alignment


- start: omitted. The menu's alignment shows only while it is open and moves it a few pixels against the trigger, so a static page cannot show it. start is the default.
- center: omitted. Set align on SelectContent; the closed trigger looks the same.
- end: omitted. Set align on SelectContent; the closed trigger looks the same.

### state

- empty: example `states`, visible label "Placeholder".
- invalid: example `states`, visible label "Invalid".
- disabled: example `states`, visible label "Disabled".
- disabled option: example `default`, visible label "pr-490".
- controlled: example `default`, visible label "Current environment:".

### composition

- long metadata: example `metadata`, visible label "Menu at trigger width, metadata truncates".
- menu width: example `metadata`, visible label "Long metadata, wide menu".

## Executable examples

### Environment field

Save this example at `src/pages/design-system/examples/select/default.tsx`; its relative imports are generated for that exact path. States: default, controlled.

Registry items used: @infisical/field, @infisical/input, @infisical/select. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Field } from "../../../../components/v4/ui/field";
import { Input } from "../../../../components/v4/ui/input";
import { Select, type SelectOption } from "../../../../components/v4/ui/select";
const options: SelectOption[] = [
    { value: "dev", label: "Development", description: "138 secrets", group: "Active" },
    { value: "staging", label: "Staging", description: "96 secrets", group: "Active" },
    { value: "prod", label: "Production", description: "212 secrets", group: "Active" },
    { value: "pr-482", label: "pr-482", description: "Expires Oct 1", group: "Preview" },
    { value: "pr-490", label: "pr-490", description: "Expired", disabled: true, group: "Preview" }
];
export default function Example() {
    const [value, setValue] = useState("dev");
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <Field label="Secret name">
        <Input defaultValue="DATABASE_URL"/>
      </Field>
      <Field label="Environment">
        <Select options={options} value={value} onChange={setValue}/>
      </Field>
      <p role="status" className="sr-only text-sm">
        Current environment: {value}
      </p>
    </div>);
}
```

### Sizes

Save this example at `src/pages/design-system/examples/select/sizes.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/field, @infisical/select. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Field } from "../../../../components/v4/ui/field";
import { Select } from "../../../../components/v4/ui/select";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      {(["default", "md", "lg"] as const).map((size) => (<figure key={size} className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
          <Field label={`${size} region`}>
            <Select size={size} options={[
                { value: "west", label: "West" },
                { value: "east", label: "East" }
            ]} defaultValue="west"/>
          </Field>
        </div><figcaption className="text-muted-foreground text-xs">{size === "default" ? "default, sm" : size}</figcaption></figure>))}
    </div>);
}
```

### Long metadata and menu width

Save this example at `src/pages/design-system/examples/select/metadata.tsx`; its relative imports are generated for that exact path. States: default, overflow.

Registry items used: @infisical/field, @infisical/select. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Field } from "../../../../components/v4/ui/field";
import { Select } from "../../../../components/v4/ui/select";
const options = [
    { value: "west", label: "West", description: "2 projects" },
    {
        value: "long",
        label: "Long resource identifier",
        description: "environment_very_long_identifier_01234567890123456789"
    }
];
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Field label="Region">
          <Select options={options} defaultValue="west"/>
        </Field>
      </div><figcaption className="text-muted-foreground text-xs">{"Menu at trigger width, metadata truncates"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Field label="Region">
          <Select options={options} defaultValue="west" menuWidth="min(32rem, calc(100vw - 2rem))"/>
        </Field>
      </div><figcaption className="text-muted-foreground text-xs">{"Long metadata, wide menu"}</figcaption></figure>
    </div>);
}
```

### Placeholder, disabled and invalid

Save this example at `src/pages/design-system/examples/select/states.tsx`; its relative imports are generated for that exact path. States: empty, disabled, invalid.

Registry items used: @infisical/field, @infisical/select. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Field } from "../../../../components/v4/ui/field";
import { Select } from "../../../../components/v4/ui/select";
const options = [
    { value: "dev", label: "Development" },
    { value: "prod", label: "Production" }
];
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Field label="Environment">
          <Select options={options} placeholder="Choose an environment"/>
        </Field>
      </div><figcaption className="text-muted-foreground text-xs">{"Placeholder"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Field label="Environment">
          <Select options={options} defaultValue="prod" disabled/>
        </Field>
      </div><figcaption className="text-muted-foreground text-xs">{"Disabled"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Field label="Environment" error="Choose an environment.">
          <Select options={options} placeholder="Choose an environment"/>
        </Field>
      </div><figcaption className="text-muted-foreground text-xs">{"Invalid"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#select and verify the documented interaction.
