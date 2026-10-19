# Multi-select

Choose several known options without closing after each selection.

## Choose this component

Choose MultiSelect for several known values from a searchable list. Use Checkbox for a few visible independent choices and Combobox for one value.

## Usage rules

### multi-select-usage

Owner: multi-select.

When a selection grants access only after a host operation succeeds.

Do: Keep selected option ids as draft state and let the host authorize and persist the result.

Avoid: Treat the checked UI as proof of permission or erase the draft after a rejected save.

Why: Selection is an input to authorization, not the authorization decision.

Checked by: review only. Look for: Search, select-all and uncheck while a disabled option is already selected. Eligible changes preserve protected choices and the resulting draft does not itself grant permission.

Source evidence:
- src/components/v4/ui/multi-select.tsx
- src/pages/design-system/examples/multi-select/default.tsx

### multi-select-selection-and-summary

Owner: multi-select.

When several known values include disabled selections or host-created options.

Do: Use sm or md, preserve disabled selections and deselect by unchecking.

Avoid: Infer granted permissions from chips, rewrite protected values through select-all or show allLabel when enabled options are not all selected.

Why: The summary represents supplied choices; it cannot authorize access or rewrite disabled policy values.

Checked by: review only. Look for: Select every option with Ctrl or Cmd+A, uncheck each option, change search during creation and choose a single value. Disabled selections survive, callbacks preserve option ordering and stale creation does not alter selection.

Source evidence:
- src/components/v4/ui/multi-select.tsx
- src/pages/design-system/examples/multi-select/default.tsx

## State guidance

- empty: Explain what may be selected without inventing an initial grant.
- overflow: Keep the selected count and a way to review selected options when chips no longer fit.

## Presentation rules

Do: Use labels that distinguish each selectable resource.

Avoid: Render dozens of full-width chips before the input and hide the search field below them.

Why: Selected-value display must leave room to continue selecting.

Do: Show empty, protected and long-value cases, and keep creation and permission results owned by the host.

Avoid: Treat a checked draft as authorization or drop policy-required choices through a quick action.

Why: The input gathers values; it cannot grant permission or certify that persistence succeeded.

## Import and exports

- src/components/v4/ui/multi-select.tsx
- src/components/v4/ui/picker.module.css
- src/components/v4/lib/use-option-creation.ts

Exports: MultiSelect. Source TypeScript defines the API.

## Behavior

- Multiple and single selection; controlled or local value and open state. Multiple callbacks follow the options order; duplicate option values are rejected at the public boundary.
- Default triggers are ordinary fields: the visible purpose comes from a Field label, size defaults to sm32 and explicit md is 36px. label names the trigger for assistive technology and is not drawn inside it. Multiple summaries show the first label and a remaining count, or a caller-supplied allLabel when every enabled option is selected.
- Grouping, and a search row that appears only when searchable is set (it is off by default). Selection happens on the options: uncheck an option to deselect it, there is no Clear action. Ctrl or Cmd+A toggles every enabled option and preserves disabled selections. Choosing the current option in single mode keeps it and closes the list.
- In multiple mode the open list starts with a bar: the visible count ("2 of 5 selected") and Select all and Deselect all. Select all is disabled when every enabled option is on, Deselect all when no enabled option is on; both skip disabled options, which keep whatever they had, and return focus to the list. quickActions={false} hides the bar.
- Each option is one 32px row with the description muted and right-aligned beside the label. Multiple mode leads every row with an 18px checkbox mark (checked, unchecked, and dimmed when disabled); single mode ends the chosen row with a check.
- ArrowDown or ArrowUp on the focused closed trigger opens the list, like Enter and Space.
- Creation receives a host AbortSignal; changing the query, closing or unmounting aborts and invalidates the prior request.
- A host DOMException named AbortError is cancellation. It preserves the query without failure feedback; other failures remain retryable.

## Accessibility

- The option list announces which options are selected, arrow keys move through it, and pressing Enter while composing text with an input method never selects an option.
- Selection count is announced politely from the bar (or a hidden status when quickActions is off); Mod+A toggles enabled options while preserving disabled selections. The checkbox marks are decorative; aria-selected carries the state.

## Use cases

- Put the trigger in a Field and use sm or md. Multiple mode returns option ids; single mode returns one id or null.

## Limits

- Use application state for persisted permissions; selection is not an authorization decision.
- Creation persistence belongs to the host. Aborting suppresses obsolete UI results and asks the host to cancel; it cannot undo an already committed server write.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### size

- sm: example `sizes`, visible label "sm".
- md: example `sizes`, visible label "md".

### mode

- multiple: example `default`, visible label "Project roles".
- single: example `default`, visible label "One permission".

### side


- top: omitted. Side places the open panel against the trigger, so it only shows while open. bottom is the default and the panel flips when it does not fit.
- right: omitted. Set side on MultiSelect; the closed trigger looks the same.
- bottom: omitted. The default side, shown by every open panel.
- left: omitted. Set side on MultiSelect; the closed trigger looks the same.

### align


- start: omitted. The default alignment, shown by every open panel.
- center: omitted. Set align on MultiSelect; the closed trigger looks the same.
- end: omitted. Set align on MultiSelect; the closed trigger looks the same.

### search

- hidden: example `default`, visible label "One permission".
- searchable: omitted. Set searchable only for long option lists; the closed trigger looks the same.

### state

- disabled selected: example `default`, visible label "Admin is required by policy.".
- invalid: omitted. Invalid and disabled use the shared field surface, which the Input and Field examples show once.
- disabled: omitted. Invalid and disabled use the shared field surface, which the Input and Field examples show once.
- empty options: omitted. An empty list shows the same No options found row the search shows; selection-disclosure tests cover it.
- pending creation: omitted. Creation needs a search field and is shown on Combobox, which uses the same creation hook.
- failed creation and retry: omitted. Creation rejection and cancellation semantics are verified through the component contract; no failure-injection controls appear in Human specimens.
- AbortError cancellation: omitted. Creation rejection and cancellation semantics are verified through the component contract; no failure-injection controls appear in Human specimens.
- controlled open: omitted. Controlled open state is covered in menu-recipes tests; the example shows the default closed trigger.

### composition

- option ordering: example `default`, visible label "Selected roles:".
- custom trigger: omitted. The trigger prop is covered by selection-disclosure tests; the examples keep to the standard field.
- custom summary: omitted. renderValue is covered by selection-disclosure tests; the examples keep to the standard field.

## Executable examples

### Permission draft

Save this example at `src/pages/design-system/examples/multi-select/default.tsx`; its relative imports are generated for that exact path. States: controlled, keyboard.

Registry items used: @infisical/field, @infisical/multi-select. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Field } from "../../../../components/v4/ui/field";
import { MultiSelect, type MultiSelectOption } from "../../../../components/v4/ui/multi-select";
const options: MultiSelectOption[] = [
    { value: "read", label: "Read", description: "Fetch existing values", group: "Secrets" },
    { value: "write", label: "Write", description: "Create and edit", group: "Secrets" },
    { value: "delete", label: "Delete", group: "Secrets" },
    { value: "admin", label: "Admin", group: "Project", disabled: true },
    {
        value: "billing",
        label: "Billing",
        description: "Owner only",
        group: "Project",
        disabled: true
    }
];
export default function Example() {
    const [roles, setRoles] = useState(["read", "admin"]);
    const [single, setSingle] = useState<string | null>("read");
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      <Field label="Project roles" description="Admin is required by policy. Billing is owner only.">
        <MultiSelect label="Project roles" allLabel="All project permissions" options={options} value={roles} onChange={setRoles}/>
      </Field>
      <Field label="One permission">
        <MultiSelect label="One permission" multiple={false} value={single} onChange={setSingle} options={options}/>
      </Field>
      <p role="status" className="sr-only">
        Selected roles:{" "}
        {roles
            .map((role) => options.find((option) => option.value === role)?.label ?? role)
            .join(", ") || "none"}
        . Single permission: {single ?? "none"}.
      </p>
    </div>);
}
```

### Sizes

Save this example at `src/pages/design-system/examples/multi-select/sizes.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/multi-select. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { MultiSelect } from "../../../../components/v4/ui/multi-select";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      {(["sm", "md"] as const).map((size) => (<figure key={size} className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
          <MultiSelect size={size} label="Role" options={[
                { value: "read", label: "Read" },
                { value: "write", label: "Write" }
            ]} defaultValue={["read"]}/>
        </div><figcaption className="text-muted-foreground text-xs">{size}</figcaption></figure>))}
    </div>);
}
```

### Quick actions

Save this example at `src/pages/design-system/examples/multi-select/environments.tsx`; its relative imports are generated for that exact path. States: empty, controlled.

Registry items used: @infisical/field, @infisical/multi-select. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Field } from "../../../../components/v4/ui/field";
import { MultiSelect, type MultiSelectOption } from "../../../../components/v4/ui/multi-select";
const options: MultiSelectOption[] = [
    { value: "dev", label: "Development", description: "138 secrets" },
    { value: "staging", label: "Staging", description: "96 secrets" },
    { value: "prod", label: "Production", description: "212 secrets" },
    { value: "pr-482", label: "pr-482", description: "Expires Oct 1", group: "Preview" },
    { value: "pr-490", label: "pr-490", description: "Expired", group: "Preview", disabled: true }
];
export default function Example() {
    const [none, setNone] = useState<string[]>([]);
    const [all, setAll] = useState(["dev", "staging", "prod", "pr-482"]);
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Field label="Environments">
          <MultiSelect label="Environments" placeholder="Choose environments" options={options} value={none} onChange={setNone}/>
        </Field>
      </div><figcaption className="text-muted-foreground text-xs">{"None selected, Deselect all disabled"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Field label="Environments">
          <MultiSelect label="Environments" allLabel="All environments" options={options} value={all} onChange={setAll}/>
        </Field>
      </div><figcaption className="text-muted-foreground text-xs">{"All selected, Select all disabled"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- runtime: npm test -- src/components/v4/ui/foundation-controls.test.tsx src/components/v4/ui/selection-disclosure.test.tsx
- browser: npm run ui:dev; open /design-system#multi-select and exercise the documented interaction.
