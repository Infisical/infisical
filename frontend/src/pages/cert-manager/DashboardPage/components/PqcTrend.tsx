import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import {
  Button,
  UnstableCard,
  UnstableCardAction,
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableEmpty,
  UnstableEmptyHeader,
  UnstableEmptyTitle
} from "@app/components/v3";
import type { TPqcTrendPoint } from "@app/hooks/api/certificates";

import { formatTickLabel, nonZeroDot, TREND_COLORS } from "./chart-theme";

type Props = {
  data: TPqcTrendPoint[];
  onRangeChange: (range: string) => void;
  currentRange: string;
};

const SERIES_KEYS = ["pqc", "nonPqc"];

const ranges = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "6M", value: "6m" }
];

const legendLabels: Record<string, string> = {
  pqc: "PQC-ready",
  nonPqc: "Classical"
};

const renderLegend = (value: string) => (
  <span className="text-xs text-muted">{legendLabels[value] ?? value}</span>
);

export const PqcTrend = ({ data, onRangeChange, currentRange }: Props) => {
  const hasAnyData = data.some((d) => d.pqc > 0 || d.nonPqc > 0);
  return (
    <UnstableCard className="min-w-[400px] flex-1">
      <UnstableCardHeader>
        <UnstableCardTitle>PQC Adoption Trend</UnstableCardTitle>
        <UnstableCardAction>
          <div className="flex gap-0.5">
            {ranges.map((r) => (
              <Button
                key={r.value}
                size="xs"
                variant={currentRange === r.value ? "neutral" : "ghost"}
                onClick={() => onRangeChange(r.value)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </UnstableCardAction>
      </UnstableCardHeader>
      <UnstableCardContent>
        {!hasAnyData ? (
          <UnstableEmpty className="h-[250px]">
            <UnstableEmptyHeader>
              <UnstableEmptyTitle>No certificates issued in this period</UnstableEmptyTitle>
            </UnstableEmptyHeader>
          </UnstableEmpty>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis
                dataKey="period"
                tickFormatter={formatTickLabel}
                tick={{ fill: "var(--color-muted)", fontSize: 12 }}
                axisLine={{ stroke: "var(--color-border)" }}
              />
              <YAxis
                tick={{ fill: "var(--color-muted)", fontSize: 12 }}
                axisLine={{ stroke: "var(--color-border)" }}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "var(--color-popover)",
                  border: "1px solid var(--color-border)",
                  borderRadius: "6px",
                  color: "var(--color-foreground)"
                }}
                formatter={(value, name) => [
                  value as number,
                  legendLabels[name as string] ?? (name as string)
                ]}
              />
              <Legend formatter={renderLegend} />
              <Line
                type="monotone"
                dataKey="pqc"
                stroke={TREND_COLORS.pqc}
                strokeWidth={2}
                dot={nonZeroDot("pqc", TREND_COLORS.pqc, SERIES_KEYS)}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="nonPqc"
                stroke={TREND_COLORS.nonPqc}
                strokeWidth={2}
                dot={nonZeroDot("nonPqc", TREND_COLORS.nonPqc, SERIES_KEYS)}
                activeDot={{ r: 4 }}
                strokeDasharray="4 2"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </UnstableCardContent>
    </UnstableCard>
  );
};
