# Icon

Render the 52 owned product glyphs as safe SVG geometry.

## Choose this component

Choose Icon for an owned product glyph and Avatar for a person. Use visible text when the meaning is unfamiliar or consequential.

## Usage rules

### icon-usage

Owner: icon.

When an icon is the only visible content of a button.

Do: Name the button with its action and keep the glyph decorative inside that named control.

Avoid: Treat a raw SVG glyph as a complete action or rely on its shape to explain a destructive consequence.

Why: Geometry alone does not provide a reliable action name.

Checked by: review only. Look for: Inspect each icon-only action without seeing its glyph. The action still has a purpose-specific accessible name, and decorative glyphs do not add duplicate names.

Source evidence:
- src/components/v4/ui/icon.tsx
- src/pages/design-system/examples/icon/default.tsx

## State guidance

- decorative: Hide the glyph from assistive output when nearby text already names it.
- standalone: Name the meaning through the component or its containing control.

## Presentation rules

Do: Use a glyph when it improves scanning or recognition.

Avoid: Add an icon to every label and every metadata value.

Why: Repeated symbols increase visual density without adding distinctions.

## Import and exports

- src/components/v4/ui/icon.tsx
- src/components/v4/ui/icon-data.ts

Exports: Icon, iconNames. Source TypeScript defines the API.

## Behavior

- Names are a TypeScript union derived from the immutable owned shape map.
- Size and stroke width preserve the shared 24-unit geometry.

## Accessibility

- Icons are decorative by default. With label, the icon is announced as an image with that name.

## Use cases

- Choose an existing IconName, keep decorative glyphs unnamed beside visible text and name the action itself when it has no text.

## Avoid

- Invent a new glyph for ordinary status, label both icon and button with duplicate names or use an unfamiliar symbol for a destructive action alone.

## Limits

- Do not rely on an unlabeled glyph to explain an icon-only action or a status.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### representative numeric size

- 12: example `sizes`, visible label "12px".
- 16: example `sizes`, visible label "16px".
- 20: example `sizes`, visible label "20px".
- 24: example `sizes`, visible label "24px".

### name and semantics

- all owned names: example `default`, visible label "search".
- decorative: example `sizes`, visible label "12px".
- named: example `sizes`, visible label "Named image".
- action: example `sizes`, visible label "Action icon".

## Executable examples

### Owned glyphs with visible names

Save this example at `src/pages/design-system/examples/icon/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/icon. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Icon, iconNames } from "../../../../components/v4/ui/icon";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      {iconNames.map((name) => (<span key={name} className="flex min-w-0 flex-col items-center gap-2 text-center text-sm">
          <Icon name={name}/>
          <span>{name}</span>
        </span>))}
    </div>);
}
```

### Sizes and naming

Save this example at `src/pages/design-system/examples/icon/sizes.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/button, @infisical/icon. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Button } from "../../../../components/v4/ui/button";
import { Icon } from "../../../../components/v4/ui/icon";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 justify-items-center grid-cols-[repeat(auto-fit,minmax(min(100%,8rem),1fr))]">
      {([12, 16, 20, 24] as const).map((size) => (<figure key={size} className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
          <Icon name="key" size={size}/>
        </div><figcaption className="text-muted-foreground text-xs">{<>{size}px</>}</figcaption></figure>))}
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Icon name="lock" label="Encrypted"/>
      </div><figcaption className="text-muted-foreground text-xs">{"Named image"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3 items-center text-center"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-center">
        <Button asChild variant="outline" icon="key">
          <a href="#sensitive-editor">View editor</a>
        </Button>
      </div><figcaption className="text-muted-foreground text-xs">{"Action icon"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- runtime: npm test -- src/components/v4/ui/brand-runtime.test.tsx
- browser: npm run ui:dev; open /design-system#icon and exercise the documented interaction.
