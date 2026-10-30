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
- src/components/v4/lib/overlay-pending.ts

Exports: Sheet, SheetBody, SheetClose, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetSubheader, SheetTitle, SheetTrigger. Source TypeScript defines the API.

## Behavior

- SheetBody owns the shared body inset. When SheetHeader, SheetSubheader, SheetBody or SheetFooter is a direct child, Content wraps the header and body in one scroll region with the edge fade, so the header scrolls away with the body; SheetFooter and the corner close stay outside it and remain visible. SheetSubheader pins itself and the header above the scroll region and runs the full width, without the space reserved for the close button: use it for an artifact or legend the content needs, such as a path preview, a step meter or a filter row. Content without these slots, such as a Sidebar, renders unchanged. Each slot forwards a div ref and native props.
- Sheet composes Radix Dialog with side-specific Content and scoped portals. open/onOpenChange controls visibility; Close is an explicit dismiss action.
- SheetContent size sets the maximum width of a left or right sheet from a token: sm (size-sheet-sm, 384px, the default) for details and short forms, md (size-sheet-md, 512px) for create forms such as Create secret, and lg (size-sheet-lg, 672px) for form sheets with credentials, field pairs or a step bar, such as New connection and an auth method. The sheet is never wider than the viewport. Top and bottom sheets span the viewport and ignore size.
- pending on SheetContent (v3 isPending) blocks Escape, outside clicks and focus moves, and disables the corner close and SheetClose while a save is in flight; the content is aria-busy. Clicks on a toast never dismiss the sheet. Route onOpenChange(false) through useDiscardChangesGuard so a dirty form asks with DiscardChangesAlertDialog first.

## Accessibility

- Provide SheetTitle and SheetDescription. Focus stays in the sheet and returns to the trigger. Escape inside an open editor closes the editor before the sheet.

## Use cases

- Choose the side from the task, provide a title and maintain explicit pending, error and unsaved-close policy in the host.

## Avoid

- Assume Sheet saves or preserves a draft, or remove all close paths to work around a request race.

## Limits

- Sheet does not own request state or automatically preserve unsaved work; the host passes pending and routes closing through useDiscardChangesGuard.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### SheetContent.side

- top: example `placements`, visible label "top".
- right: example `placements`, visible label "right".
- bottom: example `placements`, visible label "bottom".
- left: example `placements`, visible label "left".

### SheetContent.size

- sm: example `sizes`, visible label "sm".
- md: example `sizes`, visible label "md".
- lg: example `sizes`, visible label "lg".

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

### Sizes

Save this example at `src/pages/design-system/examples/sheet/sizes.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/field, @infisical/input, @infisical/sheet. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import { Field, FieldGroup } from "../../../../components/v4/ui/field";
import { Input } from "../../../../components/v4/ui/input";
import * as UI from "../../../../components/v4/ui/sheet";
const sizes = ["sm", "md", "lg"] as const;
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      {sizes.map((size) => (<figure key={size} className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
          <UI.Sheet>
            <UI.SheetTrigger asChild>
              <Button variant="outline">{size} sheet</Button>
            </UI.SheetTrigger>
            <UI.SheetContent size={size}>
              <UI.SheetHeader>
                <UI.SheetTitle>Staging connection</UI.SheetTitle>
                <UI.SheetDescription>
                  Edit the name and access key for this connection.
                </UI.SheetDescription>
              </UI.SheetHeader>
              <UI.SheetBody>
                <FieldGroup>
                  <Field label="Connection name" wide>
                    <Input defaultValue="aws-staging-keys"/>
                  </Field>
                  <Field label="Access key ID" description="Shown in activity logs." wide>
                    <Input defaultValue="AKIAEXAMPLESTAGING01"/>
                  </Field>
                </FieldGroup>
              </UI.SheetBody>
              <UI.SheetFooter>
                <UI.SheetClose asChild>
                  <Button variant="outline">Close connection</Button>
                </UI.SheetClose>
              </UI.SheetFooter>
            </UI.SheetContent>
          </UI.Sheet>
        </div><figcaption className="text-muted-foreground text-xs">{size}</figcaption></figure>))}
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

### Path preview subheader

Save this example at `src/pages/design-system/examples/sheet/subheader.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/code, @infisical/sheet. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import { Code } from "../../../../components/v4/ui/code";
import * as UI from "../../../../components/v4/ui/sheet";
const keys = [
    "DATABASE_URL",
    "DATABASE_POOL_SIZE",
    "REDIS_URL",
    "QUEUE_CONCURRENCY",
    "PAYMENTS_WEBHOOK_URL",
    "PAYMENTS_RETRY_LIMIT",
    "LOG_LEVEL",
    "LOG_FORMAT",
    "FEATURE_REFUNDS",
    "FEATURE_INVOICES",
    "SESSION_TTL",
    "CORS_ORIGINS",
    "METRICS_ENDPOINT",
    "TRACE_SAMPLE_RATE",
    "SMTP_HOST",
    "SMTP_PORT",
    "CACHE_TTL",
    "RATE_LIMIT_PER_MINUTE",
    "REGION",
    "RELEASE_CHANNEL"
];
export default function Example() {
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <UI.Sheet>
        <UI.SheetTrigger asChild>
          <Button variant="outline">Review import</Button>
        </UI.SheetTrigger>
        <UI.SheetContent>
          <UI.SheetHeader>
            <UI.SheetTitle>Import 20 secrets</UI.SheetTitle>
            <UI.SheetDescription>Existing keys at this path are overwritten.</UI.SheetDescription>
          </UI.SheetHeader>
          <UI.SheetSubheader>
            <Code>acme / payments-api / production</Code>
          </UI.SheetSubheader>
          <UI.SheetBody>
            <ul>
              {keys.map((key) => (<li key={key}>
                  <Code>{key}</Code>
                </li>))}
            </ul>
          </UI.SheetBody>
          <UI.SheetFooter>
            <UI.SheetClose asChild>
              <Button>Import secrets</Button>
            </UI.SheetClose>
          </UI.SheetFooter>
        </UI.SheetContent>
      </UI.Sheet>
    </div>);
}
```

### Pending save and unsaved changes

Save this example at `src/pages/design-system/examples/sheet/pending.tsx`; its relative imports are generated for that exact path. States: controlled, loading, editing.

Registry items used: @infisical/alert-dialog, @infisical/button, @infisical/field, @infisical/input, @infisical/sheet. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useEffect, useId, useState } from "react";
import { useDiscardChangesGuard } from "../../../../components/v4/hooks/use-discard-changes-guard";
import { DiscardChangesAlertDialog } from "../../../../components/v4/ui/alert-dialog";
import { Button } from "../../../../components/v4/ui/button";
import { Field } from "../../../../components/v4/ui/field";
import { Input } from "../../../../components/v4/ui/input";
import * as UI from "../../../../components/v4/ui/sheet";
export default function Example() {
    const [saved, setSaved] = useState("https://hooks.example.com/infisical");
    const [draft, setDraft] = useState(saved);
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const formId = useId();
    const { requestDiscard, discardDialogProps } = useDiscardChangesGuard({
        isDirty: draft !== saved,
        onDiscard: () => {
            setDraft(saved);
            setOpen(false);
        }
    });
    useEffect(() => {
        if (!saving)
            return undefined;
        const timer = window.setTimeout(() => {
            setSaved(draft);
            setSaving(false);
            setOpen(false);
        }, 1500);
        return () => window.clearTimeout(timer);
    }, [saving, draft]);
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
      <UI.Sheet open={open} onOpenChange={(next) => (next ? setOpen(true) : requestDiscard())}>
        <UI.SheetTrigger asChild>
          <Button variant="outline">Edit webhook</Button>
        </UI.SheetTrigger>
        <UI.SheetContent pending={saving}>
          <UI.SheetHeader>
            <UI.SheetTitle>Edit webhook</UI.SheetTitle>
            <UI.SheetDescription>
              Closing with unsaved edits asks first. While saving, the sheet cannot close.
            </UI.SheetDescription>
          </UI.SheetHeader>
          <UI.SheetBody>
            <form id={formId} onSubmit={(event) => {
            event.preventDefault();
            setSaving(true);
        }}>
              <Field label="Endpoint URL">
                <Input required mono disabled={saving} value={draft} onChange={(event) => setDraft(event.target.value)}/>
              </Field>
            </form>
          </UI.SheetBody>
          <UI.SheetFooter>
            <Button type="submit" form={formId} loading={saving} disabled={draft === saved}>
              Save Changes
            </Button>
            <UI.SheetClose asChild>
              <Button variant="outline">Cancel</Button>
            </UI.SheetClose>
          </UI.SheetFooter>
        </UI.SheetContent>
      </UI.Sheet>
      <DiscardChangesAlertDialog {...discardDialogProps} description="Your unsaved changes to this webhook will be lost."/>
    </div><figcaption className="text-muted-foreground text-xs">{`Saved URL: ${saved}`}</figcaption></figure>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run dev; open /design-system#sheet and verify the documented interaction.
