# Combobox

Search and choose one option from a provided list.

## Choose this component

Choose Combobox when a known option list needs search. Use Select for a short grouped choice and CommandMenu for executing actions.

## Usage rules

### combobox-usage

Owner: combobox.

When several options share similar display labels.

Do: Give each option a stable unique value and useful searchable text; keep the selected label visible when filtering.

Avoid: Use array indexes as identity or commit the first result just because the query changed.

Why: Filtering narrows candidates without choosing a value.

Checked by: review only. Look for: Filter similar options, highlight one and cancel. Query/highlight do not change the committed value until selection, and distinct stable option ids survive reordered results.

Source evidence:
- src/components/v4/ui/combobox.tsx
- src/pages/design-system/examples/combobox/default.tsx

### combobox-searchable-value

Owner: combobox.

When a field searches an in-memory set or offers host-backed creation.

Do: Use stable option values, keep the visible field purpose separate from the query and pass onCreate only for a real cancellable host operation.

Avoid: Treat an empty search as an empty collection, create duplicate values or imply search is remote or virtualized.

Why: Query state, selected identity and persisted creation describe different things and must not be conflated.

Checked by: review only. Look for: Search without matches, reject creation and retry, then close during a pending request. Selected identity stays correct and obsolete results do not select themselves.

Source evidence:
- src/components/v4/ui/combobox.tsx
- src/pages/design-system/examples/combobox/default.tsx

## State guidance

- empty: Keep the query and state that no options match.
- disabled: Show why a known option cannot be chosen without removing the current selection's meaning.

## Presentation rules

Do: Make option labels distinguish the resources people search for.

Avoid: Populate results with repeated icons and identical names that differ only in hidden values.

Why: Search cannot resolve choices whose visible information is indistinguishable.

Do: Retain the query after failed creation and let the host commit only after the awaited local operation succeeds.

Avoid: Claim that an option was created on click or turn AbortError cancellation into failure feedback.

Why: Pending, rejection and cancellation have different outcomes and recovery paths.

## Import and exports

- src/components/v4/ui/combobox.tsx
- src/components/v4/ui/picker.module.css
- src/components/v4/lib/use-option-creation.ts

Exports: Combobox, ComboboxOption, ComboboxProps. Source TypeScript defines the API.

## Behavior

- Single selection uses Radix Popover and cmdk; multiple selection composes the shared ARIA listbox with removable chips and empty-query Backspace.
- ArrowDown or ArrowUp on the focused closed trigger opens the list with focus in the search field and the active option highlighted, like Enter and Space.
- Multiple mode lists options with checkbox marks and no Select all bar. Removing a chip with Enter, Space, Backspace or Delete on its remove button moves focus to the next removable chip, else the previous one, else the trigger; focus never falls to the page.
- Controlled or local value; case-insensitive label and metadata filtering; optional awaited creation.
- Creation receives a host AbortSignal; changing the query, closing or unmounting aborts and invalidates the prior request.
- A host DOMException named AbortError is cancellation. It preserves the query without failure feedback; other failures remain retryable.

## Accessibility

- Caller supplies a visible or programmatic label.
- Disabled options cannot be selected.

## Use cases

- Use a searchable local value set when labels need filtering. Add creation only when a host callback can create the actual option.

## Limits

- Do not treat this in-memory picker as a remote-search or virtualized-results implementation.
- Creation persistence belongs to the host. Aborting suppresses obsolete UI results and asks the host to cancel; it cannot undo an already committed server write.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### mode

- single: example `default`, visible label "Single environment".
- multiple: example `multiple`, visible label "Visible environments".

### state

- disabled selected: example `multiple`, visible label "Audit".
- creation unavailable: example `default`, visible label "Single environment".
- pending creation: example `creation`, visible label "Search and create".
- abort on close/query: example `creation`, visible label "Environment".
- empty options: omitted. Empty, invalid and disabled use the shared field surface, which the Input and Field examples show once.
- empty search: omitted. Empty, invalid and disabled use the shared field surface, which the Input and Field examples show once.
- invalid: omitted. Empty, invalid and disabled use the shared field surface, which the Input and Field examples show once.
- disabled: omitted. Empty, invalid and disabled use the shared field surface, which the Input and Field examples show once.
- failed creation and retry: omitted. Creation rejection and cancellation semantics are verified through the component contract; no failure-injection controls appear in Human specimens.
- AbortError cancellation: omitted. Creation rejection and cancellation semantics are verified through the component contract; no failure-injection controls appear in Human specimens.

### composition


- mono identifier: omitted. The mono prop only changes the typeface of the option labels; no example sets it.
- custom empty text: omitted. The emptyText prop only changes the no-match sentence; no example sets it.

## Executable examples

### Single selection

Save this example at `src/pages/design-system/examples/combobox/default.tsx`; its relative imports are generated for that exact path. States: controlled, keyboard.

Registry items used: @infisical/combobox, @infisical/field. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Combobox } from "../../../../components/v4/ui/combobox";
import { Field } from "../../../../components/v4/ui/field";
export default function Example() {
    const [value, setValue] = useState("dev");
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <Field label="Single environment" description="Choose an existing environment. Creation is unavailable.">
        <Combobox label="Single environment" options={[
            { value: "dev", label: "Dev", meta: "3 projects" },
            { value: "prod", label: "Prod", meta: "12 projects" },
            { value: "archived", label: "Archived", disabled: true }
        ]} value={value} onChange={setValue} placeholder="Choose"/>
      </Field>
      <p role="status" className="sr-only text-sm">
        Selected environment: {value || "none"}
      </p>
    </div>);
}
```

### Multiple environment draft

Save this example at `src/pages/design-system/examples/combobox/multiple.tsx`; its relative imports are generated for that exact path. States: controlled, disabled, keyboard.

Registry items used: @infisical/combobox, @infisical/field. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Combobox } from "../../../../components/v4/ui/combobox";
import { Field } from "../../../../components/v4/ui/field";
export default function Example() {
    const [values, setValues] = useState(["dev", "staging", "audit", "prod"]);
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <Field label="Visible environments" description="Audit is required by policy. Creation is unavailable.">
        <Combobox label="Visible environments" multiple options={[
            { value: "dev", label: "Dev", meta: "3 projects" },
            { value: "staging", label: "Staging", meta: "2 projects" },
            { value: "prod", label: "Prod", meta: "12 projects" },
            { value: "audit", label: "Audit", disabled: true }
        ]} value={values} onChange={setValues} placeholder="Choose"/>
      </Field>
      <p role="status" className="sr-only text-sm">
        Selected environments: {values.join(", ") || "none"}
      </p>
    </div>);
}
```

### Creation

Save this example at `src/pages/design-system/examples/combobox/creation.tsx`; its relative imports are generated for that exact path. States: controlled.

Registry items used: @infisical/combobox, @infisical/field. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Combobox, type ComboboxOption } from "../../../../components/v4/ui/combobox";
import { Field } from "../../../../components/v4/ui/field";
export default function Example() {
    const [options, setOptions] = useState<ComboboxOption[]>([
        { value: "dev", label: "Dev" },
        { value: "prod", label: "Prod" },
        { value: "archived", label: "Archived", disabled: true }
    ]);
    const [value, setValue] = useState("dev");
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
      <Field label="Environment">
        <Combobox label="Environment" options={options} value={value} onChange={setValue} onCreate={async (query, { signal }) => {
            await new Promise((resolve) => {
                setTimeout(resolve, 300);
            });
            if (signal.aborted)
                return;
            setOptions((previous) => [...previous, { value: query, label: query }]);
            setValue(query);
        }}/>
      </Field>
    </div><figcaption className="text-muted-foreground text-xs">{"Search and create"}</figcaption></figure>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- runtime: npm test -- src/components/v4/ui/foundation-controls.test.tsx
- browser: npm run ui:dev; open /design-system#combobox and exercise the documented interaction.
