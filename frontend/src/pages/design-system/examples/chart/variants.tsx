import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent
} from "@app/components/v4/ui/chart";

import { ExampleCell } from "../../example-presentation";

const data = [
  { day: "Mon", read: 18, write: 8 },
  { day: "Tue", read: 26, write: 12 },
  { day: "Wed", read: 14, write: 6 }
];
export default function Example() {
  return (
    <ExampleCell align="stretch" label="Two series with the tooltip held open on Tuesday">
      <ChartContainer
        className="aspect-auto h-60"
        config={{
          read: { label: "Read", theme: { light: "var(--chart-1)", dark: "var(--chart-1)" } },
          write: { label: "Write", color: "var(--chart-2)" }
        }}
      >
        <BarChart accessibilityLayer data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="day" />
          <YAxis width={28} domain={[0, 30]} allowDecimals={false} />
          <ChartTooltip defaultIndex={1} content={<ChartTooltipContent indicator="dot" />} />
          <ChartLegend content={<ChartLegendContent />} />
          <Bar dataKey="read" fill="var(--color-read)" isAnimationActive={false}>
            <LabelList dataKey="read" position="top" fill="var(--v4-ink)" />
          </Bar>
          <Bar dataKey="write" fill="var(--color-write)" isAnimationActive={false}>
            <LabelList dataKey="write" position="top" fill="var(--v4-ink)" />
          </Bar>
        </BarChart>
      </ChartContainer>
      <p className="text-sm">
        Synthetic counts. Mon: 18 read, 8 write. Tue: 26 read, 12 write. Wed: 14 read, 6 write.
      </p>
    </ExampleCell>
  );
}
