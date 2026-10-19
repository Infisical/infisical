# Separator

Separate adjacent groups visually or semantically.

## Choose this component

Choose Separator to mark an actual boundary between adjacent groups. Use spacing for a mild visual pause and a heading when the groups need names.

## Usage rules

### separator-usage

Owner: separator.

When two action groups have different scopes.

Do: Use one separator at the boundary and retain labels that explain each group.

Avoid: Rely on a line alone to explain what changes between the groups.

Why: A separator communicates separation but does not name the relationship.

Checked by: review only. Look for: Remove the divider. Adjacent group labels still explain the task boundaries; reintroducing the line clarifies an actual boundary rather than decorating every row.

Source evidence:
- src/components/v4/ui/separator.tsx
- src/pages/design-system/examples/separator/default.tsx

## State guidance

- decorative: Keep a purely visual divider decorative.
- semantic: Use the intended orientation when the separation itself is meaningful.

## Presentation rules

Do: Place dividers at real boundaries.

Avoid: Draw borders between every sentence and every control.

Why: Repeated rules flatten hierarchy and make dense interfaces harder to scan.

## Import and exports

- src/components/v4/ui/separator.tsx

Exports: Separator. Source TypeScript defines the API.

## Behavior

- Separator supports soft, labeled and vertical boundaries. It separates content without adding a new card.

## Accessibility

- Decorative separators do not become landmarks or tab stops; keep meaningful section labels as text.

## Use cases

- Use a separator only where content groups change, choose decorative semantics when it conveys no structure and use a real heading for a named section.

## Avoid

- Put a line after every label, use a labeled separator as a disclosure or insert dot characters between unrelated facts.

## Limits

- A labeled separator adds visible grouping text; it is not a heading or disclosure trigger.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### orientation

- horizontal: example `default`, visible label "horizontal".
- vertical: example `default`, visible label "vertical".

### appearance

- standard: example `default`, visible label "horizontal".
- label center: example `default`, visible label "Or connect manually".
- soft: omitted. Soft only lightens the rule's color.
- label start: omitted. Start alignment moves the label to the leading edge of the same labeled rule.

### semantics


- semantic: omitted. Semantic and decorative rules look identical; the difference is the exposed role, covered in the accessibility notes.
- decorative: omitted. Semantic and decorative rules look identical; the difference is the exposed role, covered in the accessibility notes.

### size support


- no authored named size: omitted. This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API.

## Executable examples

### Plain, labeled and vertical content boundaries

Save this example at `src/pages/design-system/examples/separator/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/separator. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Separator } from "../../../../components/v4/ui/separator";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <p>Connection settings</p>
        <Separator />
        <p>Access settings</p>
      </div><figcaption className="text-muted-foreground text-xs">{"horizontal"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Separator label="or"/>
      </div><figcaption className="text-muted-foreground text-xs">{"labelled"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <div className="flex h-6 items-stretch gap-4">
          <span>Staging</span>
          <Separator orientation="vertical"/>
          <span>Production</span>
        </div>
      </div><figcaption className="text-muted-foreground text-xs">{"vertical"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#separator and verify the documented interaction.
