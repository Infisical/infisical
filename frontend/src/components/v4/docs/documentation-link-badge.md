# Documentation link badge

An info Badge that opens a documentation page in a new tab, with a fixed label and tooltip.

## Choose this component

Choose DocumentationLinkBadge over a hand-built Badge link so every documentation link has the same label, tab behavior, safe rel and accessible name.

## Usage rules

### documentation-link-badge-owned-attributes

Owner: documentation-link-badge.

When a title or field links to its documentation page.

Do: Render DocumentationLinkBadge with href and nothing else.

Avoid: Wrap a Badge around an anchor and set target, rel and the label by hand, or pass a custom label.

Why: A hand-built link drifts on rel, label and the new-tab announcement, and a missing noopener hands the opened page a handle on this window.

Checked by: src/components/v4/ui/documentation-link-badge.test.tsx. Renders the badge and checks target, rel and the accessible name that says it opens in a new tab.

Source evidence:
- src/components/v4/ui/documentation-link-badge.tsx
- src/pages/design-system/examples/documentation-link-badge/default.tsx

## State guidance

- hover: Translucent ink over the info ground; the label does not change.
- focus: The shared ink outline, offset by the focus-ring size.

## Presentation rules

Do: Place one badge per documented section.

Avoid: Repeat the badge on every row or field of the same section.

Why: Repeated identical links add noise and tab stops without new destinations.

## Import and exports

- src/components/v4/ui/documentation-link-badge.tsx
- src/components/v4/ui/documentation-link-badge.module.css

Exports: DocumentationLinkBadge. Source TypeScript defines the API.

## Behavior

- The caller passes only href. The component owns the Documentation label, the external icon, target _blank and rel noopener noreferrer.
- default is an info-tone Badge drawn as an anchor; hover lays translucent ink over the info ground. Its tooltip says it opens in a new tab.
- minified is the external icon alone in a badge-height square in info color, for tight rows; its tooltip says Documentation.

## Accessibility

- Both variants are real links. Their accessible name is Documentation (opens in a new tab): default adds the phrase as visually hidden text, minified sets it as aria-label.
- The icon is decorative and hidden from assistive technology.
- Focus draws the shared ink outline.

## Use cases

- Use it beside a page, section or field title that has a documentation page, passing only that page's URL.

## Avoid

- Do not use it for links to product pages, changelogs or support.

## Limits

- The label is fixed. A link to something other than documentation, or with its own wording, is an ordinary link or Button.
- It always opens a new tab; in-app navigation uses a router link.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### variant

- default: example `default`, visible label "default".
- minified: example `default`, visible label "minified".

## Executable examples

### Variants and placement

Save this example at `src/pages/design-system/examples/documentation-link-badge/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/documentation-link-badge, @infisical/text. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { DocumentationLinkBadge } from "../../../../components/v4/ui/documentation-link-badge";
import { Heading } from "../../../../components/v4/ui/text";
const href = "https://infisical.com/docs/documentation/platform/gateways/overview";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <DocumentationLinkBadge href={href}/>
      </div><figcaption className="text-muted-foreground text-xs">{"default"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <DocumentationLinkBadge href={href} variant="minified"/>
      </div><figcaption className="text-muted-foreground text-xs">{"minified"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <div className="flex items-center gap-2">
          <Heading level={3} size="subsection">
            Gateways
          </Heading>
          <DocumentationLinkBadge href={href}/>
        </div>
      </div><figcaption className="text-muted-foreground text-xs">{"Beside a section title"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- runtime: npm test -- src/components/v4/ui/documentation-link-badge.test.tsx
- static: npm run type:check
- browser: Verify both themes, hover, focus and the tooltip.
