import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";

import * as UI from "@app/components/v4/ui/chart";

import { ExampleCell } from "../../example-presentation";

const data = [
  { day: "Mon", requests: 18 },
  { day: "Tue", requests: 26 },
  { day: "Wed", requests: 14 }
];
export default function Example() {
  return (
    <ExampleCell align="stretch" aria-label="Requests per day" label="Requests per day">
      <UI.ChartContainer
        className="aspect-auto h-60"
        config={{ requests: { label: "Requests", color: "var(--v4-text2)" } }}
      >
        <BarChart
          accessibilityLayer
          data={data}
          margin={{ top: 24, right: 12, bottom: 4, left: 0 }}
        >
          <CartesianGrid vertical={false} stroke="var(--v4-line)" />
          <XAxis
            dataKey="day"
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--v4-ink)", style: { fill: "var(--v4-ink)" } }}
          />
          <YAxis
            width={36}
            allowDecimals={false}
            domain={[0, 30]}
            tickCount={4}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--v4-ink)", style: { fill: "var(--v4-ink)" } }}
          />
          <UI.ChartTooltip content={<UI.ChartTooltipContent />} />
          <UI.ChartLegend content={<UI.ChartLegendContent />} />
          <Bar
            isAnimationActive={false}
            dataKey="requests"
            fill="var(--color-requests)"
            maxBarSize={40}
          >
            <LabelList dataKey="requests" position="top" fill="var(--v4-ink)" />
          </Bar>
        </BarChart>
      </UI.ChartContainer>
      <p className="text-sm">Synthetic example. Monday 18 requests, Tuesday 26, Wednesday 14.</p>
    </ExampleCell>
  );
}
