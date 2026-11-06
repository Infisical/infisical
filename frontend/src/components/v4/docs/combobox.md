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

### combobox-dialog-creation

Owner: combobox.

When people may need to create the entity they are picking first, such as an app connection or a gateway.

Do: Pass creation with mode dialog and a renderForm that reports dirty and pending and calls complete with the created option, and set disabledReason when the person may not create one.

Avoid: Send people to another page to create the entity, hide the Create row without the permission, or close the Dialog from the form without the discard guard.

Why: Creating in place keeps the flow and its draft, and routing every close through one guard means a dirty form is never lost by accident.

Checked by: src/components/v4/ui/combobox.test.tsx. Opens the dialog row, edits the form and cancels: the discard prompt opens and Keep Editing keeps the Dialog. Submitting calls complete, which selects the new option on the trigger and closes the Dialog.

Source evidence:
- src/components/v4/ui/combobox.tsx
- src/pages/design-system/examples/app-connection-form/default.tsx

### combobox-searchable-value

Owner: combobox.

When a field searches an in-memory set or offers host-backed creation.

Do: Use stable option values, keep the visible field purpose separate from the query and pass onCreate only for a real cancellable host operation.

Avoid: Treat an empty search as an empty collection, create duplicate values, imply in-memory search is remote or filter again on top of onSearch results.

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

Exports: Combobox, ComboboxCreation, ComboboxCreationFormProps, ComboboxOption, ComboboxProps. Source TypeScript defines the API.

## Behavior

- Single selection uses Radix Popover and cmdk; multiple selection composes the shared ARIA listbox with removable chips and empty-query Backspace. Chips sit on a tint; a chip that cannot be removed (locked, for example required by policy) drops the tint and its text goes muted so the whole chip reads as disabled, and its remove button stays visible but disabled.
- ArrowDown or ArrowUp on the focused closed trigger opens the list with focus in the search field and the active option highlighted, like Enter and Space.
- Multiple mode anchors its list to the whole field, chips included, and re-anchors on every open, so the list sits under the field inside a Dialog or Sheet too.
- Multiple mode lists options with checkbox marks and no Select all bar. Removing a chip with Enter, Space, Backspace or Delete on its remove button moves focus to the next removable chip, else the previous one, else the trigger; focus never falls to the page.
- Controlled or local value; case-insensitive label and metadata filtering; optional awaited creation.
- onSearch(query) turns on async search for single selection: the Combobox stops filtering and renders options as the host passes them, calls onSearch on every query change and with an empty string when it closes with a query, and keeps the label of the chosen option on the trigger after the results move on. Debouncing and request cancellation stay with the host. loading shows the pixel Spinner in the search row and disables the creation row until results settle. With no results, a status line reads Searching… while loading and emptyText after, above the creation row when there is one. The creation row works the same in async mode.
- defaultOpen opens the list on mount, for a picker that is the first step of a flow. Focus moving outside the list closes it unless closeOnFocusOutside is false, which is the default when defaultOpen is set, so a Dialog or Sheet taking focus on mount does not close a list that opened with it; outside pointer presses and Escape still close it. Multiple mode with clearable adds a Clear all button after the chips; it removes every removable chip, keeps locked ones and returns focus to the trigger.
- Creation receives a host AbortSignal; changing the query, closing or unmounting aborts and invalidates the prior request.
- A host DOMException named AbortError is cancellation. It preserves the query without failure feedback; other failures remain retryable.
- creation picks how the Create row works for single selection. mode inline takes onCreate and behaves exactly like the onCreate prop, which stays as its shorthand. mode dialog always ends the list with a plus row named by label, after a separator when options are listed, so an empty list still offers it. Choosing it closes the list and opens a Dialog titled title with description, the form from renderForm and a footer with Cancel and submitLabel (default Create), which submits the form whose id is formId.
- renderForm receives query (the trimmed search text), formId, complete, dismiss, onDirtyChange and onPendingChange, and remounts on every open. complete(option) selects the option (its label shows on the trigger even before the host adds it to options), closes the Dialog and returns focus to the trigger; a complete that arrives after the Dialog was dismissed is ignored. onPendingChange(true) makes the Dialog pending, which blocks Escape, outside clicks and the corner close, disables Cancel and shows the submit Button loading.
- Escape, an outside click, the corner close, Cancel and dismiss all go through useDiscardChangesGuard: with the form dirty (onDirtyChange(true)) they open DiscardChangesAlertDialog with discardTitle and discardDescription, and only Discard closes; a clean form closes at once. A submit inside the Dialog never reaches a form around the Combobox.
- disabledReason on either mode keeps the Create row visible but disabled, with the reason beside its label (disable, do not hide). Gate it on the create permission.

## Accessibility

- Caller supplies a visible or programmatic label.
- Disabled options cannot be selected.

## Use cases

- Use a searchable local value set when labels need filtering. Add creation only when a host callback can create the actual option.

## Limits

- Without onSearch, filtering is in memory. Async search does not virtualize results; keep the host's result page short.
- onSearch and loading are single-selection props. Multiple mode filters its options in memory and orders the value by them, so it needs every selectable option up front.
- Creation persistence belongs to the host. Aborting suppresses obsolete UI results and asks the host to cancel; it cannot undo an already committed server write.
- Dialog creation is single selection only, in a fixed-width Dialog. A multi-step creation belongs in a Sheet the host opens from a mode inline onCreate.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### mode

- single: example `default`, visible label "Single environment".
- multiple: example `multiple`, visible label "Visible environments".

### state

- dialog creation: example `dialog-creation`, visible label "AWS connection".
- creation disabled with reason: example `dialog-creation`, visible label "Without permission to create connections".
- disabled selected: example `multiple`, visible label "Audit".
- creation unavailable: example `default`, visible label "Single environment".
- pending creation: example `creation`, visible label "Search and create".
- abort on close/query: example `creation`, visible label "Environment".
- empty search: example `async`, visible label "Searches the server as you type".
- empty options: omitted. Empty, invalid and disabled use the shared field surface, which the Input and Field examples show once.
- invalid: omitted. Empty, invalid and disabled use the shared field surface, which the Input and Field examples show once.
- disabled: omitted. Empty, invalid and disabled use the shared field surface, which the Input and Field examples show once.
- failed creation and retry: omitted. Creation rejection and cancellation semantics are verified through the component contract; no failure-injection controls appear in Human specimens.
- AbortError cancellation: omitted. Creation rejection and cancellation semantics are verified through the component contract; no failure-injection controls appear in Human specimens.

### search

- in memory: example `default`, visible label "Single environment".
- async: example `async`, visible label "Searches the server as you type".
- async loading: example `async`, visible label "Searches the server as you type".

### composition

- mono identifier: example `async`, visible label "Searches the server as you type".
- custom empty text: example `async`, visible label "Searches the server as you type".

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
  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-6">
      <Field
        label="Single environment"
        description="Choose an existing environment. Creation is unavailable."
      >
        <Combobox
          label="Single environment"
          options={[
            { value: "dev", label: "Dev", meta: "3 projects" },
            { value: "prod", label: "Prod", meta: "12 projects" },
            { value: "archived", label: "Archived", disabled: true }
          ]}
          value={value}
          onChange={setValue}
          placeholder="Choose"
        />
      </Field>
      <p role="status" className="sr-only text-sm">
        Selected environment: {value || "none"}
      </p>
    </div>
  );
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
  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-6">
      <Field
        label="Visible environments"
        description="Audit is required by policy, so Clear all keeps it. Creation is unavailable."
      >
        <Combobox
          label="Visible environments"
          multiple
          clearable
          options={[
            { value: "dev", label: "Dev", meta: "3 projects" },
            { value: "staging", label: "Staging", meta: "2 projects" },
            { value: "prod", label: "Prod", meta: "12 projects" },
            { value: "audit", label: "Audit", disabled: true }
          ]}
          value={values}
          onChange={setValues}
          placeholder="Choose"
        />
      </Field>
      <p role="status" className="sr-only text-sm">
        Selected environments: {values.join(", ") || "none"}
      </p>
    </div>
  );
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
  return (
    <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
      <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
        <Field label="Environment">
          <Combobox
            label="Environment"
            options={options}
            value={value}
            onChange={setValue}
            onCreate={async (query, { signal }) => {
              await new Promise((resolve) => {
                setTimeout(resolve, 300);
              });
              if (signal.aborted) return;
              setOptions((previous) => [...previous, { value: query, label: query }]);
              setValue(query);
            }}
          />
        </Field>
      </div>
      <figcaption className="text-muted-foreground text-xs">{"Search and create"}</figcaption>
    </figure>
  );
}
```

### Async search

Save this example at `src/pages/design-system/examples/combobox/async.tsx`; its relative imports are generated for that exact path. States: controlled, loading, empty.

Registry items used: @infisical/combobox, @infisical/field. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useEffect, useRef, useState } from "react";

import { Combobox, type ComboboxOption } from "../../../../components/v4/ui/combobox";
import { Field } from "../../../../components/v4/ui/field";

const catalog: ComboboxOption[] = [
  { value: "payments-api", label: "payments-api", meta: "Production" },
  { value: "payments-worker", label: "payments-worker", meta: "Production" },
  { value: "checkout-web", label: "checkout-web", meta: "Staging" },
  { value: "billing-cron", label: "billing-cron", meta: "Production" },
  { value: "ledger-service", label: "ledger-service", meta: "Development" },
  { value: "search-indexer", label: "search-indexer", meta: "Staging" },
  { value: "notifications", label: "notifications", meta: "Production" }
];
const match = (projects: readonly ComboboxOption[], query: string) =>
  projects
    .filter((project) => project.label.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 5);

export default function Example() {
  const projects = useRef(catalog);
  const timer = useRef<number | undefined>(undefined);
  const [options, setOptions] = useState(() => match(catalog, ""));
  const [loading, setLoading] = useState(false);
  const [value, setValue] = useState("");
  useEffect(() => () => window.clearTimeout(timer.current), []);
  const search = (query: string) => {
    window.clearTimeout(timer.current);
    setLoading(true);
    timer.current = window.setTimeout(() => {
      setOptions(match(projects.current, query));
      setLoading(false);
    }, 900);
  };
  return (
    <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
      <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
        <Field
          label="Project"
          description="Results come from the host; the Combobox does not filter them."
        >
          <Combobox
            label="Project"
            placeholder="Choose a project"
            options={options}
            value={value}
            onChange={setValue}
            onSearch={search}
            loading={loading}
            emptyText="No projects match"
            mono
            onCreate={async (query, { signal }) => {
              await new Promise((resolve) => {
                setTimeout(resolve, 300);
              });
              if (signal.aborted) return;
              const created = { value: query, label: query, meta: "New" };
              projects.current = [...projects.current, created];
              setOptions(match(projects.current, query));
              setValue(query);
            }}
          />
        </Field>
      </div>
      <figcaption className="text-muted-foreground text-xs">
        {"Searches the server as you type"}
      </figcaption>
    </figure>
  );
}
```

### Create in a dialog

Save this example at `src/pages/design-system/examples/app-connection-form/default.tsx`; its relative imports are generated for that exact path. States: controlled, loading, disabled.

Registry items used: @infisical/app-connection-form, @infisical/combobox, @infisical/field. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { connectionCreation } from "../../../../components/v4/patterns/app-connection-form";
import { Combobox, type ComboboxOption } from "../../../../components/v4/ui/combobox";
import { Field } from "../../../../components/v4/ui/field";
import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { CONNECTION_PRESETS } from "@app/pages/v4/data/integrations/connection-presets";

const seeded: ComboboxOption[] = [
  { value: "aws-production", label: "aws-production", meta: "Assume Role" },
  {
    value: "aws-payments-legacy-access-key",
    label: "aws-payments-legacy-access-key",
    meta: "Access Key"
  }
];

export default function Example() {
  const [options, setOptions] = useState(seeded);
  const [value, setValue] = useState("aws-production");
  const creation = connectionCreation({
    preset: CONNECTION_PRESETS[AppConnection.AWS],
    create: async (values) => {
      await new Promise((resolve) => {
        setTimeout(resolve, 900);
      });
      const connection = { id: `demo-${values.name}`, name: values.name };
      setOptions((current) => [...current, { value: connection.id, label: connection.name }]);
      return connection;
    }
  });
  const selected = options.find((option) => option.value === value)?.label ?? "none";
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
          <Field label="AWS connection">
            <Combobox
              label="AWS connection"
              options={options}
              value={value}
              onChange={setValue}
              placeholder="Select connection"
              creation={creation}
            />
          </Field>
        </div>
        <figcaption className="text-muted-foreground text-xs">{`Selected: ${selected}. Demo data, nothing is sent.`}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
          <Field label="AWS connection">
            <Combobox
              label="AWS connection"
              options={seeded}
              defaultValue="aws-production"
              creation={connectionCreation({
                preset: CONNECTION_PRESETS[AppConnection.AWS],
                disabledReason: "No permission to create.",
                create: async () => {
                  throw new Error("Creation is not allowed.");
                }
              })}
            />
          </Field>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Without permission to create connections"}
        </figcaption>
      </figure>
    </div>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- runtime: npm test -- src/components/v4/ui/foundation-controls.test.tsx
- browser: npm run dev; open /design-system#combobox and exercise the documented interaction.
