# Dialog

Edit or inspect a task in a modal with a title and description.

## Choose this component

Choose Dialog for a focused editable task. Use AlertDialog for irreversible confirmation and Sheet for supporting details kept beside the page.

## Usage rules

### dialog-adverse-content

Owner: dialog.

When a focused task includes a long history or a rejected form submission.

Do: Keep long content inside the viewport and retain the entered draft beside its error.

Avoid: Use a short happy-path fixture as the only sizing check or celebrate an unfulfilled save.

Why: A modal must preserve the repair path even when content and text enlarge.

Checked by: review only. Look for: Open the long history at 320px and 200% text, then reject a changed name and retry without losing the draft.

Source evidence:
- src/components/v4/ui/dialog.tsx

### dialog-usage

Owner: dialog.

When saving a modal form can fail.

Do: Keep the dialog open while saving, retain the draft on rejection, and place the error beside the form.

Avoid: Close on submit and show success before awaiting the result.

Why: Closing loses the repair context and can falsely claim persistence.

Checked by: review only. Look for: Submit a failing save, correct it and retry. The draft survives failure, the dialog closes only on confirmed completion and focus returns to a logical target.

Source evidence:
- src/components/v4/ui/dialog.tsx
- src/pages/design-system/examples/dialog/default.tsx

## State guidance

- opening: Give the dialog a specific title and an initial focus target.
- dirty: Make the host's dismissal policy explicit before a draft is discarded.

## Presentation rules

Do: Keep one focused task and its necessary context in the dialog.

Avoid: Recreate a full settings page with nested navigation inside a small modal.

Why: A crowded modal makes orientation and recovery harder than a page would.

## Import and exports

- src/components/v4/ui/dialog.tsx

Exports: Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger. Source TypeScript defines the API.

## Behavior

- open/onOpenChange or defaultOpen controls the Radix dialog. Trigger and Close compose native controls; scoped Content portals into V4Scope and scrolls within the viewport.

## Accessibility

- Title and Description name the dialog. Focus stays inside it and returns to the trigger. Escape inside an open editor closes that editor before the dialog.

## Use cases

- Keep a named DialogTitle and useful description, let the task owner manage pending/error/open state and keep the failed draft inside the dialog.

## Avoid

- Wrap an async submit in an unconditional close control or remove the only close path without a deliberate pending policy.

## Limits

- Dialog does not submit forms, await requests or choose success/error copy; the task owner controls those states and closure.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### Content close control

- true: example `variants`, visible label "Corner close".
- false: example `variants`, visible label "Footer close".

### Footer close control

- false: example `variants`, visible label "Corner close".
- true: example `variants`, visible label "Footer close".

## Executable examples

### Editable form

Save this example at `src/pages/design-system/examples/dialog/default.tsx`; its relative imports are generated for that exact path. States: default, controlled, keyboard.

Registry items used: @infisical/button, @infisical/dialog, @infisical/field, @infisical/input. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Button } from "../../../../components/v4/ui/button";
import * as UI from "../../../../components/v4/ui/dialog";
import { Field } from "../../../../components/v4/ui/field";
import { Input } from "../../../../components/v4/ui/input";
export default function Example() {
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("staging");
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
      <UI.Dialog open={open} onOpenChange={setOpen}>
        <UI.DialogTrigger asChild>
          <Button variant="outline">Edit environment</Button>
        </UI.DialogTrigger>
        <UI.DialogContent>
          <UI.DialogHeader>
            <UI.DialogTitle>Edit environment</UI.DialogTitle>
            <UI.DialogDescription>Choose the name used in navigation.</UI.DialogDescription>
          </UI.DialogHeader>
          <form className="flex flex-col gap-4" onSubmit={(event) => {
            event.preventDefault();
            setOpen(false);
        }}>
            <Field label="Environment name">
              <Input required value={name} onChange={(event) => setName(event.target.value)}/>
            </Field>
            <UI.DialogFooter>
              <UI.DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </UI.DialogClose>
              <Button type="submit">Save changes</Button>
            </UI.DialogFooter>
          </form>
        </UI.DialogContent>
      </UI.Dialog>
    </div><figcaption className="text-muted-foreground text-xs">{"Editable form"}</figcaption></figure>);
}
```

### Close controls

Save this example at `src/pages/design-system/examples/dialog/variants.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/dialog. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import * as UI from "../../../../components/v4/ui/dialog";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      {[true, false].map((showCloseButton) => (<UI.Dialog key={String(showCloseButton)}>
          <UI.DialogTrigger asChild>
            <Button variant="outline">{showCloseButton ? "Corner close" : "Footer close"}</Button>
          </UI.DialogTrigger>
          <UI.DialogContent showCloseButton={showCloseButton}>
            <UI.DialogHeader>
              <UI.DialogTitle>Environment details</UI.DialogTitle>
              <UI.DialogDescription>Read-only details for Staging.</UI.DialogDescription>
            </UI.DialogHeader>
            <p>Region: eu-west-1. Access: Platform team.</p>
            <UI.DialogFooter showCloseButton={!showCloseButton}>
              {showCloseButton && (<UI.DialogClose asChild>
                  <Button variant="outline">Done reviewing</Button>
                </UI.DialogClose>)}
            </UI.DialogFooter>
          </UI.DialogContent>
        </UI.Dialog>))}
    </div>);
}
```

### Constrained history

Save this example at `src/pages/design-system/examples/dialog/content.tsx`; its relative imports are generated for that exact path. States: overflow.

Registry items used: @infisical/button, @infisical/dialog. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import * as UI from "../../../../components/v4/ui/dialog";

export default function Example() {
  return (
    <UI.Dialog>
      <UI.DialogTrigger asChild>
        <Button variant="outline">Review history</Button>
      </UI.DialogTrigger>
      <UI.DialogContent>
        <UI.DialogHeader>
          <UI.DialogTitle>Environment history</UI.DialogTitle>
          <UI.DialogDescription>24 fictional changes, newest first.</UI.DialogDescription>
        </UI.DialogHeader>
        <ol>
          {Array.from({ length: 24 }, (_, index) => (
            <li key={index}>Version {24 - index}: deployment configuration updated.</li>
          ))}
        </ol>
        <UI.DialogFooter showCloseButton />
      </UI.DialogContent>
    </UI.Dialog>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#dialog and verify the documented interaction.
