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

### text-status-icon-words

Owner: text.

When a table cell or record fact reports a state such as locked out or never signed in.

Do: Use StatusText with a line icon and words that name the state, and derive the state only from data the product has. Pass loading for a state that is still in progress, such as Submitting or Retrying, instead of a static sync or clock icon.

Avoid: Show the state as a colored dot, a colored word or a brand mark alone, or invent a health score the API does not expose.

Why: Color alone fails for color-blind readers and in grayscale, and a synthetic signal tells people something the product cannot back.

Checked by: review only. Look for: View the cell in grayscale and with a screen reader. Each state reads from its words alone, and every state maps to a field the API returns.

Source evidence:
- src/components/v4/ui/text.tsx
- src/pages/design-system/examples/text/status.tsx

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

Exports: Text, SmallText, Heading, Meta, StatusText, Highlight. Source TypeScript defines the API.

## Behavior

- Body uses the complete 14/20 role; supporting copy uses 13/18. Each role owns font family, weight and tracking as well as size and line height.
- Muted text uses the semantic muted role.
- Heading separates semantic level from visual size. page uses 28/32, explicit display uses 44/44, and section/subsection use the shared section role. Meta uses the 12/16 metadata role with optional monospace.
- Native attributes and refs are preserved.
- StatusText reports a state as a required line icon plus words. It inherits the surrounding type role; neutral is muted and ok, warn and bad tint both the icon and the words, so the state still reads in grayscale.
- StatusText loading swaps the icon for the inline Spinner in the same icon box, for a state that is still in progress such as Submitting or Retrying; icon becomes optional when loading is true, so a status map can keep its icon and pass loading beside it. The Spinner animates like the one in Button and toasts and holds still under prefers-reduced-motion.
- Highlight renders text with every case-insensitive occurrence of query wrapped in a mark (data-slot highlight), filled with the accent and on-accent text, the search highlight in every theme. The query is literal text, never a pattern, so dots, brackets and other symbols match themselves. Overlapping matches merge into one mark. terms matches each whitespace-separated word on its own, for multi-word filters. An empty or blank query, or no match, returns the text unchanged. It is the one search highlight: Combobox options and CommandMenu items use it, and a search list in a page uses it instead of slicing strings by hand.

## Accessibility

- Text and SmallText render paragraphs; Heading renders the requested h1-h6 level; Meta renders a span.
- StatusText renders a span whose icon is hidden from assistive technology; its words carry the whole state, so they must make sense on their own. The loading Spinner is hidden too and adds no live region, so a table of loading rows stays quiet.
- Highlight uses the native mark element and adds no announcement; the surrounding text reads as usual.

## Use cases

- Use Text, SmallText, Heading and Meta for their content roles. Choose semantic heading level separately from page, display, section or subsection size.

## Limits

- Meta defaults to mono for short machine values and aligned numbers (IDs, versions, counts); pass mono={false} for a date, a label or a name (rule/mono-machine-values).
- Do not use a visually styled paragraph in place of a semantic section heading.
- StatusText has no dot, brand mark or icon-only form. Use Badge for a categorical label that needs a chip.

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

### StatusText.tone

- neutral: example `status`, visible label "neutral".
- ok: example `status`, visible label "ok".
- warn: example `status`, visible label "warn".
- bad: example `status`, visible label "bad".

### StatusText.loading

- false: example `status`, visible label "neutral".
- true: example `status`, visible label "loading".

## Executable examples

### Heading roles and body text

Save this example at `src/pages/design-system/examples/text/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @cipher/text. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Heading, Meta, SmallText, Text } from "../../../../components/v4/ui/text";

export default function Example() {
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      {(["display", "page", "section", "subsection"] as const).map((size) => (
        <figure key={size} className="m-0 flex w-full min-w-0 flex-col gap-3">
          <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
            <Heading level={3} size={size}>
              Credential rotation
            </Heading>
          </div>
          <figcaption className="text-muted-foreground text-xs">{size}</figcaption>
        </figure>
      ))}
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
          <Text>Rotate credentials before the current version expires.</Text>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Text"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
          <SmallText>Changes apply to new credentials.</SmallText>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"SmallText"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
          <Meta>2026-09-14 10:00 UTC</Meta>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Meta, mono"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
          <Meta mono={false}>Updated 2 hours ago</Meta>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"Meta, plain"}</figcaption>
      </figure>
    </div>
  );
}
```

### StatusText tones and loading

Save this example at `src/pages/design-system/examples/text/status.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @cipher/text. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { StatusText } from "../../../../components/v4/ui/text";

export default function Status() {
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))] items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <StatusText tone="ok" icon="check-c">
            Signed in
          </StatusText>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"ok"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <StatusText icon="info">Never signed in</StatusText>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"neutral"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <StatusText tone="warn" icon="alert">
            No auth method
          </StatusText>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"warn"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <StatusText tone="bad" icon="lock">
            Universal Auth locked out
          </StatusText>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"bad"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-stretch gap-3">
          <StatusText loading>Submitting</StatusText>
        </div>
        <figcaption className="text-muted-foreground text-xs">{"loading"}</figcaption>
      </figure>
    </div>
  );
}
```

### Search highlight

Save this example at `src/pages/design-system/examples/text/highlight.tsx`; its relative imports are generated for that exact path. States: default, controlled.

Registry items used: @cipher/input, @cipher/text. Additional packages: none. Install every listed item before compiling this example.

```tsx
import * as React from "react";

import { Input } from "../../../../components/v4/ui/input";
import { Highlight } from "../../../../components/v4/ui/text";

const variables = [
  "DATABASE_URL",
  "DATABASE_REPLICA_URL",
  "REDIS_URL",
  "SENTRY_DSN",
  "API_BASE_URL"
];

export default function Example() {
  const [query, setQuery] = React.useState("url");
  return (
    <div className="grid w-full min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))] items-start justify-items-center gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <div className="flex flex-col gap-2">
            <Input
              aria-label="Search environment variables"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            <ul className="flex flex-col gap-1 font-mono">
              {variables.map((name) => (
                <li key={name}>
                  <Highlight text={name} query={query} />
                </li>
              ))}
            </ul>
          </div>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Every match, case-insensitive"}
        </figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <p>
            <Highlight
              text="Rotate the database password before the replica restarts"
              query="database replica"
              terms
            />
          </p>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"terms: each word on its own"}
        </figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col items-center gap-3 text-center">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-center gap-3">
          <p className="font-mono">
            <Highlight text="api.v1.(beta) and apixv1" query="api.v1.(beta)" />
          </p>
        </div>
        <figcaption className="text-muted-foreground text-xs">
          {"Literal query, not a pattern"}
        </figcaption>
      </figure>
    </div>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- runtime: npm test -- src/components/v4/ui/status-text.test.tsx
- static: npm run type:check
- browser: npm run dev; open /design-system#text and exercise the documented interaction.
