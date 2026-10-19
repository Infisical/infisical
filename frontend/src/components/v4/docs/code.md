# Code

Display literal machine text inline or in a scrollable block.

## Choose this component

Choose Code for literal machine text inline or in a scrollable block. Use Text for prose, Json for structured inspection and Textarea for editing.

## Usage rules

### code-usage

Owner: code.

When the source can contain credentials or sensitive values.

Do: Redact before passing the string to Code and choose a language only when it matches the literal source.

Avoid: Pass secrets and rely on syntax styling to conceal them, or reformat literal output as prose.

Why: Code renders the provided text; highlighting is neither redaction nor an editing model.

Checked by: review only. Look for: Render and copy a synthetic literal containing whitespace and quotes; its exact source is preserved, and redaction happened before Code received sensitive values.

Source evidence:
- src/components/v4/ui/code.tsx
- src/pages/design-system/examples/code/default.tsx

## State guidance

- unknown-language: Allow plain text rather than claiming unsupported syntax semantics.
- long-line: Preserve exact characters and allow scrolling instead of inserting misleading line breaks.

## Presentation rules

Do: Use highlighting to make real syntax easier to scan.

Avoid: Invent colored pseudo-code as decorative filler in a settings page.

Why: Machine-looking decoration can be mistaken for an executable instruction.

## Import and exports

- src/components/v4/ui/code.tsx
- src/components/v4/ui/code-tokenizer.ts
- src/components/v4/ui/code.module.css

Exports: Code. Source TypeScript defines the API.

## Behavior

- In block mode, maxLines follows computed line height and the shared body inset, so text enlargement preserves the requested visible-line bound.
- Inline styling and block mode with wrapping, line numbers and highlighted lines.
- All input renders as text; no HTML interpretation.

## Accessibility

- Scrollable blocks are keyboard focusable named regions.
- Line numbers are excluded from the accessibility tree.

## Use cases

- Pass the original safe source, choose inline or block deliberately and use format=plain when highlighting adds no meaning.

## Avoid

- Reformat a copied command, include secrets before redaction or add syntax colors to ordinary explanatory prose.

## Limits

- Lexical highlighting supports shell, env, JSON, YAML, JavaScript, TypeScript, Python and HCL aliases; unknown languages use plain text.
- Apply redaction before passing sensitive text.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### format

- syntax: example `variants`, visible label "shell".
- plain: example `variants`, visible label "Plain".

### syntax family

- shell: example `variants`, visible label "shell".
- env: example `variants`, visible label "env".
- json: example `variants`, visible label "json".
- yaml: example `variants`, visible label "yaml".
- javascript: example `variants`, visible label "javascript".
- typescript: example `variants`, visible label "typescript".
- python: example `variants`, visible label "python".
- hcl: example `variants`, visible label "hcl".
- fallback: example `variants`, visible label "unknown-language".

### layout

- inline: example `default`, visible label "INFISICAL_ENV".
- block: example `variants`, visible label "Plain".
- line numbers: example `variants`, visible label "Wrapped and bounded".
- highlight: example `variants`, visible label "Wrapped and bounded".
- wrap: example `variants`, visible label "Wrapped and bounded".
- bounded: example `variants`, visible label "Wrapped and bounded".

### size support


- no authored named size: omitted. This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API.

## Executable examples

### Literal keys and numbered shell commands

Save this example at `src/pages/design-system/examples/code/default.tsx`; its relative imports are generated for that exact path. States: default, overflow.

Registry items used: @infisical/code. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Code } from "../../../../components/v4/ui/code";
export default function Example() {
    return (<div className="flex min-w-0 w-full flex-col items-start gap-6">
      <p>
        Set <Code>INFISICAL_ENV</Code> in your environment.
      </p>
      <Code block language="shell" lineNumbers highlight={[2]} code={"infisical login\ninfisical run -- npm start"}/>
    </div>);
}
```

### Formats and lexical families

Save this example at `src/pages/design-system/examples/code/variants.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/code. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Code } from "../../../../components/v4/ui/code";
const samples = [
    ["shell", "export INFISICAL_ENV='staging'"],
    ["env", "INFISICAL_ENV=staging"],
    ["json", '{"enabled":true,"count":9007199254740993}'],
    ["yaml", "enabled: true"],
    ["javascript", 'const environment = "staging";'],
    ["typescript", 'const environment: string = "staging";'],
    ["python", 'environment = "staging"'],
    ["hcl", 'environment = "staging"'],
    ["unknown-language", "  exact unchanged text  "]
] as const;
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        <Code block format="plain" code={'  "staging"\t9007199254740993\n'}/>
      </div><figcaption className="text-muted-foreground text-xs">{"Plain"}</figcaption></figure>
      {samples.map(([language, code]) => (<figure key={language} className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
          <Code block language={language} code={code}/>
        </div><figcaption className="text-muted-foreground text-xs">{language}</figcaption></figure>))}
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        <Code block wrap maxLines={3} lineNumbers highlight={[2]} code={Array.from({ length: 8 }, (_, index) => `Version ${index + 1}: applications/staging/services/payment-processing/configuration`).join("\n")}/>
      </div><figcaption className="text-muted-foreground text-xs">{"Wrapped and bounded"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- runtime: npm test -- src/components/v4/ui/code-runtime.test.tsx
- browser: npm run ui:dev; open /design-system#code and exercise the documented interaction.
