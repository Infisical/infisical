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

### toast-shell-host

Owner: toast.

When a page inside the v4 shell needs to announce a result.

Do: Call toast from @infisical/sonner and let the AppShell host show it, including from inside an open sheet or dialog.

Avoid: Mount a page-local Toaster or a fixed ToastStack with its own store, or raise a toast's z-index to clear an overlay.

Why: One host on the shared overlay layer keeps one queue and paints above every overlay by DOM order; page-local hosts duplicate the queue and fight the layer model.

Checked by: review only. Look for: Open the sheet in the over-sheet example and save: the toast shows once, above the sheet, in both themes, and dismissing it leaves the sheet open.

Source evidence:
- src/components/v4/ui/sonner.tsx
- src/components/v4/ui/top-bar.tsx
- src/components/v4/scope.tsx
- src/pages/design-system/examples/toast/over-sheet.tsx

### toast-action-result-default

Owner: toast.

When an action finishes: copied, saved, deleted, moved, uploaded or failed.

Do: Call toast with the result by default, even when the action started from a table row, a bulk bar or a toolbar.

Avoid: Show the result in a table or list footer, a status line beside the table or a hidden role="status" paragraph.

Why: The toast region is aria-live, so one call shows and announces the result in the same place on every page.

Checked by: review only. Look for: ui:lint action-feedback-in-status flags action state rendered in a footer slot or role="status" element; trigger the action and read the result in the toast region.

Source evidence:
- src/components/v4/ui/sonner.tsx
- src/pages/design-system/examples/toast/parts.tsx

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
- src/components/v4/ui/sonner.module.css
- src/components/v4/ui/toast-stack.tsx
- src/components/v4/ui/helpers.module.css
- src/components/v4/ui/top-bar.tsx
- src/components/v4/scope.tsx

Exports: Toaster, toast, V4_TOASTER_ID, ToastStack, ToastItem. Source TypeScript defines the API.

## Behavior

- Toaster renders Sonner notifications with an explicit theme or V4Scope's resolved theme. ToastStack is a separate controlled items/onDismiss composition; in both, pending and error items persist.
- The v4 Toaster has its own toaster id (V4_TOASTER_ID), and the toast exported beside it routes every call to that id. The app's v3 Toaster only shows toasts without an id, so a v4 toast and a v3 toast never render twice, even when both Toasters are mounted on one page.
- AppShell mounts the one toast host, so every page inside the v4 shell calls toast() without mounting a Toaster. Toaster is idempotent per toaster id: when a page or example still mounts its own, the first mounted instance renders and the others render nothing, so no toast shows twice; when it unmounts, the next one takes over.
- Toaster portals into the V4Scope toast layer, a sibling placed right after the overlay container, and sits on the shared overlay layer (z-50). It follows every sheet, dialog and menu in DOM order, so a toast paints above an open sheet or dialog without a higher z-index. Its toasts keep pointer events while a modal turns them off for the page, and a click on one never dismisses the overlay under it. The notifications region is aria-live, so a modal never hides it from assistive technology.
- Both toast hosts, the Toaster and a fixed ToastStack, sit at --v4-toast-bottom, so a toast never covers pagination or the bulk bar. With no bar it is size-action-bar plus twice space-action-bar-offset (96px), which clears a table footer and its pagination at the end of an AppInset page (page padding space-40, a 32px pagination row and the shell gap reach 81px). A shown FloatingActionBar reports to V4Scope through useActionBarReserve, which sets data-action-bar-reserve on the scope, its portal container and its toast layer, and the offset grows by the bar's reserve (size-action-bar plus space-action-bar-offset), the same amount AppInset pads its content by. The offset moves over duration-moderate with ease-standard and jumps under reduced motion.
- Toaster renders sonner unstyled and draws each toast with the v4 tokens: toast-bg, toast-line and shadow-pop on the card, the row-title type for the title and small type in toast-muted for the description, both in Archivo. The status icon sits at the top, centered on the title's first line, however many lines the description wraps to. The stack is always expanded with an 8px gap, newest at the bottom, so every toast shows its content.
- Both owners use one anatomy: the status icon, then a text column with the title, the description and an actions row, then the close button. The title and description take the whole text column. The action sits on its own row under the text as a quiet sm button (a ghost Button in ToastStack), start-aligned with the title like Alert actions, so it never squeezes the title. The close button stays top-right, centered on the title's first line.
- Width comes from the text: a ToastStack is as wide as its widest title or description, capped at size-toast, and every toast in the stack shares that width. The actions row does not add to it. The Sonner Toaster draws every toast at size-toast. ToastItem takes one action.
- The shared toast() covers the ToastStack tones: toast.success for ok, toast.error for bad, toast.info for neutral and toast.loading for loading, which a later call with the same id resolves in place. Every call takes description, and action as { label, onClick }, which renders in the action row under the text. toast.error stays until it is dismissed, as ToastStack's bad items do; pass duration for one that should clear on its own. Every toast except loading has a close button top-right, centered on the title's first line, the same as ToastStack's.

## Accessibility

- ToastStack exposes status feedback and named action/dismiss buttons. Its auto-dismiss timer pauses while hovered or keyboard-focused, then resumes the remaining duration.
- ToastStack announces through two live regions that mount with the stack, before its first toast: a polite status region for ok, neutral and loading items and an assertive alert region for bad items. Each new item, or an item whose tone or title changes (loading resolving to ok), writes its title and description into one region, so it is announced once. The toast cards carry no live role, so nothing is announced twice. Items present when the stack mounts are not announced, so mount the stack empty and keep it mounted, the way FlowToasts and AccessToasts do.
- Toaster announces the same way: it mounts its own polite status and assertive alert regions beside Sonner's list and turns Sonner's polite region (Notifications, alt+T) off, so toast.error is announced once and assertively and every other toast once and politely. The close button is named Dismiss notification.

## Use cases

- Use a single notification queue for useful transient results, with durable recovery where a failure needs action.

## Limits

- A modal sheet or dialog traps focus, so while one is open its toasts are reachable by pointer and announced, but Tab does not leave the modal to reach a toast action. Keep any recovery a toast offers reachable from the page as well.
- Toaster/Sonner and controlled ToastStack are alternative owners, not a shared queue. The host creates results after actual settlement and handles action effects.
- Call toast from @infisical/sonner, not from the sonner package: a plain sonner toast has no toaster id and goes to the app's v3 Toaster instead.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### tone

- neutral: example `default`, visible label "neutral".
- ok: example `default`, visible label "ok".
- bad: example `default`, visible label "bad".
- loading: example `default`, visible label "loading".

### content

- title only: example `anatomy`, visible label "ok, title only".
- description: example `anatomy`, visible label "ok, description".
- action: example `anatomy`, visible label "neutral, action".
- long title: example `anatomy`, visible label "long title".
- upload: example `anatomy`, visible label "upload".

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

Registry items used: @cipher/button, @cipher/sonner. Additional packages: none. Install every listed item before compiling this example.

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

const ToneDemo = ({ tone }: { tone: keyof typeof tones }) => {
  const regionId = useId();
  const [item, setItem] = useState<ToastItem | null>(null);
  useEffect(() => {
    if (item?.tone !== "loading") return undefined;
    const timer = window.setTimeout(() => setItem(resolved), 1800);
    return () => window.clearTimeout(timer);
  }, [item]);
  return (
    <div className="flex w-full flex-col items-start gap-3">
      <Button
        variant="outline"
        aria-controls={regionId}
        onClick={() => setItem({ ...tones[tone], duration: 0 })}
      >
        Show {tone} notice
      </Button>
      <div id={regionId} className="min-h-14 w-full">
        <ToastStack inline items={item ? [item] : []} onDismiss={() => setItem(null)} />
      </div>
    </div>
  );
};

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-start gap-x-6 gap-y-8">
      {(Object.keys(tones) as (keyof typeof tones)[]).map((tone) => (
        <figure key={tone} className="m-0 flex w-full min-w-0 flex-col gap-3">
          <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
            <ToneDemo tone={tone} />
          </div>
          <figcaption className="text-muted-foreground text-xs">{tone}</figcaption>
        </figure>
      ))}
    </div>
  );
}
```

### Content variants

Save this example at `src/pages/design-system/examples/toast/anatomy.tsx`; its relative imports are generated for that exact path. States: default, success, error, loading.

Registry items used: @cipher/button, @cipher/sonner. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { Button } from "../../../../components/v4/ui/button";
import { type ToastItem, ToastStack } from "../../../../components/v4/ui/sonner";

const share = { label: "Share 2 secrets", onClick: () => undefined };

const cases: { label: string; item: ToastItem }[] = [
  { label: "ok, title only", item: { id: "ok", tone: "ok", title: "Changes saved" } },
  {
    label: "ok, description",
    item: {
      id: "ok-description",
      tone: "ok",
      title: "Changes saved",
      description: "New versions are available to clients."
    }
  },
  {
    label: "bad, description",
    item: {
      id: "bad",
      tone: "bad",
      title: "Connection failed",
      description: "Reconnect the integration before retrying."
    }
  },
  { label: "neutral, title only", item: { id: "neutral", title: "Version available" } },
  {
    label: "neutral, action",
    item: {
      id: "neutral-action",
      title: "Version available",
      description: "Reload to get the latest dashboard.",
      action: { label: "Reload", onClick: () => undefined }
    }
  },
  {
    label: "ok, action, no description",
    item: { id: "ok-action", tone: "ok", title: "Uploaded 2 secrets", action: share }
  },
  {
    label: "long title",
    item: {
      id: "long",
      tone: "ok",
      title: "Uploaded 2 secrets into Development, Staging, Production and Preview"
    }
  },
  {
    label: "upload",
    item: {
      id: "upload",
      tone: "ok",
      title: "Uploaded 2 secrets into Development, Staging, Production",
      description: "6 secrets created.",
      action: share
    }
  },
  { label: "loading", item: { id: "loading", tone: "loading", title: "Checking provider" } }
];

const Case = ({ item }: { item: ToastItem }) => {
  const [open, setOpen] = useState(true);
  if (!open)
    return (
      <Button variant="outline" onClick={() => setOpen(true)}>
        Show again
      </Button>
    );
  return <ToastStack inline items={[{ ...item, duration: 0 }]} onDismiss={() => setOpen(false)} />;
};

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))] items-start gap-x-6 gap-y-8">
      {cases.map(({ label, item }) => (
        <figure key={label} className="m-0 flex w-full min-w-0 flex-col gap-3">
          <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
            <Case item={item} />
          </div>
          <figcaption className="text-muted-foreground text-xs">{label}</figcaption>
        </figure>
      ))}
    </div>
  );
}
```

### Trigger success and error notifications

Save this example at `src/pages/design-system/examples/toast/parts.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @cipher/button, @cipher/sonner. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import * as UI from "../../../../components/v4/ui/sonner";
import { toast } from "../../../../components/v4/ui/sonner";

export default function Example() {
  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <UI.Toaster />
        <Button
          onClick={() =>
            toast.success("Changes saved", {
              description: "New versions are available to clients."
            })
          }
        >
          Show success toast
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast.error("Connection failed", { description: "Reconnect before retrying." })
          }
        >
          Show failure
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast.warning("Sync paused", {
              description:
                "Vercel rejected the last three pushes. Secrets stay on the previous version until you reconnect the integration and retry the sync."
            })
          }
        >
          Show warning
        </Button>
        <Button variant="outline" onClick={() => toast.info("Version available")}>
          Show notice
        </Button>
        <Button
          variant="outline"
          onClick={() =>
            toast.success("Secret deleted", {
              description: "DATABASE_URL was removed from Production.",
              action: { label: "Undo", onClick: () => toast.success("Secret restored") }
            })
          }
        >
          Show with action
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            const id = toast.loading("Checking provider");
            window.setTimeout(() => toast.success("Provider connected", { id }), 1800);
          }}
        >
          Show loading
        </Button>
      </div>
    </div>
  );
}
```

### Toast above an open sheet

Save this example at `src/pages/design-system/examples/toast/over-sheet.tsx`; its relative imports are generated for that exact path. States: default, success.

Registry items used: @cipher/button, @cipher/field, @cipher/input, @cipher/sheet, @cipher/sonner. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { Button } from "../../../../components/v4/ui/button";
import { Field } from "../../../../components/v4/ui/field";
import { Input } from "../../../../components/v4/ui/input";
import * as UI from "../../../../components/v4/ui/sheet";
import { toast } from "../../../../components/v4/ui/sonner";

export default function Example() {
  const [saved, setSaved] = useState("30");
  const [draft, setDraft] = useState(saved);
  return (
    <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
      <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
        <UI.Sheet>
          <UI.SheetTrigger asChild>
            <Button variant="outline">Edit rotation</Button>
          </UI.SheetTrigger>
          <UI.SheetContent>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                setSaved(draft);
                toast.success("Rotation schedule saved", {
                  description: `DATABASE_URL now rotates every ${draft} days.`
                });
              }}
            >
              <UI.SheetHeader>
                <UI.SheetTitle>Rotation schedule</UI.SheetTitle>
                <UI.SheetDescription>The sheet stays open after saving.</UI.SheetDescription>
              </UI.SheetHeader>
              <UI.SheetBody>
                <Field label="Interval in days">
                  <Input
                    required
                    inputMode="numeric"
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                </Field>
              </UI.SheetBody>
              <UI.SheetFooter>
                <Button type="submit" disabled={draft === saved}>
                  Save schedule
                </Button>
              </UI.SheetFooter>
            </form>
          </UI.SheetContent>
        </UI.Sheet>
      </div>
      <figcaption className="text-muted-foreground text-xs">{`Saved interval: ${saved} days`}</figcaption>
    </figure>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run dev; open /design-system#toast and verify the documented interaction.
