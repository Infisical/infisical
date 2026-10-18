# Sheet

Inspect or edit a task in a side panel.

## Choose this component

Choose Sheet for a supporting task or object detail alongside the current page. Use Dialog for a small centered task and a page for long independent work.

## Usage rules

### sheet-bounded-review

Owner: sheet.

When a supporting detail panel has dense content.

Do: Keep the title and explicit footer dismissal reachable while the body scrolls.

Avoid: Add nested decorative panels or rely on a missing corner close button as the only exit.

Why: A supporting task needs an obvious end without obscuring the parent context.

Checked by: review only. Look for: Open the long controlled review in both themes, reach the last grant and close to the original trigger.

Source evidence:
- src/components/v4/ui/sheet.tsx

### sheet-usage

Owner: sheet.

When a side panel contains unsaved changes.

Do: Keep the draft on a rejected save and let the host protect dismissal while dirty.

Avoid: Close on outside interaction and silently discard the only copy of the draft.

Why: The supporting panel must not make ordinary dismissal a hidden destructive action.

Checked by: review only. Look for: Edit a draft, reject a save and attempt dismissal at a narrow viewport. The title/close control stay reachable and unsaved data is not silently discarded.

Source evidence:
- src/components/v4/ui/sheet.tsx
- src/pages/design-system/examples/sheet/default.tsx

## State guidance

- narrow: Keep title, close action and body reachable within the viewport.
- pending: Show the actual pending operation and prevent duplicate submission.

## Presentation rules

Do: Keep the main object context visible in the panel heading.

Avoid: Open a second sheet for every nested detail.

Why: Repeated panels obscure which object and draft the person is editing.

## Import and exports

- src/components/v4/ui/sheet.tsx

Exports: Sheet, SheetBody, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, SheetTrigger. Source TypeScript defines the API.

## Behavior

- SheetBody owns the shared body inset and bounded scrolling between Header and Footer. It forwards a div ref and native props; Content continues to accept arbitrary children. Use one intentional scroll owner.
- Sheet composes Radix Dialog with side-specific Content and scoped portals. open/onOpenChange controls visibility; Close is an explicit dismiss action.

## Accessibility

- Provide SheetTitle and SheetDescription. Focus stays in the sheet and returns to the trigger. Escape inside an open editor closes the editor before the sheet.

## Use cases

- Choose the side from the task, provide a title and maintain explicit pending, error and unsaved-close policy in the host.

## Avoid

- Assume Sheet saves or preserves a draft, or remove all close paths to work around a request race.

## Limits

- Sheet does not own request state or automatically preserve unsaved work; the host decides whether closure is allowed.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### SheetContent.side

- top: example `placements`, visible label "top".
- right: example `placements`, visible label "right".
- bottom: example `placements`, visible label "bottom".
- left: example `placements`, visible label "left".

### Close control

- true: example `placements`, visible label "right".
- false: example `behavior`, visible label "Done reviewing".

## Executable examples

### Connection details

Save this example at `src/pages/design-system/examples/sheet/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/sheet. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import * as UI from "../../../../components/v4/ui/sheet";
export default function Example() {
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <UI.Sheet>
        <UI.SheetTrigger asChild>
          <Button variant="outline">Inspect connection</Button>
        </UI.SheetTrigger>
        <UI.SheetContent>
          <UI.SheetHeader>
            <UI.SheetTitle>Staging connection</UI.SheetTitle>
            <UI.SheetDescription>
              View the destination and synchronization status.
            </UI.SheetDescription>
          </UI.SheetHeader>
          <UI.SheetBody>
            <p>All 12 versions synchronized.</p>
          </UI.SheetBody>
          <UI.SheetFooter>
            <UI.SheetClose asChild>
              <Button>Close connection</Button>
            </UI.SheetClose>
          </UI.SheetFooter>
        </UI.SheetContent>
      </UI.Sheet>
    </div>);
}
```

### Sides

Save this example at `src/pages/design-system/examples/sheet/placements.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/sheet. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import * as UI from "../../../../components/v4/ui/sheet";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      {(["top", "right", "bottom", "left"] as const).map((side) => (<figure key={side} className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
          <UI.Sheet>
            <UI.SheetTrigger asChild>
              <Button variant="outline">{side} sheet</Button>
            </UI.SheetTrigger>
            <UI.SheetContent side={side}>
              <UI.SheetHeader>
                <UI.SheetTitle>Staging connection</UI.SheetTitle>
                <UI.SheetDescription>
                  Read access, last synchronized 12 versions.
                </UI.SheetDescription>
              </UI.SheetHeader>
              <UI.SheetFooter>
                <UI.SheetClose asChild>
                  <Button variant="outline">Close connection</Button>
                </UI.SheetClose>
              </UI.SheetFooter>
            </UI.SheetContent>
          </UI.Sheet>
        </div><figcaption className="text-muted-foreground text-xs">{side}</figcaption></figure>))}
    </div>);
}
```

### Controlled long review

Save this example at `src/pages/design-system/examples/sheet/behavior.tsx`; its relative imports are generated for that exact path. States: controlled, overflow.

Registry items used: @infisical/button, @infisical/sheet. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { Button } from "../../../../components/v4/ui/button";
import * as UI from "../../../../components/v4/ui/sheet";

export default function Example() {
  const [open, setOpen] = useState(false);
  return (
    <UI.Sheet open={open} onOpenChange={setOpen}>
      <UI.SheetTrigger asChild>
        <Button variant="outline">Review grants</Button>
      </UI.SheetTrigger>
      <UI.SheetContent showCloseButton={false}>
        <UI.SheetHeader>
          <UI.SheetTitle>Connection grants</UI.SheetTitle>
          <UI.SheetDescription>
            24 fictional grants. Use the footer action or Escape to close.
          </UI.SheetDescription>
        </UI.SheetHeader>
        <UI.SheetBody>
          <ul>
            {Array.from({ length: 24 }, (_, index) => (
              <li key={index}>Client {index + 1}: read Staging configuration</li>
            ))}
          </ul>
        </UI.SheetBody>
        <UI.SheetFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Done reviewing
          </Button>
        </UI.SheetFooter>
      </UI.SheetContent>
    </UI.Sheet>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#sheet and verify the documented interaction.
