# Sonner

Announce a short-lived result through themed toast notifications.

## Choose this component

Choose Toast for a recent operation result that should not move focus. Use Alert for a persistent actionable failure and inline FieldError for invalid input.

## Usage rules

### toast-usage

Owner: toast.

When an asynchronous save finishes after the initiating menu closes.

Do: Await the operation, then announce its actual result; retain a durable recovery route for a failure.

Avoid: Announce Saved on click or make a short-lived toast the only way to retry a failed mutation.

Why: Transient feedback cannot substitute for persistence or a recoverable error state.

Checked by: review only. Look for: Reject an operation and a clipboard write. No success toast appears before fulfillment, and a failure that needs repair remains recoverable after transient feedback disappears.

Source evidence:
- src/components/v4/ui/sonner.tsx
- src/pages/design-system/examples/toast/default.tsx

### toast-one-feedback-owner

Owner: toast.

When a recent operation needs transient result feedback.

Do: Choose Toaster or controlled ToastStack as the queue owner, create success after settlement and keep actionable errors reachable.

Avoid: Send the same result to both queues, dismiss a pending operation by timer or use a toast as the only field validation message.

Why: Duplicate or transient feedback can obscure which operation failed and where to recover.

Checked by: review only. Look for: Keep a clipboard promise pending, reject it and retry. One queue reports each outcome, and a failed or loading item does not disappear before the person can act.

Source evidence:
- src/components/v4/ui/sonner.tsx
- src/pages/design-system/examples/toast/default.tsx

## State guidance

- pending: Keep the operation pending until it resolves rather than immediately issuing success.
- error: Use an action only if the host can actually retry or undo the operation.

## Presentation rules

Do: Name the completed object or action in one short sentence.

Avoid: Send the same success message through a toast, banner and inline alert at once.

Why: Repeated announcements interrupt the ongoing task.

## Import and exports

- src/components/v4/ui/sonner.tsx
- src/components/v4/ui/toast-stack.tsx
- src/components/v4/ui/helpers.module.css

Exports: Toaster, ToastStack, ToastItem. Source TypeScript defines the API.

## Behavior

- Toaster renders Sonner notifications with an explicit theme or V4Scope's resolved theme. ToastStack is a separate controlled items/onDismiss composition; pending and error items persist.

## Accessibility

- ToastStack exposes status feedback and named action/dismiss buttons. Its auto-dismiss timer pauses while hovered or keyboard-focused, then resumes the remaining duration.

## Use cases

- Use a single notification queue for useful transient results, with durable recovery where a failure needs action.

## Limits

- Toaster/Sonner and controlled ToastStack are alternative owners, not a shared queue. The host creates results after actual settlement and handles action effects.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### tone

- neutral: example `default`, visible label "neutral".
- ok: example `default`, visible label "ok".
- bad: example `default`, visible label "bad".
- loading: example `default`, visible label "loading".

### clipboard lifecycle


- pending: omitted. The clipboard lifecycle is a host flow; the toast tones above are what it renders.
- failed: omitted. The clipboard lifecycle is a host flow; the toast tones above are what it renders.
- copied: omitted. The clipboard lifecycle is a host flow; the toast tones above are what it renders.
- retry: omitted. The clipboard lifecycle is a host flow; the toast tones above are what it renders.

### size support


- no authored named size: omitted. This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API.

## Executable examples

### One notice per tone

Save this example at `src/pages/design-system/examples/toast/default.tsx`; its relative imports are generated for that exact path. States: default, controlled.

Registry items used: @infisical/button, @infisical/sonner. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useEffect, useId, useState } from "react";
import { Button } from "../../../../components/v4/ui/button";
import { type ToastItem, ToastStack } from "../../../../components/v4/ui/sonner";
const tones = {
    neutral: { id: "neutral", title: "Version available", tone: "neutral" },
    ok: { id: "ok", title: "Changes saved", tone: "ok" },
    bad: { id: "bad", title: "Connection failed", tone: "bad" },
    loading: { id: "loading", title: "Checking provider", tone: "loading" }
} satisfies Record<string, ToastItem>;
const resolved = { id: "loading", title: "Provider connected", tone: "ok" } satisfies ToastItem;
const ToneDemo = ({ tone }: {
    tone: keyof typeof tones;
}) => {
    const regionId = useId();
    const [item, setItem] = useState<ToastItem | null>(null);
    useEffect(() => {
        if (item?.tone !== "loading")
            return undefined;
        const timer = window.setTimeout(() => setItem(resolved), 1800);
        return () => window.clearTimeout(timer);
    }, [item]);
    return (<div className="flex w-full flex-col items-start gap-3">
      <Button variant="outline" aria-controls={regionId} onClick={() => setItem({ ...tones[tone], duration: 0 })}>
        Show {tone} notice
      </Button>
      <div id={regionId} className="min-h-14 w-full">
        {item && <ToastStack inline items={[item]} onDismiss={() => setItem(null)}/>}
      </div>
    </div>);
};
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
      {(Object.keys(tones) as (keyof typeof tones)[]).map((tone) => (<figure key={tone} className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
          <ToneDemo tone={tone}/>
        </div><figcaption className="text-muted-foreground text-xs">{tone}</figcaption></figure>))}
    </div>);
}
```

### Trigger success and error notifications

Save this example at `src/pages/design-system/examples/toast/parts.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/sonner. Additional packages: sonner@^2.0.7. Install every listed item before compiling this example.

```tsx
import { toast } from "sonner";
import { Button } from "../../../../components/v4/ui/button";
import * as UI from "../../../../components/v4/ui/sonner";
export default function Example() {
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <UI.Toaster />
        <Button onClick={() => toast.success("Changes saved", {
            description: "New versions are available to clients."
        })}>
          Show success toast
        </Button>
        <Button variant="outline" onClick={() => toast.error("Connection failed", { description: "Reconnect before retrying." })}>
          Show failure
        </Button>
      </div>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#toast and verify the documented interaction.
