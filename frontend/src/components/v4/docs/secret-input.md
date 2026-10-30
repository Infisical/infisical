# Secret input

Type or paste a secret value that stays masked until the field is focused.

## Choose this component

Choose SecretInput to type or paste a secret value in a form. Use SecretValue to show a value the host already holds with reveal and copy, and SensitiveEditor when the stored value must be fetched only on explicit reveal.

## Usage rules

### secret-input-masked-editing

Owner: secret-input.

When a form collects a new secret value or edits one the person may view.

Do: Pass the real value and onChange; the field masks itself while unfocused and edits the real text when focused.

Avoid: Store HIDDEN_SECRET_VALUE in form state or port a v3 SecretInput to SecretValue, which cannot be edited.

Why: The mask is display only, so saving it would overwrite the secret with dots, and the old v4 name pointed at a read-only display.

Checked by: src/components/v4/ui/migration-traps.test.tsx. Renders a value with a zero-width space, checks the textarea shows the mask and the warning, then focuses it and checks the real value.

Source evidence:
- src/components/v4/ui/secret-input.tsx
- src/pages/design-system/examples/secret-input/default.tsx

## State guidance

- masked: Blur always masks a non-empty value; the warning stays visible.
- invalid: Pass invalid or let Field mark it, and keep the error message beside the field.

## Presentation rules

Do: Explain the invisible characters by type and code point in the warning.

Avoid: Strip the characters silently or reveal the value in the tooltip.

Why: A pasted no-break space or zero-width space breaks the secret where it is used, and the person decides whether it belongs.

## Import and exports

- src/components/v4/ui/secret-input.tsx
- src/components/v4/ui/secret-input.module.css
- src/components/v4/lib/invisible-characters.ts

Exports: SecretInput, SecretInputProps, HIDDEN_SECRET_VALUE. Source TypeScript defines the API.

## Behavior

- Controlled: value and onChange(value: string) own the text. While the textarea is not focused and the value is not empty it shows HIDDEN_SECRET_VALUE, the same 16-dot mask as v3; focus binds the real value for editing, selection and copy, and blur masks it again. The mask is never passed to onChange.
- It is a textarea, so pasted line breaks are kept. One-line by default at the 32px control height and grows with content up to seven lines, then scrolls. multiline starts it at three lines for certificates and JSON.
- When the value holds invisible characters (control, format, Unicode space, line and paragraph separators, found by Unicode category and ignoring emoji joiner sequences), a warning action sits in the trailing slot. Its tooltip lists each character type, count and code point without revealing the value, and it stays visible while the value is masked.
- Field wiring (id, aria-describedby, aria-invalid) comes from the surrounding Field. Without a label it falls back to the accessible name Secret value. invalid draws the invalid border.

## Accessibility

- Label it with Field or aria-label. The invisible character warning is named and linked to the textarea through aria-describedby, so screen readers hear it with the field.
- Masking is visual; a screen reader hears the mask until focus, then the value it is editing.

## Use cases

- Bind value and onChange to the form state and let focus reveal the value for editing. Keep the warning visible so pasted invisible characters are caught before save.

## Avoid

- Use the read-only SecretValue for an editable field or feed HIDDEN_SECRET_VALUE back into form state.

## Limits

- This is the editable field, matching v3 SecretInput. The read-only reveal and copy display that was called SecretInput in v4 is now SecretValue on the Sensitive editor page.
- Secret reference highlighting, the reference picker and Cmd-click navigation from v3 InfisicalSecretInput are not part of it; those belong to a later InfisicalSecretInput.
- No always-visible mode, per-character mask or edit-without-view selection yet. Characters are listed in the warning tooltip, not marked inline.
- Masking does not protect the value: the host already holds plaintext. Use SensitiveEditor when a stored value must not be fetched until an explicit reveal.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### state

- masked: example `default`, visible label "Masked until focused".
- empty: example `default`, visible label "Empty, with placeholder".
- multiline: example `default`, visible label "Multiline".
- invisible-characters: example `default`, visible label "Invisible characters warning".
- focused: omitted. Focus any field on the page to see the real value replace the mask.

## Executable examples

### Masked editing

Save this example at `src/pages/design-system/examples/secret-input/default.tsx`; its relative imports are generated for that exact path. States: default, controlled, empty, editing.

Registry items used: @infisical/field, @infisical/secret-input. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Field } from "../../../../components/v4/ui/field";
import { SecretInput } from "../../../../components/v4/ui/secret-input";
export default function Example() {
    const [token, setToken] = useState("fabricated-example-token-7f3a");
    const [certificate, setCertificate] = useState("-----BEGIN EXAMPLE-----\nnot-a-real-certificate\n-----END EXAMPLE-----");
    const [pasted, setPasted] = useState('API_URL= "https://example.com"​');
    const [empty, setEmpty] = useState("");
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Field label="Access token">
          <SecretInput value={token} onChange={setToken}/>
        </Field>
      </div><figcaption className="text-muted-foreground text-xs">{"Masked until focused"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Field label="Webhook secret">
          <SecretInput value={empty} onChange={setEmpty} placeholder="Paste a value"/>
        </Field>
      </div><figcaption className="text-muted-foreground text-xs">{"Empty, with placeholder"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Field label="Certificate">
          <SecretInput multiline value={certificate} onChange={setCertificate}/>
        </Field>
      </div><figcaption className="text-muted-foreground text-xs">{"Multiline"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Field label="Pasted value">
          <SecretInput value={pasted} onChange={setPasted}/>
        </Field>
      </div><figcaption className="text-muted-foreground text-xs">{"Invisible characters warning"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- runtime: npx vitest run src/components/v4/ui/migration-traps.test.tsx
- static: npm run type:check
- browser: Open /design-system#secret-input, focus and blur each field in both themes and hover the warning.
