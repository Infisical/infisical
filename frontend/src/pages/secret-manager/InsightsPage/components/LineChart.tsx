import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

export type LineChartDataPoint = {
  label: string;
  value: number;
};

type LineChartProps = {
  data: LineChartDataPoint[];
  height?: number;
};

export const LineChart = ({ data, height = 280 }: LineChartProps) => {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
        <defs>
          <linearGradient id="areaGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--color-info)" stopOpacity={0.15} />
            <stop offset="100%" stopColor="var(--color-info)" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="4 4" stroke="var(--color-border)" vertical={false} />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11, fill: "var(--color-label)" }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fontSize: 11, fill: "var(--color-label)" }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "var(--color-popover)",
            border: "1px solid var(--color-border)",
            borderRadius: 8,
            fontSize: 12
          }}
          labelStyle={{ color: "var(--color-foreground)" }}
          itemStyle={{ color: "var(--color-warning)" }}
          cursor={{ stroke: "var(--color-warning)", strokeWidth: 1, strokeDasharray: "4 4" }}
          formatter={(value) => [Number(value).toLocaleString(), "Requests"]}
        />
        <Area
          type="monotoneX"
          dataKey="value"
          stroke="var(--color-info)"
          strokeWidth={1.5}
          fill="url(#areaGradient)"
          dot={{
            r: 4,
            fill: "var(--color-info)",
            stroke: "var(--color-container)",
            strokeWidth: 2
          }}
          activeDot={{
            r: 4,
            fill: "var(--color-warning)",
            stroke: "var(--color-container)",
            strokeWidth: 2
          }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
};
