# Textarea

Enter multiline prose with native text editing.

## Choose this component

Choose Textarea for multiline plain text. Use Input for a single line, Code for read-only syntax and SensitiveEditor for protected stored values.

## Usage rules

### textarea-usage

Owner: textarea.

When the value contains deliberate line breaks or leading spaces.

Do: Preserve the literal draft and allow native selection, newline entry and copying.

Avoid: Trim, reformat or suppress Enter without an explicit task requirement.

Why: Whitespace can be part of the value and ordinary multiline editing depends on native behavior.

Checked by: review only. Look for: Enter and copy text with leading spaces and line breaks; the exact draft survives editing, invalid submission and readonly inspection.

Source evidence:
- src/components/v4/ui/textarea.tsx
- src/pages/design-system/examples/textarea/default.tsx

## State guidance

- invalid: Keep the exact entered text and explain the rejected constraint.
- read-only: Allow selection and copy when editing is unavailable but reading is permitted.

## Presentation rules

Do: Choose a starting height that reveals enough of the expected content.

Avoid: Use a one-line-high textarea for long policy text or an enormous box for a short note.

Why: The visible measure should support reviewing the actual value.

Do: Keep multiline and unbroken synthetic values exact in both the editor and its local result.

Avoid: Trim line breaks to fit the preview or invent density names from rows and cols.

Why: Rows and cols are native hints; a note can contain significant spacing and line breaks.

## Import and exports

- src/components/v4/ui/textarea.tsx

Exports: Textarea. Source TypeScript defines the API.

## Behavior

- Textarea forwards native value/defaultValue, onChange events and the textarea ref. Field association and invalid state reach the leaf; content sizing keeps a minimum editing area.

## Accessibility

- Use Field or an explicit label/id, and connect errors with aria-describedby. Keep readOnly values selectable and distinguish disabled inputs from editable ones.

## Use cases

- Use native rows and host validation, retain line breaks and exact draft text and allow enough vertical growth or scrolling to review the entry.

## Avoid

- Add syntax meaning through colored text alone, silently trim a payload or fix height so errors and actions hide the last lines.

## Limits

- Textarea edits plain text; syntax highlighting, rich editing and serialization are separate components or host concerns.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### state

- default: example `default`, visible label "Connection description".
- invalid: example `default`, visible label "Change reason".
- disabled: example `default`, visible label "Managed description".
- read-only: example `editing`, visible label "Saved notes".
- empty: example `editing`, visible label "Empty notes".
- controlled: example `editing`, visible label "Draft notes".

### composition

- native rows and cols: example `editing`, visible label "Draft notes".

## Executable examples

### States

Save this example at `src/pages/design-system/examples/textarea/default.tsx`; its relative imports are generated for that exact path. States: default, invalid, disabled.

Registry items used: @infisical/label, @infisical/textarea. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Label } from "../../../../components/v4/ui/label";
import * as UI from "../../../../components/v4/ui/textarea";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      <div className="space-y-2">
        <Label htmlFor="description">Connection description</Label>
        <UI.Textarea id="description" defaultValue="Synchronizes the staging environment."/>
      </div>
      <div className="space-y-2">
        <Label htmlFor="invalid-description">Change reason</Label>
        <UI.Textarea id="invalid-description" aria-invalid aria-describedby="reason-error"/>
        <p id="reason-error">Explain why access is needed.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="managed-description">Managed description</Label>
        <UI.Textarea id="managed-description" value="Required by policy" disabled/>
      </div>
    </div>);
}
```

### Controlled notes

Save this example at `src/pages/design-system/examples/textarea/editing.tsx`; its relative imports are generated for that exact path. States: controlled, read-only, empty.

Registry items used: @infisical/label, @infisical/textarea. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Label } from "../../../../components/v4/ui/label";
import { Textarea } from "../../../../components/v4/ui/textarea";
export default function Example() {
    const [value, setValue] = useState("Staging deployment notes.\nPreserve line breaks and exact values.");
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Label htmlFor="textarea-draft">Draft notes</Label>
        <Textarea id="textarea-draft" rows={5} cols={24} value={value} onChange={(event) => setValue(event.target.value)}/>
        <p role="status" className="sr-only text-sm break-all whitespace-pre-wrap" data-textarea-value>
          {value}
        </p>
      </div><figcaption className="text-muted-foreground text-xs">{"Controlled"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Label htmlFor="textarea-readonly">Saved notes</Label>
        <Textarea id="textarea-readonly" readOnly value={"Managed by platform policy.\nRetain this exact line break."}/>
      </div><figcaption className="text-muted-foreground text-xs">{"Read-only"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Label htmlFor="textarea-empty">Empty notes</Label>
        <Textarea id="textarea-empty" placeholder="Describe this connection"/>
      </div><figcaption className="text-muted-foreground text-xs">{"Empty"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#textarea and verify the documented interaction.
