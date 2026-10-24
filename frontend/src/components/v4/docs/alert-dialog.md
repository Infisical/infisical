# Alert Dialog

Confirm an irreversible consequence before performing it.

## Choose this component

Choose AlertDialog when a specific irreversible consequence needs confirmation. Use Dialog for editable tasks and an inline action for easily reversible work.

## Usage rules

### alert-dialog-usage

Owner: alert-dialog.

When deleting a named resource requires an asynchronous request.

Do: Name the resource and consequence, offer Cancel before submission, and close only after the request succeeds. Keep cancellation available while pending only if the host can actually cancel the operation.

Avoid: Use a generic Are you sure prompt whose action closes before the request settles.

Why: The user needs the exact consequence and a retry path when the deletion fails.

Checked by: review only. Look for: Confirm a failed asynchronous revocation; the dialog and error remain. Cancel works before submission, and pending cancellation is offered only if it actually stops the operation.

Source evidence:
- src/components/v4/ui/alert-dialog.tsx
- src/pages/design-system/examples/alert-dialog/default.tsx

## State guidance

- pending: Control open state and prevent repeated destructive submission.
- error: Keep the dialog open with the failed action and recovery text.

## Presentation rules

Do: Label the action Delete connection or Revoke access.

Avoid: Label both trigger and confirmation Continue.

Why: Vague labels hide which irreversible operation is being approved.

## Import and exports

- src/components/v4/ui/alert-dialog.tsx

Exports: AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogMedia, AlertDialogOverlay, AlertDialogPortal, AlertDialogTitle, AlertDialogTrigger. Source TypeScript defines the API.

## Behavior

- Controlled open/onOpenChange or defaultOpen owns visibility. Action and Cancel are Radix close controls; an async operation must explicitly control closing while it runs.
- AlertDialog renders at most one lead tile. tone danger shows a 40px bad-bg tile with the trash icon; icon swaps the glyph and AlertDialogMedia replaces the tile entirely, tinted by tone. With tone neutral or no tone there is no automatic tile; an icon or AlertDialogMedia there gets the neutral tint tile. The destructive action is the solid danger Button: bad fill, on-bad text, the neutral disabled control when disabled.
- confirmText adds a mono field, labeled Type <name> to confirm and focused on open, above the footer; the action stays disabled until the field matches exactly.
- One pad (space-16) on all four sides. Header, body and footer stack with the content gap and no margins. The footer has no band or rule: the actions sit right-aligned on the panel. A failure shows as a bad Alert in the body above the footer.
- When AlertDialogHeader or AlertDialogFooter is a direct child, the lead tile, header and body share one scroll region with the edge fade, and the footer stays pinned below it; the footer's own pad is the space above the actions.

## Accessibility

- Title and Description name the alert dialog. Focus starts on Cancel and returns to the trigger on close. The dialog stays inside the viewport, and Escape inside an open editor closes that editor first.

## Use cases

- Control open state or prevent the Action default close, retain the resource and consequence text, and close only after the host confirms success.

## Avoid

- Assume AlertDialogAction waits for a promise or close the confirmation before a failure can be shown.

## Limits

- Action does not await a request or infer success; prevent its default close or control open while an async operation settles.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### AlertDialogContent.size

- default: example `sizes`, visible label "default".
- sm: example `sizes`, visible label "sm".

### AlertDialogContent.tone

- danger: example `confirm`, visible label "danger".
- neutral: example `confirm`, visible label "neutral".

## Executable examples

### Confirmation states

Save this example at `src/pages/design-system/examples/alert-dialog/default.tsx`; its relative imports are generated for that exact path. States: default, loading, error, keyboard.

Registry items used: @infisical/alert, @infisical/alert-dialog, @infisical/button. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Alert, AlertDescription } from "../../../../components/v4/ui/alert";
import * as UI from "../../../../components/v4/ui/alert-dialog";
import { Button } from "../../../../components/v4/ui/button";
export default function Example() {
    const [open, setOpen] = useState<string | null>(null);
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      {(["Confirmation", "Pending", "Error"] as const).map((state) => (<figure key={state} className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
          <UI.AlertDialog open={open === state} onOpenChange={(next) => setOpen(next ? state : null)}>
            <UI.AlertDialogTrigger asChild>
              <Button variant="outline">Revoke access</Button>
            </UI.AlertDialogTrigger>
            <UI.AlertDialogContent tone="danger">
              <UI.AlertDialogHeader>
                <UI.AlertDialogTitle>Revoke client access?</UI.AlertDialogTitle>
                <UI.AlertDialogDescription>
                  This client will no longer read Staging secrets.
                </UI.AlertDialogDescription>
              </UI.AlertDialogHeader>
              {state === "Error" && (<Alert tone="bad">
                  <AlertDescription>Access could not be revoked. Try again.</AlertDescription>
                </Alert>)}
              <UI.AlertDialogFooter>
                <UI.AlertDialogCancel>Cancel</UI.AlertDialogCancel>
                <UI.AlertDialogAction asChild>
                  <Button variant="destructive" loading={state === "Pending"}>
                    Revoke access
                  </Button>
                </UI.AlertDialogAction>
              </UI.AlertDialogFooter>
            </UI.AlertDialogContent>
          </UI.AlertDialog>
        </div><figcaption className="text-muted-foreground text-xs">{state}</figcaption></figure>))}
    </div>);
}
```

### Sizes

Save this example at `src/pages/design-system/examples/alert-dialog/sizes.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/alert-dialog, @infisical/button. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as UI from "../../../../components/v4/ui/alert-dialog";
import { Button } from "../../../../components/v4/ui/button";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      {(["default", "sm"] as const).map((size) => (<figure key={size} className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
          <UI.AlertDialog>
            <UI.AlertDialogTrigger asChild>
              <Button variant="outline">
                {size === "sm" ? "Small confirmation" : "Default confirmation"}
              </Button>
            </UI.AlertDialogTrigger>
            <UI.AlertDialogContent size={size} tone="neutral" icon="folder">
              <UI.AlertDialogHeader>
                <UI.AlertDialogTitle>Archive request details?</UI.AlertDialogTitle>
                <UI.AlertDialogDescription>
                  Archived requests remain available in the audit log. Cancel to keep this request
                  open.
                </UI.AlertDialogDescription>
              </UI.AlertDialogHeader>
              <UI.AlertDialogFooter>
                <UI.AlertDialogCancel>Keep request</UI.AlertDialogCancel>
                <UI.AlertDialogAction disabled>Archive unavailable</UI.AlertDialogAction>
              </UI.AlertDialogFooter>
            </UI.AlertDialogContent>
          </UI.AlertDialog>
        </div><figcaption className="text-muted-foreground text-xs">{size}</figcaption></figure>))}
    </div>);
}
```

### Constrained content

Save this example at `src/pages/design-system/examples/alert-dialog/content.tsx`; its relative imports are generated for that exact path. States: overflow.

Registry items used: @infisical/alert-dialog, @infisical/button. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as UI from "../../../../components/v4/ui/alert-dialog";
import { Button } from "../../../../components/v4/ui/button";

export default function Example() {
  return (
    <UI.AlertDialog>
      <UI.AlertDialogTrigger asChild>
        <Button variant="outline">Review clients</Button>
      </UI.AlertDialogTrigger>
      <UI.AlertDialogContent>
        <UI.AlertDialogHeader>
          <UI.AlertDialogTitle>Review 24 client grants</UI.AlertDialogTitle>
          <UI.AlertDialogDescription>
            These fictional clients would lose access if this grant were revoked.
          </UI.AlertDialogDescription>
        </UI.AlertDialogHeader>
        <ul>
          {Array.from({ length: 24 }, (_, index) => (
            <li key={index}>Deployment client {index + 1}: Staging read access</li>
          ))}
        </ul>
        <UI.AlertDialogFooter>
          <UI.AlertDialogCancel>Keep grants</UI.AlertDialogCancel>
        </UI.AlertDialogFooter>
      </UI.AlertDialogContent>
    </UI.AlertDialog>
  );
}
```

### Type to confirm and tone

Save this example at `src/pages/design-system/examples/alert-dialog/confirm.tsx`; its relative imports are generated for that exact path. States: default, disabled.

Registry items used: @infisical/alert-dialog, @infisical/button. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import * as UI from "../../../../components/v4/ui/alert-dialog";
import { Button } from "../../../../components/v4/ui/button";
export default function Example() {
    const [open, setOpen] = useState<string | null>(null);
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <UI.AlertDialog open={open === "danger"} onOpenChange={(next) => setOpen(next ? "danger" : null)}>
          <UI.AlertDialogTrigger asChild>
            <Button variant="outline">Delete project</Button>
          </UI.AlertDialogTrigger>
          <UI.AlertDialogContent tone="danger" confirmText="payments-api">
            <UI.AlertDialogHeader>
              <UI.AlertDialogTitle>Delete payments-api?</UI.AlertDialogTitle>
              <UI.AlertDialogDescription>
                All 52 secrets, 9 environments and their history are removed. This cannot be undone.
              </UI.AlertDialogDescription>
            </UI.AlertDialogHeader>
            <UI.AlertDialogFooter>
              <UI.AlertDialogCancel>Cancel</UI.AlertDialogCancel>
              <UI.AlertDialogAction variant="destructive">Delete project</UI.AlertDialogAction>
            </UI.AlertDialogFooter>
          </UI.AlertDialogContent>
        </UI.AlertDialog>
      </div><figcaption className="text-muted-foreground text-xs">{"danger"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <UI.AlertDialog open={open === "neutral"} onOpenChange={(next) => setOpen(next ? "neutral" : null)}>
          <UI.AlertDialogTrigger asChild>
            <Button variant="outline">Rotate key</Button>
          </UI.AlertDialogTrigger>
          <UI.AlertDialogContent tone="neutral">
            <UI.AlertDialogHeader>
              <UI.AlertDialogTitle>Rotate the signing key?</UI.AlertDialogTitle>
              <UI.AlertDialogDescription>
                Clients pick up the new key on their next request.
              </UI.AlertDialogDescription>
            </UI.AlertDialogHeader>
            <UI.AlertDialogFooter>
              <UI.AlertDialogCancel>Cancel</UI.AlertDialogCancel>
              <UI.AlertDialogAction>Rotate key</UI.AlertDialogAction>
            </UI.AlertDialogFooter>
          </UI.AlertDialogContent>
        </UI.AlertDialog>
      </div><figcaption className="text-muted-foreground text-xs">{"neutral"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run dev; open /design-system#alert-dialog and verify the documented interaction.
