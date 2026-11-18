import { useState } from "react";
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
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Empty,
  EmptyHeader,
  EmptyTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@app/components/v3";
import {
  TGetSigningActivityTrendDTO,
  useGetSigningActivityTrend,
  useListSigners
} from "@app/hooks/api/signers";

import { formatTickLabel, legendFormatter, nonZeroDot, TREND_COLORS } from "./chart-theme";

type Props = {
  projectId: string;
};

const ALL_SIGNERS = "__all__";

const ranges: { label: string; value: TGetSigningActivityTrendDTO["range"] }[] = [
  { label: "7D", value: "7d" },
  { label: "30D", value: "30d" },
  { label: "6M", value: "6m" }
];

export const CodeSigningSection = ({ projectId }: Props) => {
  const { data: signersData } = useListSigners({ projectId, limit: 100 });
  const signers = signersData?.signers || [];

  const [selectedSignerId, setSelectedSignerId] = useState<string>(ALL_SIGNERS);
  const [currentRange, setCurrentRange] = useState<TGetSigningActivityTrendDTO["range"]>("30d");

  const { data: trendData = [] } = useGetSigningActivityTrend(
    {
      range: currentRange,
      signerId: selectedSignerId === ALL_SIGNERS ? undefined : selectedSignerId
    },
    { enabled: signers.length > 0 }
  );
  const hasAnyData = trendData.some((d) => d.success > 0 || d.failed > 0);

  if (signers.length === 0) {
    return null;
  }

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-2">
        <CardTitle className="text-sm">Code Signing Activity</CardTitle>
        <div className="ml-auto flex items-center gap-2 pr-5">
          <div className="flex gap-0.5">
            {ranges.map((r) => (
              <Button
                key={r.value}
                size="xs"
                variant={currentRange === r.value ? "neutral" : "ghost"}
                onClick={() => setCurrentRange(r.value)}
              >
                {r.label}
              </Button>
            ))}
          </div>
          <Select value={selectedSignerId} onValueChange={setSelectedSignerId}>
            <SelectTrigger size="sm" className="w-[160px]">
              <SelectValue placeholder="Select signer" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_SIGNERS}>All Signers</SelectItem>
              {signers.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent>
        {!hasAnyData ? (
          <Empty className="h-[250px]">
            <EmptyHeader>
              <EmptyTitle>No signing activity in this period</EmptyTitle>
            </EmptyHeader>
          </Empty>
        ) : (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={trendData} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
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
                dataKey="success"
                stroke={TREND_COLORS.renewed}
                strokeWidth={2}
                dot={nonZeroDot("success", TREND_COLORS.renewed)}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="failed"
                stroke={TREND_COLORS.expired}
                strokeWidth={2}
                dot={nonZeroDot("failed", TREND_COLORS.expired)}
                activeDot={{ r: 4 }}
                strokeDasharray="4 2"
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
};
