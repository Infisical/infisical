import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from "@infisical/cipher/ui/chart";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";

export type AccessVolumePoint = { label: string; value: number };

const compactNumber = new Intl.NumberFormat("en-US", { notation: "compact" });

const axisTick = { fill: "var(--cipher-text2)", style: { fill: "var(--cipher-text2)" } };

export const AccessVolumeChart = ({
  data,
  valueLabel = "Requests",
  height = 280
}: {
  data: AccessVolumePoint[];
  valueLabel?: string;
  height?: number;
}) => {
  const config: ChartConfig = { value: { label: valueLabel, color: "var(--chart-1)" } };
  return (
    <ChartContainer config={config} height={height} initialDimension={{ width: 640, height }}>
      <AreaChart accessibilityLayer data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
        <CartesianGrid vertical={false} stroke="var(--cipher-line)" />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tick={axisTick} />
        <YAxis
          width={44}
          allowDecimals={false}
          tickFormatter={(value: number) => compactNumber.format(value)}
          tickLine={false}
          axisLine={false}
          tick={axisTick}
        />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--color-value)"
          strokeWidth={2}
          fill="var(--color-value)"
          fillOpacity={0.12}
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ChartContainer>
  );
};
