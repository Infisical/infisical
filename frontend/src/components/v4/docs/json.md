# JSON

Inspect a JSON tree with recursive redaction before rendering.

## Choose this component

Choose Json for structured inspection and recursive redaction. Use Code for literal source and Input or Textarea for editing.

## Usage rules

### json-usage

Owner: json.

When a nested object can contain sensitive keys.

Do: Apply the redaction predicate recursively before rendering and copying, and pass only JSON-compatible values.

Avoid: Redact the visible tree while copying the original object or assume collapsed nodes are concealed secrets.

Why: Collapsed presentation is not a data boundary; clipboard content must use the same safe source.

Checked by: review only. Look for: Redact a sensitive key nested in objects and arrays, then copy from a bounded preview. Rendered and copied values use the same recursively safe source.

Source evidence:
- src/components/v4/ui/json.tsx
- src/pages/design-system/examples/json/default.tsx

### json-redaction-before-copy

Owner: json.

When structured inspection includes fields that must not be revealed.

Do: Use named-key or predicate redaction before rendering and copying, and distinguish bounded preview limits from the complete safe copy source.

Avoid: Assume collapsed nodes conceal secrets, copy the unredacted input or describe a truncated preview as the entire document.

Why: Collapsed or limited content can still be present in data; redaction must govern both visible and copied values.

Checked by: review only. Look for: Redact nested values, limit preview depth and copy. The copy contains the full safe document, never the hidden original, and invalid input with redaction requested stays fully redacted.

Source evidence:
- src/components/v4/ui/json.tsx
- src/pages/design-system/examples/json/default.tsx

## State guidance

- collapsed: Keep full safe source available for copy even when preview depth is bounded.
- invalid: Treat unparseable input as literal code, or fully redact it when redaction was requested.

## Presentation rules

Do: Use a bounded tree to expose actual structure.

Avoid: Expand enormous objects by default or decorate each primitive as a badge.

Why: Unbounded structure overwhelms inspection and makes important fields harder to find.

## Import and exports

- src/components/v4/ui/json.tsx
- src/components/v4/ui/json-model.ts
- src/components/v4/ui/code.module.css

Exports: Json, redactJson, prepareJson. Source TypeScript defines the API.

## Behavior

- maxLines follows computed line height and the shared body inset, so text enlargement preserves the requested visible-line bound.
- Objects and arrays expand independently with two levels initially open.
- Named-key or predicate redaction replaces values before rendering and copying.

## Accessibility

- Each node's toggle is a named button that announces whether the node is expanded.
- The tree is a named scroll region.

## Use cases

- Inspect JSON-compatible data with explicit recursive redaction. Preview limits and expansion govern reading, not safe copy completeness.

## Limits

- Only JSON-compatible values are supported. Preview depth and node counts are bounded; Copy retains the full safe source.
- Invalid JSON strings display as literal code; with requested redaction, unparseable input is fully redacted.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### shape


- maxLines: omitted. Cut to keep the page to the essentials; the json fixture test renders it as "Bounded JSON".
- null: omitted. Cut to keep the page to the essentials; the json fixture test renders it as "Scalar and null".
- scalar: omitted. Cut to keep the page to the essentials; the json fixture test renders it as "Scalar and null".
- empty array: omitted. Cut to keep the page to the essentials; the json fixture test renders it as "Empty collections".
- empty object: omitted. Cut to keep the page to the essentials; the json fixture test renders it as "Empty collections".
- collapsed: omitted. Cut to keep the page to the essentials; the json fixture test renders it as "Collapsed root".
- limited: omitted. Cut to keep the page to the essentials; the json fixture test renders it as "Preview limits".
- predicate redaction: omitted. Cut to keep the page to the essentials; the json fixture test renders it as "Predicate redaction".
- wrap: omitted. Cut to keep the page to the essentials; the json fixture test renders it as "Wrapped long value".

### safe exact copy


- complete safe copy: omitted. Wrap Json in CodeBlock to copy the complete redacted payload, as the code-block fixtures do; the json fixture test renders it.
- copy failure: omitted. Shown only when the clipboard write fails; content-behavior.test.tsx drives the same copy failure.

### size support


- no authored named size: omitted. This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API.

## Executable examples

### Nested audit data with recursive redaction

Save this example at `src/pages/design-system/examples/json/default.tsx`; its relative imports are generated for that exact path. States: default, overflow.

Registry items used: @infisical/json. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Json } from "../../../../components/v4/ui/json";

export default function Example() {
  return (
    <Json
      value={{
        project: "production",
        events: [{ action: "secret.read", actor: "build-agent" }],
        credentials: { apiKey: "sample-secret" }
      }}
      redact={["apiKey"]}
      label="Audit event"
    />
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- runtime: npm test -- src/components/v4/ui/code-runtime.test.tsx
- browser: npm run ui:dev; open /design-system#json and exercise the documented interaction.
