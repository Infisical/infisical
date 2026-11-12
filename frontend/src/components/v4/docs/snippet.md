# Snippet

Present a selectable command or machine value and copy its literal value.

## Choose this component

Choose Snippet for a literal command or machine value that can be copied, with maxLines when it spans or wraps onto several lines. Use CodeBlock for source with a header, syntax or line numbers and Input for editing.

## Usage rules

### snippet-usage

Owner: snippet.

When the command is copied into a terminal.

Do: Copy the exact provided string only after a real clipboard write and keep the command selectable.

Avoid: Add a shell prompt to the copied value or claim copying executed the command.

Why: Clipboard output must be ready to paste without inventing execution state.

Checked by: review only. Look for: Copy a command containing quotes and spaces. Clipboard output is the literal command without its decorative prompt, and feedback waits for a fulfilled write.

Source evidence:
- src/components/v4/ui/snippet.tsx
- src/pages/design-system/examples/snippet/default.tsx

### snippet-command-copy-and-density

Owner: snippet.

When a one-line command appears with a prompt and copy action.

Do: Keep value as the exact safe command, use prompt only for visual context and choose the supported sm or md host size without caller padding patches.

Avoid: Include the prompt in copied text, imply Copy runs the command or let its nested action make both advertised sizes identical.

Why: Command presentation, clipboard value and action geometry must agree without changing the command's meaning.

Checked by: review only. Look for: Compare sm and md with the same long command, then reject and retry copying. Sizes remain distinct, the prompt is excluded and copied bytes equal value exactly.

Source evidence:
- src/components/v4/ui/snippet.tsx
- src/pages/design-system/examples/snippet/default.tsx

## State guidance

- copy-error: Report failure and leave the literal command available for manual selection.
- long-command: Preserve the exact value while allowing horizontal inspection.

## Presentation rules

Do: Give a short label explaining where the command is used.

Avoid: Add a Copy button to prose that is not intended to be pasted.

Why: The action should have a clear destination and literal output.

## Import and exports

- src/components/v4/ui/snippet.tsx
- src/components/v4/ui/code.module.css

Exports: Snippet. Source TypeScript defines the API.

## Behavior

- The prompt is visual context and is never copied. Size defaults to sm32; explicit md is 36px, with nested copy actions at 24/28px.
- The read-only input supports selection; copy waits for clipboard fulfillment.
- maxLines shows the value on several lines in a read-only textarea: line breaks stay, long lines wrap anywhere, the field grows with its content up to that many lines and then scrolls. Where field-sizing is unsupported, the value's line count (capped at maxLines) still sets the starting height, and wrapped lines past it scroll. The copy action and prompt sit at the first line, and copy still copies the whole value, every line included. The value stays Geist Mono, so keep it to machine values (certificates, keys, records, commands); prose goes in Text.

## Accessibility

- Caller supplies an input label; the copy control is separately named.

## Use cases

- Use sm or md for a selectable one-line safe command. The optional prompt is context, and the optional copy action copies value only.
- Set maxLines for a machine value a person copies whole but should see on several lines, such as a certificate, a public key or a long DNS record.

## Limits

- Do not imply that copying executes the command or conceals sensitive arguments.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### size

- sm: example `states`, visible label "sm".
- md: example `states`, visible label "md".

### configuration

- prompt: example `states`, visible label "sm".
- no prompt: example `states`, visible label "No prompt, copy disabled".
- copy disabled: example `states`, visible label "No prompt, copy disabled".
- invalid: example `states`, visible label "Unavailable command".
- multi-line: example `multiline`, visible label "Line breaks, maxLines 4, scrolls".
- wrapped: example `multiline`, visible label "Long value wraps, maxLines 3".

### copy lifecycle

- pending: example `behavior`, visible label "Copying".
- failed: example `behavior`, visible label "Copy failed. Try again.".
- copied: example `behavior`, visible label "Command copied".

## Executable examples

### Copy a literal run command

Save this example at `src/pages/design-system/examples/snippet/default.tsx`; its relative imports are generated for that exact path. States: read-only.

Registry items used: @cipher/snippet. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Snippet } from "../../../../components/v4/ui/snippet";

export default function Example() {
  return (
    <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
      <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
        <Snippet label="Run with project secrets" value="infisical run -- npm start" prompt="$" />
      </div>
      <figcaption className="text-muted-foreground text-xs">{"Command"}</figcaption>
    </figure>
  );
}
```

### Sizes and field states

Save this example at `src/pages/design-system/examples/snippet/states.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @cipher/field, @cipher/snippet. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Field } from "../../../../components/v4/ui/field";
import { Snippet } from "../../../../components/v4/ui/snippet";

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      {(["sm", "md"] as const).map((size) => (
        <figure key={size} className="m-0 flex w-full min-w-0 flex-col gap-3">
          <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
            <Snippet
              label={`${size} command`}
              size={size}
              value="infisical run -- npm start"
              prompt="$"
            />
          </div>
          <figcaption className="text-muted-foreground text-xs">{size}</figcaption>
        </figure>
      ))}
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Snippet label="Managed environment" value="INFISICAL_ENV=staging" copyable={false} />
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"No prompt, copy disabled"}
        </figcaption>
      </figure>
      <Field label="Unavailable command" error="Choose a project before using this command.">
        <Snippet
          label="Unavailable command"
          value="infisical run --projectId=project_staging -- npm start"
          copyable={false}
        />
      </Field>
    </div>
  );
}
```

### Exact command copy

Save this example at `src/pages/design-system/examples/snippet/behavior.tsx`; its relative imports are generated for that exact path. States: default, loading, error, success.

Registry items used: @cipher/snippet. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { Snippet } from "../../../../components/v4/ui/snippet";

export default function Example() {
  const [copied, setCopied] = useState("");
  return (
    <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
      <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
        <Snippet
          label="Project scoped command"
          value='infisical run --projectId=project_staging --env=staging -- npm run start -- --name="  exact  "'
          onCopy={setCopied}
        />
        <p role="status" className="sr-only">
          {copied ? "Command copied" : ""}
        </p>
      </div>
      <figcaption className="text-muted-foreground text-xs">{"Exact command copy"}</figcaption>
    </figure>
  );
}
```

### Multi-line values

Save this example at `src/pages/design-system/examples/snippet/multiline.tsx`; its relative imports are generated for that exact path. States: default, overflow.

Registry items used: @cipher/snippet. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Snippet } from "../../../../components/v4/ui/snippet";

const certificate = [
  "-----BEGIN CERTIFICATE-----",
  "MIIDdzCCAl+gAwIBAgIEAgAAuTANBgkqhkiG9w0BAQUFADBaMQswCQYDVQQGEwJJ",
  "RTESMBAGA1UEChMJQmFsdGltb3JlMRMwEQYDVQQLEwpDeWJlclRydXN0MSIwIAYD",
  "VQQDExlCYWx0aW1vcmUgQ3liZXJUcnVzdCBSb290MB4XDTAwMDUxMjE4NDYwMFoX",
  "DTI1MDUxMjIzNTkwMFowWjELMAkGA1UEBhMCSUUxEjAQBgNVBAoTCUJhbHRpbW9y",
  "ZTETMBEGA1UECxMKQ3liZXJUcnVzdDEiMCAGA1UEAxMZQmFsdGltb3JlIEN5YmVy",
  "-----END CERTIFICATE-----"
].join("\n");

const record =
  "v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAx3N9q2Lr8vT0uJbW6yZcF4mQp1sHkE7aD5gR2nX9oVtY3iCwB8eUjK6lMzPqS0fA4hN1rG7dL2vT5yW9xK3bQ8mE6pJ0cZ1uH4nR7sD2gF5aY8tV3wB6iL9oP0qX2kM4jC7eN1rT5yU8hG3dF6sA9zQ2wE5rT8yU1iO4pL7kJ0hG3fD6sA9zX2cV5bN8mQ1wE4rT7yU0iO3pL6kJ9hG2fD5sA8zX1cV4bN7mQ0wE3rT6yU9iO2pL5kJ8hG1fD4sA7zX0cV3bN6mIDAQAB";

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Snippet
            label="CA certificate"
            copyLabel="Copy certificate"
            value={certificate}
            maxLines={4}
          />
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Line breaks, maxLines 4, scrolls"}
        </figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Snippet
            label="TXT record value"
            copyLabel="Copy record value"
            value={record}
            maxLines={3}
          />
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Long value wraps, maxLines 3"}
        </figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <Snippet
            label="Login and run"
            size="md"
            prompt="$"
            value={
              "infisical login --domain=https://eu.infisical.com\ninfisical run --env=staging -- npm start"
            }
            maxLines={4}
          />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"md with prompt"}</figcaption>
      </figure>
    </div>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- runtime: npm test -- src/components/v4/ui/code-runtime.test.tsx
- browser: npm run dev; open /design-system#snippet and exercise the documented interaction.
