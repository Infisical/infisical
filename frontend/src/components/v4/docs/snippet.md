# Snippet

Present a selectable one-line command and copy its literal value.

## Choose this component

Choose Snippet for a literal one-line command that can be copied. Use CodeBlock for multiline source and Input for editing.

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

## Accessibility

- Caller supplies an input label; the copy control is separately named.

## Use cases

- Use sm or md for a selectable one-line safe command. The optional prompt is context, and the optional copy action copies value only.

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

### copy lifecycle

- pending: example `behavior`, visible label "Copying".
- failed: example `behavior`, visible label "Copy failed. Try again.".
- copied: example `behavior`, visible label "Command copied".

## Executable examples

### Copy a literal run command

Save this example at `src/pages/design-system/examples/snippet/default.tsx`; its relative imports are generated for that exact path. States: read-only.

Registry items used: @infisical/snippet. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Snippet } from "../../../../components/v4/ui/snippet";
export default function Example() {
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
      <Snippet label="Run with project secrets" value="infisical run -- npm start" prompt="$"/>
    </div><figcaption className="text-muted-foreground text-xs">{"Command"}</figcaption></figure>);
}
```

### Sizes and field states

Save this example at `src/pages/design-system/examples/snippet/states.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/field, @infisical/snippet. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Field } from "../../../../components/v4/ui/field";
import { Snippet } from "../../../../components/v4/ui/snippet";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      {(["sm", "md"] as const).map((size) => (<figure key={size} className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
          <Snippet label={`${size} command`} size={size} value="infisical run -- npm start" prompt="$"/>
        </div><figcaption className="text-muted-foreground text-xs">{size}</figcaption></figure>))}
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Snippet label="Managed environment" value="INFISICAL_ENV=staging" copyable={false}/>
      </div><figcaption className="text-muted-foreground text-xs">{"No prompt, copy disabled"}</figcaption></figure>
      <Field label="Unavailable command" error="Choose a project before using this command.">
        <Snippet label="Unavailable command" value="infisical run --projectId=project_staging -- npm start" copyable={false}/>
      </Field>
    </div>);
}
```

### Exact command copy

Save this example at `src/pages/design-system/examples/snippet/behavior.tsx`; its relative imports are generated for that exact path. States: default, loading, error, success.

Registry items used: @infisical/snippet. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Snippet } from "../../../../components/v4/ui/snippet";
export default function Example() {
    const [copied, setCopied] = useState("");
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
      <Snippet label="Project scoped command" value='infisical run --projectId=project_staging --env=staging -- npm run start -- --name="  exact  "' onCopy={setCopied}/>
      <p role="status" className="sr-only">
        {copied ? "Command copied" : ""}
      </p>
    </div><figcaption className="text-muted-foreground text-xs">{"Exact command copy"}</figcaption></figure>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- runtime: npm test -- src/components/v4/ui/code-runtime.test.tsx
- browser: npm run ui:dev; open /design-system#snippet and exercise the documented interaction.
