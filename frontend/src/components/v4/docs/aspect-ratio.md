# Aspect Ratio

Keep a media or preview region at a defined width-to-height ratio.

## Choose this component

Choose AspectRatio for media with a known width-to-height shape. Use normal document flow for text, forms and resource details.

## Usage rules

### aspect-ratio-usage

Owner: aspect-ratio.

When a preview loads after the surrounding page renders.

Do: Constrain the outer width, set ratio to width divided by height, and give the media its own alternative text.

Avoid: Set a fixed-ratio shell around text that must grow with zoom or translation.

Why: The wrapper reserves geometry; it cannot make overflowing text readable.

Checked by: review only. Look for: Resize each media container before and after content loads; its width-to-height ratio remains correct and adjacent text can still wrap independently.

Source evidence:
- src/components/v4/ui/aspect-ratio.tsx
- src/pages/design-system/examples/aspect-ratio/default.tsx

## State guidance

- loading: Reserve the same media area before and after the image arrives.
- narrow: Let the outer width shrink while the selected ratio remains constant.

## Presentation rules

Do: Choose a ratio from the actual media and show a readable caption or alternative.

Avoid: Force the same fixed media shape around forms, text cards and every product illustration.

Why: A repeated shape can crop useful content or add empty space without serving the media.

## Import and exports

- src/components/v4/ui/aspect-ratio.tsx

Exports: AspectRatio. Source TypeScript defines the API.

## Behavior

- The ratio prop is width divided by height; Radix reserves that proportion while the outer container determines width.

## Accessibility

- The wrapper adds no image alternative. Give the actual image alt text or name the embedded preview.

## Use cases

- Set ratio to width divided by height, constrain its outer width and choose the image fit policy from whether cropping is acceptable.

## Avoid

- Put instructions or form controls in a fixed-ratio box, or crop a meaningful diagram to fill an attractive shape.

## Limits

- A fixed ratio can crop or letterbox media depending on the child's own object-fit behavior.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### representative numeric ratios

- 16:9: example `media`, visible label "16:9".
- 1:1: example `media`, visible label "1:1".
- 3:4: example `media`, visible label "3:4".

## Executable examples

### Wide and square media previews

Save this example at `src/pages/design-system/examples/aspect-ratio/default.tsx`; its relative imports are generated for that exact path. States: default, controlled, overflow.

Registry items used: @infisical/aspect-ratio. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { AspectRatio } from "../../../../components/v4/ui/aspect-ratio";
const height = 160;
export default function Example() {
    return (<div className="flex flex-wrap items-start gap-6">
      {[
            { ratio: 16 / 9, label: "16:9", use: "Recording preview" },
            { ratio: 1, label: "1:1", use: "Square image preview" }
        ].map((item) => (<div key={item.label} style={{ width: height * item.ratio }}>
          <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
            <AspectRatio ratio={item.ratio}>
              <div className="flex h-full flex-col items-center justify-center gap-2 border border-border bg-muted p-4 text-center">
                <strong>{item.label}</strong>
                <span className="text-sm">{item.use}</span>
              </div>
            </AspectRatio>
          </div><figcaption className="text-muted-foreground text-xs">{<>{item.label} width to height</>}</figcaption></figure>
        </div>))}
    </div>);
}
```

### Media ratios

Save this example at `src/pages/design-system/examples/aspect-ratio/media.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/aspect-ratio. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { AspectRatio } from "../../../../components/v4/ui/aspect-ratio";
const height = 160;
export default function Example() {
    return (<div className="flex flex-wrap items-start gap-6">
      {[
            { ratio: 16 / 9, label: "16:9" },
            { ratio: 1, label: "1:1" },
            { ratio: 3 / 4, label: "3:4" }
        ].map(({ ratio, label }) => (<div key={label} style={{ width: height * ratio }}>
          <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
            <AspectRatio ratio={ratio}>
              <div className="h-full border border-border bg-muted">
                <svg role="img" aria-label="Synthetic connection diagram: application connects to vault" viewBox="0 0 160 90" width="100%" height="100%">
                  <rect x="8" y="25" width="50" height="40" rx="4" fill="none" stroke="currentColor"/>
                  <path d="M58 45h40m-8-6 8 6-8 6" fill="none" stroke="currentColor"/>
                  <rect x="100" y="25" width="50" height="40" rx="4" fill="none" stroke="currentColor"/>
                  <text x="15" y="49" fontSize="10" fill="currentColor">
                    App
                  </text>
                  <text x="110" y="49" fontSize="10" fill="currentColor">
                    Vault
                  </text>
                </svg>
              </div>
            </AspectRatio>
          </div><figcaption className="text-muted-foreground text-xs">{label}</figcaption></figure>
        </div>))}
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#aspect-ratio and verify the documented interaction.
