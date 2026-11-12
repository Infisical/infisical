# Popover

Show a small interactive panel anchored to its trigger.

## Choose this component

Choose Popover for a small contextual picker or form anchored to its trigger. Use Tooltip for a short explanation and Dialog for a longer focused task.

## Usage rules

### popover-usage

Owner: popover.

When an anchored form can be invalid or dirty.

Do: Keep the form compact, show field errors in the panel, and let the host decide whether dismissal discards a draft.

Avoid: Hide a long multistep task inside a transient panel that closes on outside interaction.

Why: The anchor helps context only while the task remains small and recoverable.

Checked by: review only. Look for: Open, validate and dismiss the contextual form with keyboard. Invalid values remain repairable and any unsaved dismissal follows an explicit host policy.

Source evidence:
- src/components/v4/ui/popover.tsx
- src/pages/design-system/examples/popover/default.tsx

### popover-local-context

Owner: popover.

When a small optional task belongs beside a trigger.

Do: Use Popover for local nonmodal content, name interactive content explicitly where needed and keep its actions within available viewport space.

Avoid: Use it for a long irreversible workflow or assume PopoverTitle automatically supplies an accessible dialog name.

Why: An anchored panel needs its own readable context and a deliberate name; a heading alone does not wire that relationship.

Checked by: review only. Look for: Open at each relevant viewport edge, use its controls and close with Escape. Content stays reachable and focus returns to the trigger without clipping the required actions.

Source evidence:
- src/components/v4/ui/popover.tsx
- src/pages/design-system/examples/popover/default.tsx

### popover-draggable

Owner: popover.

When an annotation popover (comment, tags, metadata) covers the row or values a person needs to read while editing it.

Do: Pass draggable on PopoverContent so the panel gets its Move handle, and keep the panel's own title and actions as children.

Avoid: Build a drag header inside the content, set a transform or position on PopoverContent, or keep a dragged position across opens.

Why: The content owns the offset, the clamp and the reset; a second header or transform fights popper and leaves keyboard users without the arrow-key move.

Checked by: src/components/v4/ui/popover-drag.test.tsx. Opens with focus on the first field, not the Move handle; then presses ArrowRight and Shift+ArrowDown on the handle and checks the content's translate grows by space-8 and space-48; closing and reopening drops the translate and focuses the field again.

Source evidence:
- src/components/v4/ui/popover.tsx
- src/pages/design-system/examples/popover/draggable.tsx

## State guidance

- opening: Move focus according to the task and retain the triggering object context.
- error: Keep failed input available for correction rather than closing the panel.

## Presentation rules

Do: Give the panel one specific purpose.

Avoid: Use a popover merely to add a second border around an already visible control.

Why: An extra interaction should reveal useful context or reduce real density.

## Import and exports

- src/components/v4/ui/popover.tsx

Exports: Popover, PopoverAnchor, PopoverContent, PopoverDescription, PopoverHeader, PopoverTitle, PopoverTrigger. Source TypeScript defines the API.

## Behavior

- Radix open/onOpenChange controls a trigger-anchored region with side/alignment placement. Content portals into V4Scope and honors descendant Escape ownership.
- Every v4 overlay (menu, submenu, popover, select, tooltip, hover card, dialog, sheet, alert dialog) shares one layer, z-50, in the V4Scope portal container. A nested overlay opens after its parent, so it mounts later in that container and paints above it; nothing stacks by a higher z-index.
- PopoverAnchor re-anchors on every open, so content placed against a custom anchor stays on it inside a Dialog or Sheet and under StrictMode, where the trigger can otherwise re-claim the anchor.
- With draggable, PopoverContent adds a Move handle as the panel's first row. Dragging it with the pointer (pointer capture, so the drag keeps going past the handle) offsets the panel by a transform on the content, on top of the position popper gives its wrapper, so popper keeps following the anchor and flipping or shifting it while the offset rides along. Every move, and every window resize, clamps the panel inside the viewport and the collision boundary, inset by collisionPadding. Closing and reopening returns the panel to its anchored position. Without draggable there is no handle and no transform.

## Accessibility

- Name the popover's purpose through a heading or aria-label. Focus moves in when it opens and back to the trigger when it closes. Choose modal behavior for the task.
- The drag handle is a button named Move, described by keyboard instructions. Opening skips it: unless the caller's onOpenAutoFocus prevents the default, focus goes to the first tabbable control after the handle, or to the content when there is none, so the form field gets focus as it would without draggable and Shift+Tab reaches the handle. While it has focus, the arrow keys move the panel by space-8 and Shift with an arrow by space-48, clamped like a pointer drag. Escape still closes the popover from the handle. The handle sits focus-clearance below the panel's top edge, so its focus outline is never clipped by the panel's scroll region.

## Use cases

- Keep an anchored optional task compact, named and reachable. Use Dialog when the task needs a larger focused workflow.

## Limits

- PopoverTitle is a heading, not an automatic dialog label association; connect its ID when the content requires that name.
- A dragged panel keeps its offset from the anchor, so scrolling moves it with the anchor; only resize re-clamps it. The offset assumes an unscaled portal container. The position is not remembered across opens.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### Side

- top: example `placements`, visible label "top / start".
- right: example `placements`, visible label "right / center".
- bottom: example `placements`, visible label "bottom / end".
- left: example `placements`, visible label "left / center".

### Alignment

- start: example `placements`, visible label "top / start".
- center: example `placements`, visible label "right / center".
- end: example `placements`, visible label "bottom / end".

## Executable examples

### Connection hostname

Save this example at `src/pages/design-system/examples/popover/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @cipher/button, @cipher/input, @cipher/label, @cipher/popover. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import { Input } from "../../../../components/v4/ui/input";
import { Label } from "../../../../components/v4/ui/label";
import * as UI from "../../../../components/v4/ui/popover";

export default function Example() {
  return (
    <div className="flex w-full min-w-0 flex-col items-start gap-6">
      <UI.Popover>
        <UI.PopoverTrigger asChild>
          <Button variant="outline">Connection settings</Button>
        </UI.PopoverTrigger>
        <UI.PopoverContent>
          <UI.PopoverHeader>
            <UI.PopoverTitle>Connection settings</UI.PopoverTitle>
            <UI.PopoverDescription>Choose the destination hostname.</UI.PopoverDescription>
          </UI.PopoverHeader>
          <Label htmlFor="popover-host">Hostname</Label>
          <Input id="popover-host" defaultValue="vault.example.test" />
        </UI.PopoverContent>
      </UI.Popover>
    </div>
  );
}
```

### Placements

Save this example at `src/pages/design-system/examples/popover/placements.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @cipher/button, @cipher/popover. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import * as UI from "../../../../components/v4/ui/popover";

const placements = [
  { side: "top", align: "start" },
  { side: "right", align: "center" },
  { side: "bottom", align: "end" },
  { side: "left", align: "center" }
] as const;
export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] items-start justify-items-center gap-x-6 gap-y-8">
      {placements.map(({ side, align }) => (
        <UI.Popover key={side}>
          <UI.PopoverTrigger asChild>
            <Button variant="outline">
              {side} / {align}
            </Button>
          </UI.PopoverTrigger>
          <UI.PopoverContent
            side={side}
            align={align}
            style={{ minWidth: 0, maxWidth: "var(--radix-popover-content-available-width)" }}
            aria-label="Staging connection preview"
          >
            <p>Staging connection</p>
            <p>12 versions synchronized. Read access belongs to the Platform team.</p>
          </UI.PopoverContent>
        </UI.Popover>
      ))}
    </div>
  );
}
```

### Anchored form and nested dialog

Save this example at `src/pages/design-system/examples/popover/behavior.tsx`; its relative imports are generated for that exact path. States: controlled, invalid, keyboard.

Registry items used: @cipher/button, @cipher/dialog, @cipher/field, @cipher/input, @cipher/popover. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { Button } from "../../../../components/v4/ui/button";
import * as Dialog from "../../../../components/v4/ui/dialog";
import { Field } from "../../../../components/v4/ui/field";
import { Input } from "../../../../components/v4/ui/input";
import * as UI from "../../../../components/v4/ui/popover";

function HostnameForm() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState("vault.example.test");
  const [draft, setDraft] = useState(saved);
  const [error, setError] = useState("");
  return (
    <div className="flex flex-col gap-3">
      <UI.Popover open={open} onOpenChange={setOpen} modal>
        <UI.PopoverAnchor asChild>
          <p>Destination: {saved}</p>
        </UI.PopoverAnchor>
        <UI.PopoverTrigger asChild>
          <Button variant="outline">Edit destination</Button>
        </UI.PopoverTrigger>
        <UI.PopoverContent aria-label="Edit destination hostname">
          <UI.PopoverTitle>Destination hostname</UI.PopoverTitle>
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              if (!draft.trim() || draft.includes(" ")) {
                setError("Enter a hostname without spaces.");
                return;
              }
              setSaved(draft);
              setError("");
              setOpen(false);
            }}
          >
            <Field label="Hostname" error={error || undefined}>
              <Input value={draft} onChange={(event) => setDraft(event.target.value)} />
            </Field>
            <Button type="submit">Apply hostname</Button>
          </form>
        </UI.PopoverContent>
      </UI.Popover>
    </div>
  );
}
export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
          <HostnameForm />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Anchored form"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
          <Dialog.Dialog>
            <Dialog.DialogTrigger asChild>
              <Button variant="outline">Edit connection</Button>
            </Dialog.DialogTrigger>
            <Dialog.DialogContent>
              <Dialog.DialogHeader>
                <Dialog.DialogTitle>Connection editor</Dialog.DialogTitle>
                <Dialog.DialogDescription>
                  Changes apply to this local connection only.
                </Dialog.DialogDescription>
              </Dialog.DialogHeader>
              <HostnameForm />
              <Dialog.DialogFooter showCloseButton />
            </Dialog.DialogContent>
          </Dialog.Dialog>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Inside a dialog"}</figcaption>
      </figure>
    </div>
  );
}
```

### Draggable annotation

Save this example at `src/pages/design-system/examples/popover/draggable.tsx`; its relative imports are generated for that exact path. States: controlled, keyboard.

Registry items used: @cipher/button, @cipher/field, @cipher/popover, @cipher/textarea. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { Button } from "../../../../components/v4/ui/button";
import { Field } from "../../../../components/v4/ui/field";
import * as UI from "../../../../components/v4/ui/popover";
import { Textarea } from "../../../../components/v4/ui/textarea";

function CommentPopover() {
  const [open, setOpen] = useState(false);
  const [saved, setSaved] = useState("");
  const [draft, setDraft] = useState(saved);
  return (
    <div className="flex flex-col gap-3">
      <p>Comment on STRIPE_WEBHOOK_SIGNING_SECRET: {saved || "none"}</p>
      <UI.Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) setDraft(saved);
        }}
      >
        <UI.PopoverTrigger asChild>
          <Button variant="outline">{saved ? "Edit comment" : "Add comment"}</Button>
        </UI.PopoverTrigger>
        <UI.PopoverContent draggable align="start" aria-label="Comment">
          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              setSaved(draft.trim());
              setOpen(false);
            }}
          >
            <Field label="Comment">
              <Textarea
                value={draft}
                placeholder="Add a comment..."
                onChange={(event) => setDraft(event.target.value)}
              />
            </Field>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" size="xs" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" size="xs" disabled={draft.trim() === saved}>
                Save comment
              </Button>
            </div>
          </form>
        </UI.PopoverContent>
      </UI.Popover>
    </div>
  );
}

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
          <CommentPopover />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Draggable comment"}</figcaption>
      </figure>
    </div>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run dev; open /design-system#popover and verify the documented interaction.
