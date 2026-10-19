# Code block

Frame code or redacted JSON with a label, actions and truthful copy feedback.

## Choose this component

Choose CodeBlock to frame inspectable code with a title and truthful copy feedback. Use Snippet for one command and Json for structured redaction.

## Usage rules

### code-block-usage

Owner: code-block.

When custom React content is displayed inside the code frame.

Do: Supply an explicit safe copyValue, or pass Json directly to share its redacted source.

Avoid: Assume nested arbitrary wrappers can be inspected for redaction or copy the original unredacted object.

Why: Rendered content and clipboard output must follow the same safety boundary.

Checked by: review only. Look for: Copy direct redacted Json and custom React content with safe copyValue. Clipboard output equals the safe displayed source, and failed writes never announce copied.

Source evidence:
- src/components/v4/ui/code-block.tsx
- src/pages/design-system/examples/code-block/default.tsx

### code-block-safe-copy-source

Owner: code-block.

When a framed technical specimen contains custom React children.

Do: Pass an explicit safe copyValue for custom children, or pass Json directly for automatic redacted copy, and keep one outcome region for copy feedback.

Avoid: Infer copy text from arbitrary rendered markup or let a Copied label squeeze out the filename or appear twice.

Why: The visible specimen and copied payload need an explicit safe relationship, while feedback must preserve resource identity.

Checked by: review only. Look for: Copy a long-labeled custom specimen, reject the write and retry. The exact safe payload is used, the label remains readable and success appears once after fulfillment.

Source evidence:
- src/components/v4/ui/code-block.tsx
- src/pages/design-system/examples/code-block/default.tsx

## State guidance

- copying: Await the clipboard write and show success only after fulfillment.
- copy-error: Keep the safe source available and report failure without claiming it was copied.

## Presentation rules

Do: Name the file or purpose in the frame header.

Avoid: Add a second toolbar and decorative filename to every one-line value.

Why: The frame should help inspect and copy actual source, not inflate a short string.

## Import and exports

- src/components/v4/ui/code-block.tsx
- src/components/v4/ui/code.module.css
- src/components/v4/ui/frame.module.css

Exports: CodeBlock. Source TypeScript defines the API.

## Behavior

- The block uses the shared framed shell: the mono label, icon, actions and Copy sit in the tint frame header, and the code sits in the inset raised surface.
- Copy uses literal source, excluding displayed line numbers.
- A direct Json child supplies its recursively redacted copy text. Custom React children receive the owned body inset and text role; do not duplicate that padding inside the child.

## Accessibility

- Copy success follows clipboard fulfillment; failures remain visible.
- The block is a section named by its label, and the code region takes the same label.
- Content uses a focusable scroll region.

## Use cases

- Frame multiline source with a useful resource label and one copy action. Give custom content an explicit safe copy source.

## Limits

- Custom React children require an explicit safe copyValue.
- Pass Json directly for automatic redacted JSON copy; wrappers are not inspected.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### content

- code string: example `default`, visible label "environment.env".
- Json: omitted. Json children render the JSON tree below the same header; the JSON page shows the tree and the code-block fixture test renders it.
- custom copyValue: omitted. Custom children sit in a body-text inset and copy the explicit value; the code-block fixture test renders it.
- custom no copy source: omitted. Without a copy source the copy button is disabled; the code-block fixture test renders it.

### copy state

- enabled: example `default`, visible label "Copy code".
- disabled: omitted. Copy is disabled only when there is no copy source; the code-block fixture test renders it.
- pending: omitted. Press Copy code to see it; content-behavior.test.tsx drives pending, failure and success.
- failed: omitted. Shown only when the clipboard write fails; content-behavior.test.tsx drives it.
- copied: omitted. Press Copy code to see it; content-behavior.test.tsx drives it.

### size support


- no authored named size: omitted. This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API.

## Executable examples

### Filename, terminal, line numbers and copy

Save this example at `src/pages/design-system/examples/code-block/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/code-block. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { CodeBlock } from "../../../../components/v4/ui/code-block";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,20rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <CodeBlock label="environment.env" icon="file" language="env" lineNumbers highlight={[2]} code={"INFISICAL_ENV=staging\nLOG_LEVEL=info\nAPI_URL=https://example.com/api"}/>
      </div><figcaption className="text-muted-foreground text-xs">{"File, framed shell"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <CodeBlock label="Terminal" icon="terminal" language="bash" wrap code="infisical run --env=staging -- npm run dev"/>
      </div><figcaption className="text-muted-foreground text-xs">{"Terminal command"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- runtime: npm test -- src/components/v4/ui/code-runtime.test.tsx
- browser: npm run ui:dev; open /design-system#code-block and exercise the documented interaction.
