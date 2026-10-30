# Provider icon

A third-party provider's logo from public/images/integrations, swapped for the theme.

## Choose this component

Choose ProviderIcon for third-party logos so the theme swap, sizes and fallback stay in one place. Use Icon for interface glyphs.

## Usage rules

### provider-icon-theme-variant

Owner: provider-icon.

When a provider logo is unreadable on one theme (dark marks on dark ground, white marks on light).

Do: Add the counterpart file and its entry to the variants map, and keep passing main's base filename as icon.

Avoid: Pick the file at the call site from the theme.

Why: One map keeps every surface on the same file for the same provider and theme.

Checked by: src/components/v4/ui/provider-icon.test.tsx. Renders GitHub.png in a light scope and checks the src resolves to the on-light file.

Source evidence:
- src/components/v4/ui/provider-icon.tsx
- src/pages/design-system/examples/provider-icon/default.tsx

## State guidance

- light and dark: The counterpart file swaps with the scope's theme.
- missing file: The apps glyph stands in at the same size.

## Presentation rules

Do: Pick one size per surface and keep it across rows.

Avoid: Scale logos with arbitrary width classes.

Why: Mixed logo sizes make a list look misaligned.

## Import and exports

- src/components/v4/ui/provider-icon.tsx
- src/components/v4/ui/provider-icon.module.css

Exports: ProviderIcon, providerIconPath. Source TypeScript defines the API.

## Behavior

- icon is main's filename under /images/integrations (for example Amazon Web Services.png). Logos with a light or dark counterpart (onLight or onDark, the same map main uses) resolve to it from the V4Scope theme.
- size is sm, md, lg or xl: size-icon-sm (14px), size-icon (16px), size-icon-lg (20px) and size-icon-xl (24px). md is the default. The logo is contained, never cropped.
- A file that fails to load falls back to the apps glyph in faint ink at the same size, so the row keeps its layout.

## Accessibility

- alt is required. Name the provider (AWS logo) when the logo stands alone, or pass an empty string when the provider's name is beside it.
- The fallback keeps the alt as its accessible name (role img), or is hidden when alt is empty.

## Use cases

- Use ProviderIcon wherever a row, picker or header shows a third-party provider's logo.

## Avoid

- Do not draw an img with a /images/integrations path and a theme check by hand.

## Limits

- Only files shipped under public/images/integrations resolve. A new logo with a theme counterpart needs an entry in the variants map.
- It renders the logo bare; put it in Media for a framed tile.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### size

- sm: example `default`, visible label "sm".
- md: example `default`, visible label "md".
- lg: example `default`, visible label "lg".
- xl: example `default`, visible label "xl".

## Executable examples

### Sizes, theme variants and fallback

Save this example at `src/pages/design-system/examples/provider-icon/default.tsx`; its relative imports are generated for that exact path. States: default, error.

Registry items used: @infisical/provider-icon. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { ProviderIcon } from "../../../../components/v4/ui/provider-icon";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <ProviderIcon icon="Amazon Web Services.png" alt="AWS logo" size="sm"/>
      </div><figcaption className="text-muted-foreground text-xs">{"sm"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <ProviderIcon icon="Amazon Web Services.png" alt="AWS logo"/>
      </div><figcaption className="text-muted-foreground text-xs">{"md"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <ProviderIcon icon="Amazon Web Services.png" alt="AWS logo" size="lg"/>
      </div><figcaption className="text-muted-foreground text-xs">{"lg"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <ProviderIcon icon="Amazon Web Services.png" alt="AWS logo" size="xl"/>
      </div><figcaption className="text-muted-foreground text-xs">{"xl"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <div className="flex items-center gap-3">
          <ProviderIcon icon="GitHub.png" alt="GitHub logo" size="xl"/>
          <ProviderIcon icon="OpenAI.png" alt="OpenAI logo" size="xl"/>
          <ProviderIcon icon="Anthropic.png" alt="Anthropic logo" size="xl"/>
        </div>
      </div><figcaption className="text-muted-foreground text-xs">{"Theme variants"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <ProviderIcon icon="Retired Provider.png" alt="Retired Provider logo" size="xl"/>
      </div><figcaption className="text-muted-foreground text-xs">{"Missing file, fallback"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- runtime: npm test -- src/components/v4/ui/provider-icon.test.tsx
- static: npm run type:check
- browser: Verify both themes for GitHub, OpenAI and Anthropic, and the fallback.
