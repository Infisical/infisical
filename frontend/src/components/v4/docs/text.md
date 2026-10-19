# Text

Use shared body and supporting-text measures.

## Choose this component

Choose Text and Meta for shared body and supporting styles, and Heading for actual section hierarchy. Use Code for machine literals.

## Usage rules

### text-usage

Owner: text.

When a section title needs a smaller visual size than the page title.

Do: Choose a semantic heading level from the document hierarchy and a visual size from its role.

Avoid: Use a styled div as a heading or choose h3 only because its default text looks smaller.

Why: Structure and visual scale solve different problems.

Checked by: review only. Look for: Read section headings and supporting facts in document order. Semantic heading levels express hierarchy while visual sizes/weights express emphasis without turning every line into a heading.

Source evidence:
- src/components/v4/ui/text.tsx
- src/pages/design-system/examples/text/default.tsx

### text-complete-type-role

Owner: text.

When several components express the same title or supporting-text role.

Do: Use Heading for hierarchy and its supported visual size, Text or SmallText for prose and Meta for secondary facts; reserve mono for exact technical content.

Avoid: Patch font size, line height and weight separately in each caller or let a border variant turn a section title into uppercase metadata.

Why: A type role needs consistent measurements and meaning across components, independent of framing.

Checked by: review only. Look for: Compare equivalent titles and secondary facts in related components. Rank, line height, weight and family agree by role while technical values remain exact.

Source evidence:
- src/components/v4/ui/text.tsx
- src/pages/design-system/examples/text/default.tsx

## State guidance

- supporting: Keep Meta legible and reserve it for secondary facts.
- long-content: Use readable measure and allow wrapping rather than truncating instructions.

## Presentation rules

Do: Use monospace for identifiers, commands and machine values. Keep labels and explanations in the interface family, with emphasis only where meaning changes.

Avoid: Set every label, sentence and supporting line in monospace, bold or uppercase.

Why: Technical values benefit from a fixed measure; ordinary prose needs a readable hierarchy.

## Import and exports

- src/components/v4/ui/text.tsx
- src/components/v4/ui/text.module.css

Exports: Text, SmallText, Heading, Meta. Source TypeScript defines the API.

## Behavior

- Body uses the complete 14/20 role; supporting copy uses 13/18. Each role owns font family, weight and tracking as well as size and line height.
- Muted text uses the semantic muted role.
- Heading separates semantic level from visual size. page uses 28/32, explicit display uses 44/44, and section/subsection use the shared section role. Meta uses the 12/16 metadata role with optional monospace.
- Native attributes and refs are preserved.

## Accessibility

- Text and SmallText render paragraphs; Heading renders the requested h1-h6 level; Meta renders a span.

## Use cases

- Use Text, SmallText, Heading and Meta for their content roles. Choose semantic heading level separately from page, display, section or subsection size.

## Limits

- Do not use a visually styled paragraph in place of a semantic section heading.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### Heading.size

- display: example `default`, visible label "display".
- page: example `default`, visible label "page".
- section: example `default`, visible label "section".
- subsection: example `default`, visible label "subsection".

### Heading level


- 1: omitted. Level sets the document outline and the tag, not the look. The workbench owns the page h1, and size is shown above.
- 2: omitted. Level sets the document outline and the tag, not the look. The workbench owns the page h1, and size is shown above.
- 3: omitted. Level sets the document outline and the tag, not the look. The workbench owns the page h1, and size is shown above.
- 4: omitted. Level sets the document outline and the tag, not the look. The workbench owns the page h1, and size is shown above.
- 5: omitted. Level sets the document outline and the tag, not the look. The workbench owns the page h1, and size is shown above.
- 6: omitted. Level sets the document outline and the tag, not the look. The workbench owns the page h1, and size is shown above.

### body roles

- Text: example `default`, visible label "Text".
- SmallText: example `default`, visible label "SmallText".
- Meta mono: example `default`, visible label "Meta, mono".
- Meta plain: example `default`, visible label "Meta, plain".

## Executable examples

### Heading roles and body text

Save this example at `src/pages/design-system/examples/text/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/text. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Heading, Meta, SmallText, Text } from "../../../../components/v4/ui/text";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      {(["display", "page", "section", "subsection"] as const).map((size) => (<figure key={size} className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
          <Heading level={3} size={size}>
            Credential rotation
          </Heading>
        </div><figcaption className="text-muted-foreground text-xs">{size}</figcaption></figure>))}
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        <Text>Rotate credentials before the current version expires.</Text>
      </div><figcaption className="text-muted-foreground text-xs">{"Text"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        <SmallText>Changes apply to new credentials.</SmallText>
      </div><figcaption className="text-muted-foreground text-xs">{"SmallText"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        <Meta>2026-09-14 10:00 UTC</Meta>
      </div><figcaption className="text-muted-foreground text-xs">{"Meta, mono"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        <Meta mono={false}>Updated 2 hours ago</Meta>
      </div><figcaption className="text-muted-foreground text-xs">{"Meta, plain"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#text and exercise the documented interaction.
