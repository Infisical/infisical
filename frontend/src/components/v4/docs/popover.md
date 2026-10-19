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

## Accessibility

- Name the popover's purpose through a heading or aria-label. Focus moves in when it opens and back to the trigger when it closes. Choose modal behavior for the task.

## Use cases

- Keep an anchored optional task compact, named and reachable. Use Dialog when the task needs a larger focused workflow.

## Limits

- PopoverTitle is a heading, not an automatic dialog label association; connect its ID when the content requires that name.

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

Registry items used: @infisical/button, @infisical/input, @infisical/label, @infisical/popover. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import { Input } from "../../../../components/v4/ui/input";
import { Label } from "../../../../components/v4/ui/label";
import * as UI from "../../../../components/v4/ui/popover";
export default function Example() {
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
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
          <Input id="popover-host" defaultValue="vault.example.test"/>
        </UI.PopoverContent>
      </UI.Popover>
    </div>);
}
```

### Placements

Save this example at `src/pages/design-system/examples/popover/placements.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/popover. Additional packages: none. Install every listed item before compiling this example.

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
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      {placements.map(({ side, align }) => (<UI.Popover key={side}>
          <UI.PopoverTrigger asChild>
            <Button variant="outline">
              {side} / {align}
            </Button>
          </UI.PopoverTrigger>
          <UI.PopoverContent side={side} align={align} style={{ minWidth: 0, maxWidth: "var(--radix-popover-content-available-width)" }} aria-label="Staging connection preview">
            <p>Staging connection</p>
            <p>12 versions synchronized. Read access belongs to the Platform team.</p>
          </UI.PopoverContent>
        </UI.Popover>))}
    </div>);
}
```

### Anchored form and nested dialog

Save this example at `src/pages/design-system/examples/popover/behavior.tsx`; its relative imports are generated for that exact path. States: controlled, invalid, keyboard.

Registry items used: @infisical/button, @infisical/dialog, @infisical/field, @infisical/input, @infisical/popover. Additional packages: none. Install every listed item before compiling this example.

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
    return (<div className="flex flex-col gap-3">
      <UI.Popover open={open} onOpenChange={setOpen} modal>
        <UI.PopoverAnchor asChild>
          <p>Destination: {saved}</p>
        </UI.PopoverAnchor>
        <UI.PopoverTrigger asChild>
          <Button variant="outline">Edit destination</Button>
        </UI.PopoverTrigger>
        <UI.PopoverContent aria-label="Edit destination hostname">
          <UI.PopoverTitle>Destination hostname</UI.PopoverTitle>
          <form className="flex flex-col gap-3" onSubmit={(event) => {
            event.preventDefault();
            if (!draft.trim() || draft.includes(" ")) {
                setError("Enter a hostname without spaces.");
                return;
            }
            setSaved(draft);
            setError("");
            setOpen(false);
        }}>
            <Field label="Hostname" error={error || undefined}>
              <Input value={draft} onChange={(event) => setDraft(event.target.value)}/>
            </Field>
            <Button type="submit">Apply hostname</Button>
          </form>
        </UI.PopoverContent>
      </UI.Popover>
    </div>);
}
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        <HostnameForm />
      </div><figcaption className="text-muted-foreground text-xs">{"Anchored form"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
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
            <Dialog.DialogFooter showCloseButton/>
          </Dialog.DialogContent>
        </Dialog.Dialog>
      </div><figcaption className="text-muted-foreground text-xs">{"Inside a dialog"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#popover and verify the documented interaction.
