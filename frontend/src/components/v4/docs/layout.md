# Layout measures

Compose responsive layouts with source spacing tokens and shared width measures.

## Choose this component

Choose Stack, Inline and Grid for layout relationships, and Measure for content width. Use one page measure and narrower form measures within it.

## Usage rules

### layout-usage

Owner: layout.

When an action row outgrows the available width.

Do: Let Inline or an outer layout wrap while preserving each control's own dimensions.

Avoid: Nest multiple page measures or shrink every control to keep one desktop row.

Why: Layout should adapt the group without changing the control's interaction geometry.

Checked by: review only. Look for: Constrain a page/form measure and wrap its action row. Controls keep usable dimensions and one page measure contains the intended content without redundant nested constraints.

Source evidence:
- src/components/v4/ui/layout.tsx
- src/pages/design-system/examples/layout/default.tsx

### layout-relationship-and-measure

Owner: layout.

When components need shared spacing without changing their internal design.

Do: Use Stack, Inline and Grid for sibling relationships, choose a supported gap and use one page Measure with narrower form or prose measures where needed.

Avoid: Add type or padding classes to a component to compensate for a missing recipe, nest page measures or disable wrapping merely to preserve a screenshot.

Why: Layout wrappers own relationships; component internals and readable width need one effective owner each.

Checked by: review only. Look for: Resize a related control cluster and enlarge text. Wrapping preserves order, the content measure is deliberate and no child needs local styling to align with its peers.

Source evidence:
- src/components/v4/ui/layout.tsx
- src/pages/design-system/examples/layout/default.tsx

## State guidance

- narrow: Keep form and prose measure within the viewport.
- dense: Choose a smaller gap deliberately without collapsing unrelated action groups.

## Presentation rules

Do: Use spacing to express actual grouping.

Avoid: Add an empty Card around every Stack or force equal heights on unrelated content.

Why: Layout primitives should reduce containers and clarify relationships.

## Import and exports

- src/components/v4/ui/layout.tsx
- src/components/v4/ui/text.module.css

Exports: Stack, Inline, Grid, Container, Measure, PageMeasure, FormMeasure. Source TypeScript defines the API.

## Behavior

- Stack and Inline use source spacing tokens, alignment and wrapping; Inline wraps by default.
- Grid automatically preserves the tile-width floor and drops columns in narrow containers. Explicit columns use equal flexible tracks.
- Container centers the page width; Measure constrains prose, forms or page content.

## Accessibility

- Caller owns semantic main, section and form elements.

## Use cases

- Use supported spacing and width roles to relate siblings. Choose one page measure and narrower inner form or prose measures where useful.

## Limits

- Do not nest page measures; use one per page content area.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### Measure.size

- page: example `default`, visible label "page".
- form: example `default`, visible label "form".
- prose: example `default`, visible label "prose".

### Grid columns

- 3: example `default`, visible label "3 columns".
- auto-fit: example `default`, visible label "auto-fit".
- 2: omitted. Explicit counts use the same equal tracks as 3 columns.
- 4: omitted. Explicit counts use the same equal tracks as 3 columns.

### gap tokens

- 8: example `default`, visible label "Stack".
- 0: omitted. The Spacing page shows the whole gap scale; one gap demonstrates the prop.
- 4: omitted. The Spacing page shows the whole gap scale; one gap demonstrates the prop.
- 12: omitted. The Spacing page shows the whole gap scale; one gap demonstrates the prop.
- 16: omitted. The Spacing page shows the whole gap scale; one gap demonstrates the prop.
- 24: omitted. The Spacing page shows the whole gap scale; one gap demonstrates the prop.
- 32: omitted. The Spacing page shows the whole gap scale; one gap demonstrates the prop.
- 48: omitted. The Spacing page shows the whole gap scale; one gap demonstrates the prop.

### alignment


- start: omitted. Alignment maps directly to CSS align-items; the examples keep the default.
- center: omitted. Alignment maps directly to CSS align-items; the examples keep the default.
- end: omitted. Alignment maps directly to CSS align-items; the examples keep the default.
- stretch: omitted. Alignment maps directly to CSS align-items; the examples keep the default.

### justification


- start: omitted. Justification maps directly to CSS justify-content; the examples keep the default.
- center: omitted. Justification maps directly to CSS justify-content; the examples keep the default.
- end: omitted. Justification maps directly to CSS justify-content; the examples keep the default.
- between: omitted. Justification maps directly to CSS justify-content; the examples keep the default.

### wrap

- true: example `default`, visible label "Inline, wraps when the row runs out of room".
- false: omitted. Turning wrap off only removes the wrapping shown here.

## Executable examples

### Stack, Inline, Grid and measures

Save this example at `src/pages/design-system/examples/layout/default.tsx`; its relative imports are generated for that exact path. States: default, overflow.

Registry items used: @infisical/button, @infisical/layout. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import { Container, Grid, Inline, Measure, Stack } from "../../../../components/v4/ui/layout";
const tile = "bg-muted px-3 py-2 text-center";
export default function Example() {
    return (<Container>
      <div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
        <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
          <Stack gap={8}>
            <span className={tile}>Secrets</span>
            <span className={tile}>Identities</span>
            <span className={tile}>Certificates</span>
          </Stack>
        </div><figcaption className="text-muted-foreground text-xs">{"Stack"}</figcaption></figure>
        <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
          <Inline gap={8}>
            <Button variant="outline">Form guide</Button>
            <Button variant="outline">Input guide</Button>
            <Button variant="outline">Typography</Button>
          </Inline>
        </div><figcaption className="text-muted-foreground text-xs">{"Inline, wraps when the row runs out of room"}</figcaption></figure>
        <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
          <Grid columns={3} gap={8}>
            <span className={tile}>Secrets</span>
            <span className={tile}>Identities</span>
            <span className={tile}>Certificates</span>
          </Grid>
        </div><figcaption className="text-muted-foreground text-xs">{"3 columns"}</figcaption></figure>
        <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
          <Grid gap={8}>
            <span className={tile}>Secrets</span>
            <span className={tile}>Identities</span>
            <span className={tile}>Certificates</span>
          </Grid>
        </div><figcaption className="text-muted-foreground text-xs">{"auto-fit"}</figcaption></figure>
        {(["page", "form", "prose"] as const).map((size) => (<figure key={size} className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
            <div className="border border-dashed border-border">
              <Measure size={size}>
                <span className={`${tile} block`}>Content stops at the {size} measure</span>
              </Measure>
            </div>
          </div><figcaption className="text-muted-foreground text-xs">{size}</figcaption></figure>))}
      </div>
    </Container>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#layout and exercise the documented interaction.
