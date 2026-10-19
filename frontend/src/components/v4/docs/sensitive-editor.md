# Sensitive editor

Explicit reveal and replacement editing with host-owned access and persistence.

## Choose this component

Choose SensitiveEditor when a stored secret should be fetched only after explicit reveal. Use SecretInput only when the host already permits plaintext in memory.

## Usage rules

### sensitive-editor-usage

Owner: sensitive-editor.

When a person may replace a stored value without permission to reveal it.

Do: Keep stored identity separate from an empty replacement draft and let Save await the host callback.

Avoid: Fetch or prefill the stored value merely to open replacement mode.

Why: Editing a replacement does not require reading the existing secret.

Checked by: review only. Look for: Replace without reveal, reject a save, change stored revision and reject clipboard permission. No fetch occurs for replacement, the draft survives failure and old plaintext remasks.

Source evidence:
- src/components/v4/ui/sensitive-editor.tsx
- src/pages/design-system/examples/sensitive-editor/lifecycle.tsx

### sensitive-editor-capability-and-revision

Owner: sensitive-editor.

When a stored secret can be revealed, replaced or copied under changing permission.

Do: Keep stored id and revision current, offer only permitted callbacks and preserve replacement without retrieval; await actual clipboard and save promises.

Avoid: Pass stored plaintext just to draw a mask, reveal while starting replacement or promise clipboard expiry or reliable memory erasure.

Why: Masking is presentation, while retrieval, persistence and permission are host responsibilities with separate lifecycles.

Checked by: review only. Look for: Change revision during reveal, reject replacement and retry, then copy with a rejected writer. Stale plaintext does not reappear, the draft survives failure and success follows actual settlement.

Source evidence:
- src/components/v4/ui/sensitive-editor.tsx
- src/pages/design-system/examples/sensitive-editor/lifecycle.tsx

## State guidance

- revealed: Remask on Escape and on stored identity or value changes; let the host enforce permissions.
- save-error: Keep the replacement draft and error until retry or explicit cancellation.

## Presentation rules

Do: Distinguish the stored value from a replacement draft. Show pending work and keep rejection beside the retry action.

Avoid: Render a fake masked string as the editable value, announce a save before its promise resolves or claim masking is authorization.

Why: A mask is presentation; confusing it with actual data can overwrite or expose the wrong value.

## Import and exports

- src/components/v4/ui/sensitive-editor.tsx
- src/components/v4/ui/data.module.css

Exports: SensitiveEditor, SecretInput, CopyButton, StoredSecret. Source TypeScript defines the API.

## Behavior

- Stored identity and replacement draft are separate. Replacing never fetches the stored value. One-line sensitive hosts use 32px with 24px nested reveal/copy actions; multiline content may grow.
- Host reveal/save promises receive AbortSignal. Identity/revision change invalidates pending work and clears plaintext.
- Copy awaits the actual write before success notification. Failures preserve current draft and show recovery. CopyButton size sm/md/lg describes a 32/36/40px host and produces a 24/28/32px nested action, defaulting to sm. iconOnly defaults to false; icon-only actions retain their accessible label.

## Accessibility

- Every editor has a label and announced loading/result state.
- Escape cancels an unsaved edit and masks the value again. The editor keeps whitespace and normal keyboard editing.
- Neither the masked display nor its accessible name contains the stored value.

## Use cases

- Expose only the permitted reveal, replacement and copy capabilities, with stored identity separate from any replacement draft.

## Limits

- Masking does not grant or enforce authorization. Hosts decide permission and perform fetch/decryption/save.
- Read-only SecretInput already receives plaintext in memory. Use SensitiveEditor to defer retrieval until explicit reveal.
- Plaintext cannot be erased from browser memory reliably; remasking removes rendered/session references only.
- Copy writes to the system clipboard. The component cannot promise expiry or clearing.
- Keep stored identity and revision current. Capability changes remount the editor session and cancel pending work.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### CopyButton.size


- sm: omitted. Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "sm".
- md: omitted. Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "md".
- lg: omitted. Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "lg".

### capability


- empty: omitted. Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "Empty value".
- single-line: omitted. Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "Single-line value".
- read-only: omitted. Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "Read-only value".
- reveal-only: omitted. Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "Reveal only".
- edit-without-view: omitted. Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "Replace without view permission".
- neither: omitted. Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "No reveal or edit permission".
- copy-restricted: omitted. Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "Copy restricted".
- host-held-plaintext: omitted. Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "Host-held plaintext, read-only".

### behavior


- multiline: omitted. multiline starts the replacement box at three lines and keeps line breaks in the stored value; the buttons stay where they are.
- stale-revision: omitted. Stored revision and identity changes are security-sensitive host lifecycle cases verified by component tests; the Human preview shows reveal and replace.
- stale-identity: omitted. Stored revision and identity changes are security-sensitive host lifecycle cases verified by component tests; the Human preview shows reveal and replace.
- clipboard-promise: omitted. Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "Copy identifier".
- overlay-escape: omitted. Cut to keep the page to the essentials; the sensitive-editor fixture test renders it as "Open value".

## Executable examples

### Reveal and replace

Save this example at `src/pages/design-system/examples/sensitive-editor/lifecycle.tsx`; its relative imports are generated for that exact path. States: default, controlled, editing.

Registry items used: @infisical/sensitive-editor. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { SensitiveEditor } from "../../../../components/v4/ui/sensitive-editor";
export default function Example() {
    const [revision, setRevision] = useState(0);
    const [value, setValue] = useState("fabricated-example-only");
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
      <SensitiveEditor stored={{ id: "fictional-value", revision: String(revision), hasValue: true }} label="Protected example value" onReveal={async () => value} onSave={async (draft) => {
            setValue(draft);
            setRevision((current) => current + 1);
        }}/>
    </div><figcaption className="text-muted-foreground text-xs">{"Reveal and replace"}</figcaption></figure>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- runtime: npm test -- src/components/v4/ui/data-grid-model.test.ts src/components/v4/ui/specialist.test.tsx
- static: npm run type:check
- browser: Open the executable example and verify keyboard, narrow viewport, dark theme and failure recovery.
