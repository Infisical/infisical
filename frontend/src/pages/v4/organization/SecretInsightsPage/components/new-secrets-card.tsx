import { Badge, type BadgeTone } from "@infisical/cipher/ui/badge";
import { Card } from "@infisical/cipher/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent
} from "@infisical/cipher/ui/chart";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { format, parseISO } from "date-fns";
import { TrendingDownIcon, TrendingUpIcon } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Cell, XAxis, YAxis } from "recharts";

import type { TOrgStaticSecretUsage } from "@app/hooks/api/secretInsights/types";

type WeekPoint = { label: string; weekLabel: string; created: number; isPartial: boolean };

const axisTick = { fill: "var(--cipher-text2)", style: { fill: "var(--cipher-text2)" } };
const compact = new Intl.NumberFormat("en-US", { notation: "compact" });
const config: ChartConfig = { created: { label: "Secrets created", color: "var(--chart-1)" } };

const creationTrend = (weeks: TOrgStaticSecretUsage["weeks"]) => {
  const complete = weeks.filter((week) => !week.isPartial);
  if (complete.length < 3) return null;
  const [a, b, c] = complete.slice(-3).map((week) => week.totalSecrets);
  if (a < b && b < c)
    return { label: "Increasing", tone: "warn" as BadgeTone, icon: TrendingUpIcon };
  if (a > b && b > c)
    return { label: "Decreasing", tone: "ok" as BadgeTone, icon: TrendingDownIcon };
  return { label: "Steady", tone: "soft" as BadgeTone, icon: undefined };
};

export const NewSecretsCard = ({ data }: { data: TOrgStaticSecretUsage }) => {
  const weeks: WeekPoint[] = data.weeks.map((week) => ({
    label: format(parseISO(week.weekStart), "MMM d"),
    weekLabel: format(parseISO(week.weekStart), "MMMM d"),
    created: week.totalSecrets,
    isPartial: week.isPartial
  }));
  const trend = creationTrend(data.weeks);

  return (
    <Card
      variant="framed"
      title="New Secrets Created"
      hint="Secrets created across all projects, past 12 weeks."
      badges={
        trend && (
          <Badge tone={trend.tone} icon={trend.icon}>
            {trend.label}
          </Badge>
        )
      }
    >
      {weeks.length === 0 ? (
        <EmptyState
          size="sm"
          icon="key"
          title="No secrets created in the past 12 weeks"
          description="Secrets your projects create appear here, one bar per week."
        />
      ) : (
        <ChartContainer config={config} height={240} initialDimension={{ width: 640, height: 240 }}>
          <BarChart
            accessibilityLayer
            data={weeks}
            margin={{ top: 8, right: 16, bottom: 0, left: 0 }}
          >
            <CartesianGrid vertical={false} stroke="var(--cipher-line)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              minTickGap={16}
              tick={axisTick}
            />
            <YAxis
              width={44}
              allowDecimals={false}
              tickLine={false}
              axisLine={false}
              tick={axisTick}
              tickFormatter={(value: number) => compact.format(value)}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(_label, payload) => {
                    const week = payload[0]?.payload as WeekPoint | undefined;
                    if (!week) return null;
                    return `Week of ${week.weekLabel}${week.isPartial ? ", in progress" : ""}`;
                  }}
                />
              }
            />
            <Bar dataKey="created" maxBarSize={32} isAnimationActive={false}>
              {weeks.map((week) => (
                <Cell
                  key={week.label}
                  fill="var(--color-created)"
                  fillOpacity={week.isPartial ? 0.4 : 1}
                  stroke={week.isPartial ? "var(--color-created)" : undefined}
                  strokeDasharray={week.isPartial ? "3 3" : undefined}
                />
              ))}
            </Bar>
          </BarChart>
        </ChartContainer>
      )}
    </Card>
  );
};
