# Chart

Present numeric data with a shared legend and tooltip contract.

## Choose this component

Choose Chart to compare numeric quantities or trends. Use Table for exact row inspection and include a text summary when values inform a decision.

## Usage rules

### chart-usage

Owner: chart.

When a bar chart compares request counts across days.

Do: Show the quantity and unit, a truthful scale, readable labels, and exact values outside pointer-only tooltips.

Avoid: Plot unlabeled bars with no scale or use color as the only series identifier.

Why: Without units and exact values the visual cannot support a reliable comparison.

Checked by: review only. Look for: Read the chart without hover or hue. The metric, unit, baseline, series identities and exact values required for the comparison are still available.

Source evidence:
- src/components/v4/ui/chart.tsx
- src/pages/design-system/examples/chart/default.tsx

### chart-comparable-scale

Owner: chart.

When bars compare the same quantity across categories.

Do: Use a common zero baseline and the same unit; keep labels and exact values available when hover is unavailable.

Avoid: Start similar bar panels at unrelated nonzero baselines or change the unit without naming it.

Why: Bar length encodes magnitude. Inconsistent scales can make a small difference look large.

Checked by: review only. Look for: Compare the plotted lengths with their stated values and baseline; switching off hover or color does not remove the values needed for the decision.

Source evidence:
- src/components/v4/ui/chart.tsx
- src/pages/design-system/examples/chart/default.tsx

### chart-data-meaning

Owner: chart.

When numeric data changes between pending, empty, failed and loaded states.

Do: Keep series labels and semantic colors stable in ChartConfig, include units and an accessible summary, and show each data lifecycle truthfully.

Avoid: Plot placeholder zeros as actual observations, recolor series by array index or rely on hover alone for a consequential value.

Why: A polished plot can still misrepresent missing data or reverse the meaning of a series.

Checked by: review only. Look for: Compare the summary, legend, units and supplied observations after reload and failure. Missing observations are not reported as measured zero and exact values remain available outside hover.

Source evidence:
- src/components/v4/ui/chart.tsx
- src/pages/design-system/examples/chart/default.tsx

## State guidance

- empty: Say that no observations match the period instead of drawing zero bars for unknown data.
- loading: Keep the chart region stable and distinguish pending data from a genuine zero count.

## Presentation rules

Do: Use a consistent scale, restrained series palette and a visible unit.

Avoid: Add decorative curves, perspective or color variation that changes no data distinction.

Why: The visual encoding should support a comparison rather than imply extra categories or precision.

## Import and exports

- src/components/v4/ui/chart.tsx

Exports: ChartConfig, ChartContainer, ChartLegend, ChartLegendContent, ChartStyle, ChartTooltip, ChartTooltipContent. Source TypeScript defines the API.

## Behavior

- ChartContainer provides Recharts responsive sizing and a ChartConfig mapping series keys to labels, icons and color or light/dark values. Tooltip and legend content consume that context.

## Accessibility

- Provide an equivalent text summary for decisions that cannot be read from the chart alone.

## Use cases

- Use ChartConfig to keep numeric series identity, units and accessible explanations stable across the data lifecycle.

## Limits

- A chart tooltip does not replace an accessible data summary.

## Declared example coverage

Source declarations and review criteria only. Generation checks references and completeness, not rendered behavior or API parity.

### tooltip indicator

- dot: example `variants`, visible label "Two series with the tooltip held open on Tuesday".
- line: omitted. The tooltip appears only on hover, so a static page holds one open and shows dot. line swaps the swatch beside each tooltip row for a narrow bar.
- dashed: omitted. Hover-only, like line. dashed draws the swatch as a dashed bar.
- none: omitted. hideIndicator removes the swatch from the tooltip, which is only visible on hover.

### identity

- single series: example `default`, visible label "Requests per day".
- multiple series: example `variants`, visible label "Two series with the tooltip held open on Tuesday".

### size support


- no authored named size: omitted. This family has no authored sm/md/lg size option. Its dimensions follow content or its container; examples preserve that API.

### host data lifecycle

- pending: example `states`, visible label "Loading request counts".
- empty: example `states`, visible label "No requests yet".
- failed: example `states`, visible label "Request counts unavailable".
- recovered: omitted. Request lifecycle transitions belong to the host. The Human page compares loading, empty and error presentations directly.
- loaded: omitted. Request lifecycle transitions belong to the host. The Human page compares loading, empty and error presentations directly.
- completed: omitted. Request lifecycle transitions belong to the host. The Human page compares loading, empty and error presentations directly.

## Executable examples

### Daily request counts with exact values

Save this example at `src/pages/design-system/examples/chart/default.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/chart. Additional packages: recharts@^3.8.1. Install every listed item before compiling this example.

```tsx
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import * as UI from "../../../../components/v4/ui/chart";
const data = [
    { day: "Mon", requests: 18 },
    { day: "Tue", requests: 26 },
    { day: "Wed", requests: 14 }
];
export default function Example() {
    return (<figure aria-label="Requests per day" className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
      <UI.ChartContainer className="aspect-auto h-60" config={{ requests: { label: "Requests", color: "var(--v4-text2)" } }}>
        <BarChart accessibilityLayer data={data} margin={{ top: 24, right: 12, bottom: 4, left: 0 }}>
          <CartesianGrid vertical={false} stroke="var(--v4-line)"/>
          <XAxis dataKey="day" tickLine={false} axisLine={false} tick={{ fill: "var(--v4-ink)", style: { fill: "var(--v4-ink)" } }}/>
          <YAxis width={36} allowDecimals={false} domain={[0, 30]} tickCount={4} tickLine={false} axisLine={false} tick={{ fill: "var(--v4-ink)", style: { fill: "var(--v4-ink)" } }}/>
          <UI.ChartTooltip content={<UI.ChartTooltipContent />}/>
          <UI.ChartLegend content={<UI.ChartLegendContent />}/>
          <Bar isAnimationActive={false} dataKey="requests" fill="var(--color-requests)" maxBarSize={40}>
            <LabelList dataKey="requests" position="top" fill="var(--v4-ink)"/>
          </Bar>
        </BarChart>
      </UI.ChartContainer>
      <p className="text-sm">Synthetic example. Monday 18 requests, Tuesday 26, Wednesday 14.</p>
    </div><figcaption className="text-muted-foreground text-xs">{"Requests per day"}</figcaption></figure>);
}
```

### Series and tooltip

Save this example at `src/pages/design-system/examples/chart/variants.tsx`; its relative imports are generated for that exact path. States: default.

Registry items used: @infisical/chart. Additional packages: recharts@^3.8.1. Install every listed item before compiling this example.

```tsx
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { ChartContainer, ChartLegend, ChartLegendContent, ChartTooltip, ChartTooltipContent } from "../../../../components/v4/ui/chart";
const data = [
    { day: "Mon", read: 18, write: 8 },
    { day: "Tue", read: 26, write: 12 },
    { day: "Wed", read: 14, write: 6 }
];
export default function Example() {
    return (<figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
      <ChartContainer className="aspect-auto h-60" config={{
            read: { label: "Read", theme: { light: "var(--chart-1)", dark: "var(--chart-1)" } },
            write: { label: "Write", color: "var(--chart-2)" }
        }}>
        <BarChart accessibilityLayer data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false}/>
          <XAxis dataKey="day"/>
          <YAxis width={28} domain={[0, 30]} allowDecimals={false}/>
          <ChartTooltip defaultIndex={1} content={<ChartTooltipContent indicator="dot"/>}/>
          <ChartLegend content={<ChartLegendContent />}/>
          <Bar dataKey="read" fill="var(--color-read)" isAnimationActive={false}>
            <LabelList dataKey="read" position="top" fill="var(--v4-ink)"/>
          </Bar>
          <Bar dataKey="write" fill="var(--color-write)" isAnimationActive={false}>
            <LabelList dataKey="write" position="top" fill="var(--v4-ink)"/>
          </Bar>
        </BarChart>
      </ChartContainer>
      <p className="text-sm">
        Synthetic counts. Mon: 18 read, 8 write. Tue: 26 read, 12 write. Wed: 14 read, 6 write.
      </p>
    </div><figcaption className="text-muted-foreground text-xs">{"Two series with the tooltip held open on Tuesday"}</figcaption></figure>);
}
```

### States

Save this example at `src/pages/design-system/examples/chart/states.tsx`; its relative imports are generated for that exact path. States: loading, empty, error.

Registry items used: @infisical/alert, @infisical/empty, @infisical/spinner. Additional packages: none. Install every listed item before compiling this example.

```tsx
import { Alert, AlertDescription, AlertTitle } from "../../../../components/v4/ui/alert";
import { EmptyState } from "../../../../components/v4/ui/empty";
import { Spinner } from "../../../../components/v4/ui/spinner";
export default function Example() {
    return (<div className="grid min-w-0 w-full items-start gap-x-6 gap-y-8 grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <div className="flex min-h-24 w-full items-center justify-center">
          <Spinner size="base" label="Loading request counts"/>
        </div>
      </div><figcaption className="text-muted-foreground text-xs">{"Loading"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <EmptyState title="No requests yet" description="Request counts will appear when clients connect."/>
      </div><figcaption className="text-muted-foreground text-xs">{"Empty"}</figcaption></figure>
      <figure className="m-0 flex min-w-0 w-full flex-col gap-3"><div className="flex min-h-8 min-w-0 w-full flex-col gap-3 items-stretch">
        <Alert variant="destructive">
          <AlertTitle>Request counts unavailable</AlertTitle>
          <AlertDescription>Try again when the connection is restored.</AlertDescription>
        </Alert>
      </div><figcaption className="text-muted-foreground text-xs">{"Error"}</figcaption></figure>
    </div>);
}
```

## Verification recipes

These commands are recipes, not evidence that this component passed.

- static: npm run type:check
- browser: npm run ui:dev; open /design-system#chart and verify the documented interaction.
