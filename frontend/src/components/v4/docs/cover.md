# Cover

The brand cover: a display title and tagline beside a block composition drawn from the system's tokens.

## Choose this component

Choose Cover for brand surfaces. Use PageHeader for product pages.

## Usage rules

### cover-tokens

Owner: cover.

When the cover art changes.

Do: Draw blocks from color, radius and space tokens so theme and corner choices carry through.

Avoid: Hard-code colors or corner radii in the SVG.

Why: The cover is the system's own sample and must follow its settings.

Checked by: review only. Look for: Toggle the theme and check that every block follows it.

Source evidence:
- src/components/v4/ui/cover.tsx
- src/components/v4/ui/cover.module.css

## State guidance

- narrow: Type scales down with the container; the tagline keeps body size.

## Presentation rules

Do: Keep the tagline to one plain sentence.

Avoid: Stack slogans or badges over the art.

Why: The composition carries the brand by itself.

## Import and exports

- src/components/v4/ui/cover.tsx
- src/components/v4/ui/cover.module.css

Exports: Cover. Source TypeScript defines the API.

## Behavior

- The cover keeps a 960 by 288 ratio and scales its type with its own width.
- The art is an ink slab, an accent square and a control band with a grid of dots, all filled from color tokens and rounded with the corner tokens, so it follows theme and corner changes.

## Accessibility

- The art is decorative and hidden from assistive technology. The title is an h1.

## Use cases

- Use Cover at the top of a brand or documentation surface with a short title and one-line tagline.

## Avoid

- Use it as a product page header or add photos or gradients to the art.

## Limits

- For the workbench, docs and release surfaces only; product pages use PageHeader.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### size support


- no authored named size: omitted. The cover scales with its container at a fixed ratio.

## Executable examples

### Brand cover

Save this example at `src/pages/design-system/examples/cover/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/cover. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Cover } from "../../../../components/v4/ui/cover";
export default function Example() {
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
      <Cover title={<>
            Infisical
            <br />
            2.0
          </>} tagline="A quiet interface for secrets, certificates and access."/>
    </div><figcaption className="text-muted-foreground text-xs">{"Brand cover, scales with its container"}</figcaption></figure>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#cover and exercise the documented interaction.
