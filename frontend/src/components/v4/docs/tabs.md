# Tabs

Switch between peer views in the same context.

## Choose this component

Choose Tabs for peer views of the same context. Use navigation links for unrelated destinations.

## Usage rules

### tabs-usage

Owner: tabs.

When switching views should retain the enclosing resource context.

Do: Use stable tab values and meaningful panel labels; keep view selection separate from saving form data.

Avoid: Use tabs to hide required sequential steps or make unrelated pages look like panels.

Why: Peer panels imply that the person can move among them without completing a workflow.

Checked by: review only. Look for: Switch peer panels with keyboard. Selected tab, panel content and accessible relationships agree, and no hidden required sequential step is disguised as a peer view.

Source evidence:
- src/components/v4/ui/tabs.tsx
- src/pages/design-system/examples/tabs/default.tsx

### tabs-peer-view-model

Owner: tabs.

When a task offers independent peer panels.

Do: Give every tab a meaningful panel and stable value, choose automatic activation for ready content or manual activation when changing panels should be deliberate.

Avoid: Use Tabs as an unlabeled filter with empty panels or as sequential steps with hidden prerequisites.

Why: Peer views, filters and prerequisite workflows have different semantics and navigation expectations.

Checked by: review only. Look for: Move focus through tabs in both activation modes. Focus and active panel follow the declared policy, disabled tabs are skipped and long labels remain reachable.

Source evidence:
- src/components/v4/ui/tabs.tsx
- src/pages/design-system/examples/tabs/default.tsx

## State guidance

- controlled: Keep selected value aligned with the actual visible panel.
- disabled: Explain why a view cannot be opened instead of hiding the prerequisite in an inaccessible panel.

## Presentation rules

Do: Use short names that distinguish each view's content.

Avoid: Give every tab an icon, count and status badge when only its name matters.

Why: Extra adornment competes with the active panel indicator.

## Import and exports

- src/components/v4/ui/tabs.tsx
- src/components/v4/ui/navigation.module.css

Exports: Tabs, TabsContent, TabsList, tabsListVariants, TabsTrigger, TabsProps, TabDefinition. Source TypeScript defines the API.

## Behavior

- Use tabs/value/onChange for a typed collection, or compose the retained Radix parts. Tabs and TabsList take the same variant, underline or segmented. underline draws a 2px ink line under the selected tab on a 1px track rule; segmented sits on a tint track and marks the selected tab with the shared selected paint. Both share one measured indicator. A count renders as a neutral Count chip. The panel sits 16px under the track. Overflow scrolls in the selected orientation and reveals the selected tab.

## Accessibility

- Name the tab list. Arrow keys, Home and End move between tabs and skip disabled ones. A horizontal scroll over the tabs hands back to the page at either end, and reduced motion stops the indicator sliding.

## Use cases

- Use underline or segmented Tabs for peer panels. Choose activation policy from whether panel changes can follow focus immediately.

## Limits

- Each tab definition owns a panel, even when content is omitted. Supply meaningful content for usable views; use ToggleGroup for a standalone filter.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### variant

- underline: example `default`, visible label "underline".
- segmented: example `default`, visible label "segmented".

### Orientation

- horizontal: example `default`, visible label "underline".
- vertical: omitted. A side list: the tabs stack and the underline indicator moves to the right edge. Same parts, same keyboard model on the other axis.

### Activation

- automatic: example `default`, visible label "underline".
- manual: omitted. activationMode="manual" keeps the panel until Enter or Space. It changes no paint, so a still example cannot show it.

### TabsList.variant


- underline: omitted. The composed TabsList takes the same two values as Tabs and renders the same track.
- segmented: omitted. The composed TabsList takes the same two values as Tabs and renders the same track.

## Executable examples

### Variants

Save this example at `src/pages/design-system/examples/tabs/default.tsx`; its relative imports are generated for that exact path. States: default, disabled.

Registry items used: @infisical/tabs. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Tabs } from "../../../../components/v4/ui/tabs";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-1">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Tabs label="Secret sections" tabs={[
            { value: "overview", label: "Overview", content: "Value, comment and tags." },
            { value: "versions", label: "Versions", count: 15, content: "15 versions." },
            { value: "syncs", label: "Syncs", count: 3, content: "3 synced destinations." },
            {
                value: "policy",
                label: "Policy",
                disabled: true,
                content: "Unavailable on this plan."
            }
        ]}/>
      </div><figcaption className="text-muted-foreground text-xs">{"underline"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Tabs label="Environment" variant="segmented" tabs={[
            { value: "staging", label: "Staging", count: 12, content: "12 staging connections." },
            {
                value: "production",
                label: "Production",
                count: 4,
                content: "4 production connections."
            }
        ]}/>
      </div><figcaption className="text-muted-foreground text-xs">{"segmented"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#tabs and verify the documented interaction.
