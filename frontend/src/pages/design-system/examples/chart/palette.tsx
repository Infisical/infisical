import { Bar, BarChart, CartesianGrid, Cell, LabelList, XAxis, YAxis } from "recharts";

import * as UI from "@app/components/v4/ui/chart";

import { ExampleCell } from "../../example-presentation";

const counts = [24, 19, 15, 12, 9, 6];
const data = UI.chartSeries.map((color, index) => ({
  series: `chart-${index + 1}`,
  count: counts[index],
  color
}));

export default function Example() {
  return (
    <ExampleCell align="stretch" label="chart-1 to chart-6 in series order">
      <UI.ChartContainer
        className="aspect-auto h-60"
        config={{ count: { label: "Certificates", color: "var(--chart-1)" } }}
      >
        <BarChart
          accessibilityLayer
          data={data}
          margin={{ top: 24, right: 12, bottom: 4, left: 0 }}
        >
          <CartesianGrid vertical={false} stroke="var(--v4-line)" />
          <XAxis
            dataKey="series"
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
          <Bar isAnimationActive={false} dataKey="count" maxBarSize={40}>
            {data.map((entry) => (
              <Cell key={entry.series} fill={entry.color} />
            ))}
            <LabelList dataKey="count" position="top" fill="var(--v4-ink)" />
          </Bar>
        </BarChart>
      </UI.ChartContainer>
      <p className="text-sm">
        Synthetic certificate counts by issuer: chart-1 24, chart-2 19, chart-3 15, chart-4 12,
        chart-5 9, chart-6 6.
      </p>
    </ExampleCell>
  );
}
