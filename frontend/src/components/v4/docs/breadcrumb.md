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

Exports: Breadcrumb, BreadcrumbEllipsis, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator, Switcher. Source TypeScript defines the API.

## Behavior

- Breadcrumb supports explicit parts or typed items, middle-path collapse and current ancestry. Product crumbs switch context and give way from outer labels inward at narrow widths.

## Accessibility

- Use the breadcrumb landmark name and aria-current for the current location. Switching menus retain accessible labels when visible text collapses.

## Use cases

- Use real ancestor destinations and typed menu crumbs for actual context changes; retain the current location when middle items collapse.

## Avoid

- Repeat the page title as a fake clickable ancestor or use a decorative separator character to combine unrelated metadata.

## Limits

- The owner supplies real destinations and switching callbacks; collapse does not implement routing.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

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

Registry items used: @infisical/breadcrumb. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { useState } from "react";
import { Breadcrumb } from "../../../../components/v4/ui/breadcrumb";
export default function Example() {
    const [project, setProject] = useState("payments");
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        <Breadcrumb aria-label="Example path" maxItems={3} items={[
            { label: "Projects", href: "#breadcrumb" },
            { label: "Payments", href: "#breadcrumb" },
            { label: "Production", href: "#breadcrumb" },
            { label: "Services", href: "#breadcrumb" },
            { label: "Deployment token" }
        ]}/>
      </div><figcaption className="text-muted-foreground text-xs">{"default"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-start">
        <Breadcrumb aria-label="Product navigation example" variant="product" items={[
            { label: "Workspace", href: "#breadcrumb" },
            {
                label: project,
                menu: {
                    label: "Switch project",
                    value: project,
                    options: [
                        { value: "payments", label: "Payments" },
                        { value: "platform", label: "Platform" }
                    ],
                    onChange: setProject
                }
            },
            { label: "Secrets" }
        ]}/>
      </div><figcaption className="text-muted-foreground text-xs">{"product"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#breadcrumb and verify the documented interaction.
