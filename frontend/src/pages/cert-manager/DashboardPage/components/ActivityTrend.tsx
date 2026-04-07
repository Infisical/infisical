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
  UnstableCardContent,
  UnstableCardHeader,
  UnstableCardTitle,
  UnstableEmpty,
  UnstableEmptyHeader,
  UnstableEmptyTitle
} from "@app/components/v3";
import type { TActivityTrendPoint } from "@app/hooks/api/certificates";

import { formatTickLabel, legendFormatter, nonZeroDot, TREND_COLORS } from "./chart-theme";

type Props = {
  data: TActivityTrendPoint[];
  onRangeChange: (range: string) => void;
  currentRange: string;
};

const SERIES_KEYS = ["issued", "expired", "revoked", "renewed"];

const ranges = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "6M", value: "6m" }
];

export const ActivityTrend = ({ data, onRangeChange, currentRange }: Props) => {
  const hasAnyData = data.some(
    (d) => d.issued > 0 || d.expired > 0 || d.revoked > 0 || d.renewed > 0
  );
  return (
    <UnstableCard>
      <UnstableCardHeader className="flex-row items-center gap-2">
        <UnstableCardTitle className="text-sm">Certificate Activity Trend</UnstableCardTitle>
        <div className="ml-auto flex gap-0.5 pr-5">
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
      </UnstableCardHeader>
      <UnstableCardContent>
        {!hasAnyData ? (
          <UnstableEmpty className="h-[250px]">
            <UnstableEmptyHeader>
              <UnstableEmptyTitle>No activity in this period</UnstableEmptyTitle>
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
              />
              <Legend formatter={legendFormatter} />
              <Line
                type="monotone"
                dataKey="issued"
                stroke={TREND_COLORS.issued}
                strokeWidth={2}
                dot={nonZeroDot("issued", TREND_COLORS.issued, SERIES_KEYS)}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="expired"
                stroke={TREND_COLORS.expired}
                strokeWidth={2}
                dot={nonZeroDot("expired", TREND_COLORS.expired, SERIES_KEYS)}
                activeDot={{ r: 4 }}
                strokeDasharray="4 2"
              />
              <Line
                type="monotone"
                dataKey="revoked"
                stroke={TREND_COLORS.revoked}
                strokeWidth={2}
                dot={nonZeroDot("revoked", TREND_COLORS.revoked, SERIES_KEYS)}
                activeDot={{ r: 4 }}
                strokeDasharray="6 3"
              />
              <Line
                type="monotone"
                dataKey="renewed"
                stroke={TREND_COLORS.renewed}
                strokeWidth={2}
                dot={nonZeroDot("renewed", TREND_COLORS.renewed, SERIES_KEYS)}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </UnstableCardContent>
    </UnstableCard>
  );
};
