# Breadcrumb

Show the current location and links to its ancestors.

## Choose this component

Choose Breadcrumb for page ancestry. Use a context switcher for changing project or environment and Tabs for peer views.

## Usage rules

### breadcrumb-destination-labels

Owner: breadcrumb.

When an ancestor link switches the local resource context.

Do: Use the actual resource name and preserve disclosure chevrons only for hierarchy or switching.

Avoid: Add a promotional call to action or a decorative arrow after every ancestor.

Why: A path should predict the destination before activation.

Checked by: review only. Look for: Activate every ancestor and confirm the displayed local context matches its label.

Source evidence:
- src/components/v4/ui/breadcrumb.tsx

### breadcrumb-switcher-segment

Owner: breadcrumb.

When a crumb switches the organization, project or environment.

Do: Pass switcher on the crumb and the level's page as link, href or onNavigate, so the name navigates and the chevron alone opens the Switcher.

Avoid: Make the name open the Switcher when the level has a page, leave a name that looks clickable and does nothing, or give a name with a page the same hover ground as its chevron.

Why: People expect a crumb's name to take them to that level. Keeping switching on the chevron leaves both actions one step away, and separate hover grounds show which part does which.

Checked by: review only. Look for: Click each switcher crumb's name: it navigates and no popover opens, unless the level has no page. Tab reaches the name, then the chevron, each with a visible focus ring, and the popover opens from the segment's left edge. Hover a name with a page and only the name takes a ground; hover a switcher-only crumb and the whole segment does. Sample document.elementFromPoint across each segment's box: a switcher-only segment answers its one button everywhere, and a segment with a page answers the name or the chevron with nothing between them.

Source evidence:
- src/components/v4/ui/breadcrumb.tsx
- src/components/v4/ui/breadcrumb.module.css

### breadcrumb-usage

Owner: breadcrumb.

When a deep resource page needs a route back to its parents.

Do: Link each ancestor and mark the final item as the current page; expose collapsed ancestors through the overflow control.

Avoid: Make every crumb a dropdown or repeat the entire path in the page title.

Why: Ancestry should remain a short, predictable route through the hierarchy.

Checked by: review only. Look for: Follow every ancestor and open collapsed items with the keyboard; each reaches the represented ancestor and the current item is not a false action.

Source evidence:
- src/components/v4/ui/breadcrumb.tsx
- src/pages/design-system/examples/breadcrumb/default.tsx

## State guidance

- overflow: Collapse intermediate ancestors while retaining access to them.
- current: Render the current item without a misleading navigation action.

## Presentation rules

Do: Use resource names and hierarchy labels.

Avoid: Add slash-separated metadata such as region, role and expiry to the path.

Why: Those values describe the object but are not its ancestors.

## Import and exports

- src/components/v4/ui/breadcrumb.tsx
- src/components/v4/ui/breadcrumb.module.css
- src/components/v4/ui/switcher.tsx

Exports: Breadcrumb, BreadcrumbEllipsis, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator, BandDivider, Switcher. Source TypeScript defines the API.

## Behavior

- Breadcrumb supports explicit parts or typed items, middle-path collapse and current ancestry. Product crumbs switch context and give way from outer labels inward at narrow widths.
- A crumb's name goes to that level's page through one of three props. link takes the app's link target and renders through CipherLink (in the app, a TanStack route built with linkOptions, so to, params, search and hash are checked against the route tree, the way RowLink does it), href a plain URL, and onNavigate an in-page handler that also runs on a link or href click, so it can preventDefault. With none of them the crumb has no page of its own.
- A crumb with a switcher whose name has a page is two targets in one segment: the name, then a standalone chevron button that opens the Switcher, anchored to the segment's start. Clicking the name never opens the Switcher; it navigates. The two are separate surfaces: the name takes the shared hover ground on hover and the shared press ground while pressed, the chevron keeps its own hover, press and open grounds, and a space-2 gap between them shows two targets. The gap stays visible but is never dead: the name's hit area runs across it to the chevron, so every pixel of the segment belongs to one target. When the name only opens the same Switcher, the whole segment is one button that wraps the media, the label and the chevron glyph: every pixel of it, padding and gaps included, opens the Switcher, hover draws the shared hover ground across it, and pressing it or an open Switcher draws the press ground. Crumb names that navigate and plain ancestor links take the pointer cursor, like any link; the chevron, the switcher-only segment and the middle-levels button keep the default cursor. Either way the ground's inline padding is cancelled by a negative margin, so the text stays on the content edge. In the product variant every ground (name, chevron, switcher-only segment and plain ancestor link) is size-shell-target (32px) tall with space-control-inline-sm (10px) inline padding, and crumbs use the label type role (14px); the default variant keeps size-nested-sm grounds, space-6 padding and the small role. The current crumb is plain text and never takes a hover ground. TopBar marks its trail with data-org-zone; there the root switcher crumb drops the negative start margin, takes the Sidebar row's inset, glyph size and label gap, is capped at --v4-crumb-root-max, and its width is --v4-crumb-root-size while the Sidebar is open and its content width while it is collapsed, eased between the two with interpolate-size over duration-slow, so the BandDivider after it follows it in the flow.
- Fallbacks keep every target alive. A switcher crumb without a page, and a switcher crumb that is the current page, become that one segment button for the Switcher. A crumb with neither a page nor a switcher is plain text, and the current crumb without a switcher is plain text marked as the current page.
- A Switcher option with onSelect is an action row inside its group, such as New sub-organization under Sub-organizations: choosing it runs the action and closes the popover without changing the value. A SwitcherAction with link renders as one CipherLink anchor inside its row, like a crumb's link: a click or Enter navigates, middle-click and modifier-click open a new tab, and the popover closes; without link, onSelect runs as before. Options keep their groups in order of first appearance, so the row lands where it is listed. In the TopBar band the root switcher crumb reads in ink at 600, and data-fill on a Breadcrumb lets a single switcher crumb fill its row with the chevron at the end, as in the nav Sheet.
- Crumbs are separated by a vertical divider, never a typed slash: a size-crumb-divider-width line, size-crumb-divider tall, in crumb-divider, drawn by BandDivider. BandDivider is an element in the layout flow inside the following crumb's li, aria-hidden, with space-crumb-divider on each side between the line and the neighboring target's ground, in both variants; no crumb offsets it with a negative margin, so both gaps are always equal. Every crumb target pads its text by its inset, so the text sits space-crumb-divider plus the inset from the line (10px in the band, 6px elsewhere), and only the first crumb pulls back by its inset to keep its label on the content edge. BreadcrumbSeparator draws the same element by default, and the TopBar's right cluster uses it between search and the account trigger.
- lastIsCurrent={false} keeps every crumb an ancestor, for trails that sit above a page title.

## Accessibility

- Use the breadcrumb landmark name and aria-current for the current location. Switching menus retain accessible labels when visible text collapses.
- A switcher crumb with a page has two tab stops in reading order, the name and then the chevron, and both draw the ink focus outline. The chevron carries the popup attributes, and its name joins switcher.label and the crumb's text, such as Switch project payments-api. A switcher crumb without a page, or the current one, is one tab stop: the segment button carries aria-haspopup and aria-expanded, draws the ink focus outline around the whole segment and takes the same name, such as Switch environment Production.

## Use cases

- Use real ancestor destinations and give each switcher crumb its level's page as link, href or onNavigate; retain the current location when middle items collapse.

## Avoid

- Repeat the page title as a fake clickable ancestor, make a crumb's name open its switcher when the level has a page, or type a separator character between crumbs.

## Limits

- A crumb's mono is for a machine value such as a secret key or path segment shown as code. Project, organization, environment and folder crumbs, and the options of a crumb's Switcher, are names and stay in the sans (rule/mono-machine-values).
- The owner supplies real destinations and switching callbacks; collapse does not implement routing.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### crumb target

- page and switcher: example `default`, visible label "product".
- switcher only: example `default`, visible label "product".
- plain text: example `default`, visible label "product".

### variant

- default: example `default`, visible label "default".
- product: example `default`, visible label "product".

### Switcher.side


- bottom: omitted. The switcher opens below its crumb by default; placement is a popover option.
- top: omitted. Placement is a popover option and adds no breadcrumb behavior.
- right: omitted. Placement is a popover option and adds no breadcrumb behavior.

## Executable examples

### Collapsed ancestry and project switching

Save this example at `src/pages/design-system/examples/breadcrumb/default.tsx`; its relative imports are generated for that exact path. States: controlled, overflow, keyboard.

Registry items used: @cipher/breadcrumb. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";

import { Breadcrumb } from "../../../../components/v4/ui/breadcrumb";

export default function Example() {
  const [org, setOrg] = useState("acme");
  const [project, setProject] = useState("payments");
  const [environment, setEnvironment] = useState("prod");
  return (
    <div className="grid w-full min-w-0 grid-cols-1 items-start gap-x-6 gap-y-8">
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
          <Breadcrumb
            aria-label="Example path"
            maxItems={3}
            items={[
              { label: "Projects", href: "#breadcrumb" },
              { label: "Payments", href: "#breadcrumb" },
              { label: "Production", href: "#breadcrumb" },
              { label: "Services", href: "#breadcrumb" },
              { label: "Deployment token" }
            ]}
          />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"default"}</figcaption>
      </figure>
      <figure className="m-0 flex w-full min-w-0 flex-col gap-3">
        <div className="flex min-h-8 w-full min-w-0 flex-col items-start gap-3">
          <Breadcrumb
            aria-label="Product navigation example"
            variant="product"
            items={[
              {
                label: org === "acme" ? "Acme Corp" : "Globex",
                link: { href: "/design-system/components/navigation/breadcrumb" },
                switcher: {
                  label: "Switch organization",
                  value: org,
                  options: [
                    { value: "acme", label: "Acme Corp" },
                    { value: "globex", label: "Globex" }
                  ],
                  onChange: setOrg,
                  actions: [
                    {
                      label: "Organization settings",
                      link: { href: "/design-system/components/navigation/top-bar" }
                    }
                  ]
                }
              },
              { label: "Secrets Management" },
              {
                label: project,
                href: "#breadcrumb",
                switcher: {
                  label: "Switch project",
                  value: project,
                  options: [
                    { value: "payments", label: "payments" },
                    { value: "platform", label: "platform" }
                  ],
                  onChange: setProject
                }
              },
              {
                label: environment === "prod" ? "Production" : "Staging",
                switcher: {
                  label: "Switch environment",
                  value: environment,
                  options: [
                    { value: "staging", label: "Staging" },
                    { value: "prod", label: "Production" }
                  ],
                  onChange: setEnvironment
                }
              },
              { label: "Secrets" }
            ]}
          />
        </div>
        <figcaption className="text-muted-foreground text-xs">{"product"}</figcaption>
      </figure>
    </div>
  );
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run dev; open /design-system#breadcrumb and verify the documented interaction.
